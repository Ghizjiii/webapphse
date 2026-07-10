import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const paymentOrdersBucket = Deno.env.get("PAYMENT_ORDERS_BUCKET") || "payment-orders";
const participantPhotosBucket = Deno.env.get("PARTICIPANT_PHOTOS_BUCKET") || "participant-photos";

function isBucketNotFoundError(message: string): boolean {
  const m = String(message || "").toLowerCase();
  return m.includes("bucket not found") || m.includes("not found");
}

function isSupportedPaymentOrderFile(contentType: string, fileName: string): boolean {
  const ct = String(contentType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  const isPdf = ct === "application/pdf" || name.endsWith(".pdf");
  const isImage =
    ct.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp") ||
    name.endsWith(".bmp") ||
    name.endsWith(".tif") ||
    name.endsWith(".tiff");
  return isPdf || isImage;
}

function isSupportedParticipantPhoto(contentType: string, fileName: string): boolean {
  const ct = String(contentType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  return (
    ct.startsWith("image/") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp")
  );
}

function resolvePaymentOrderContentType(contentType: string, fileName: string): string {
  const ct = String(contentType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  if (ct) return ct;
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".bmp")) return "image/bmp";
  if (name.endsWith(".tif") || name.endsWith(".tiff")) return "image/tiff";
  return "application/octet-stream";
}

function resolveParticipantPhotoContentType(contentType: string, fileName: string): string {
  const ct = String(contentType || "").toLowerCase();
  const name = String(fileName || "").toLowerCase();
  if (ct.startsWith("image/")) return ct;
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function safePathPart(value: string, fallback: string): string {
  const safe = String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9._/-]+/g, "_")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return safe || fallback;
}

function safeFileName(fileName: string, fallback: string): string {
  const safe = String(fileName || "")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || fallback;
}

function publicStorageUrl(req: Request, bucket: string, objectPath: string): string {
  const configuredOrigin =
    Deno.env.get("PUBLIC_SUPABASE_URL") ||
    Deno.env.get("SUPABASE_PUBLIC_URL") ||
    Deno.env.get("EXTERNAL_SUPABASE_URL") ||
    "";
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  const forwardedHost = req.headers.get("x-forwarded-host") || "";
  const forwardedOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : "";
  const origin = (configuredOrigin || forwardedOrigin || new URL(req.url).origin).replace(/\/+$/, "");
  return `${origin}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/")}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return preflightResponse(req);
  }

  const corsError = validateCorsRequest(req);
  if (corsError) {
    return corsError;
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = String(formData.get("folder") || "hse-participants").trim();
    const mode = String(formData.get("mode") || "").trim().toLowerCase();

    if (!file) {
      return jsonResponse(req, 400, { error: "No file provided" });
    }

    const fileName = String(file.name || "").toLowerCase();
    const contentType = String(file.type || "").toLowerCase();
    const isPdf = contentType === "application/pdf" || fileName.endsWith(".pdf");
    const isPaymentOrderUpload = mode === "payment_order" || folder === "hse-payment-orders";

    if (isPaymentOrderUpload) {
      if (!supabaseUrl || !supabaseServiceRoleKey) {
        return jsonResponse(req, 500, { error: "Supabase env vars are not configured for payment orders" });
      }

      if (!isSupportedPaymentOrderFile(contentType, fileName)) {
        return jsonResponse(req, 400, { error: "Платежное поручение принимается только в форматах PDF/JPG/PNG" });
      }

      const uploadContentType = resolvePaymentOrderContentType(contentType, fileName);
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
      const objectPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}_${safeName}`;
      const bytes = new Uint8Array(await file.arrayBuffer());

      const sb = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      let { error: uploadError } = await sb.storage.from(paymentOrdersBucket).upload(objectPath, bytes, {
        contentType: uploadContentType,
        upsert: false,
      });

      if (uploadError && isBucketNotFoundError(uploadError.message || "")) {
        const { error: createBucketError } = await sb.storage.createBucket(paymentOrdersBucket, {
          public: false,
          fileSizeLimit: "20MB",
          allowedMimeTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/bmp",
            "image/tiff",
          ],
        });

        if (!createBucketError) {
          const retry = await sb.storage.from(paymentOrdersBucket).upload(objectPath, bytes, {
            contentType: uploadContentType,
            upsert: false,
          });
          uploadError = retry.error;
        }
      }

      if (uploadError) {
        return jsonResponse(req, 500, {
          error: uploadError.message || "Storage upload failed",
          bucket: paymentOrdersBucket,
        });
      }

      const { data: signed, error: signedError } = await sb.storage
        .from(paymentOrdersBucket)
        .createSignedUrl(objectPath, 60 * 60 * 24 * 14);

      if (signedError) {
        return jsonResponse(req, 500, { error: signedError.message || "Failed to create signed URL" });
      }

      return jsonResponse(req, 200, {
        secure_url: signed?.signedUrl || "",
        storage_bucket: paymentOrdersBucket,
        storage_path: objectPath,
      });
    }

    if (isPdf) {
      return jsonResponse(req, 400, {
        error: "PDF не загружается как фото участника. Используйте mode=payment_order для платежного поручения.",
      });
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(req, 500, { error: "Supabase env vars are not configured for participant photos" });
    }

    if (!isSupportedParticipantPhoto(contentType, fileName)) {
      return jsonResponse(req, 400, { error: "Фото участника принимается только в форматах JPG/PNG/WebP" });
    }

    const uploadContentType = resolveParticipantPhotoContentType(contentType, fileName);
    const objectFolder = safePathPart(folder, "hse-participants");
    const objectName = safeFileName(fileName, `participant-photo-${Date.now()}.jpg`);
    const objectPath = `${objectFolder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}_${objectName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const sb = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let { error: uploadError } = await sb.storage.from(participantPhotosBucket).upload(objectPath, bytes, {
      contentType: uploadContentType,
      upsert: false,
    });

    if (uploadError && isBucketNotFoundError(uploadError.message || "")) {
      const { error: createBucketError } = await sb.storage.createBucket(participantPhotosBucket, {
        public: true,
        fileSizeLimit: "10MB",
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      });

      if (!createBucketError) {
        const retry = await sb.storage.from(participantPhotosBucket).upload(objectPath, bytes, {
          contentType: uploadContentType,
          upsert: false,
        });
        uploadError = retry.error;
      }
    }

    if (uploadError) {
      return jsonResponse(req, 500, {
        error: uploadError.message || "Storage upload failed",
        bucket: participantPhotosBucket,
      });
    }

    return jsonResponse(req, 200, {
      secure_url: publicStorageUrl(req, participantPhotosBucket, objectPath),
      storage_bucket: participantPhotosBucket,
      storage_path: objectPath,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(req, 500, { error: msg });
  }
});
