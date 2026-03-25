import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const paymentOrdersBucket = Deno.env.get("PAYMENT_ORDERS_BUCKET") || "payment-orders";

const CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
const API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";

async function sha1Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-1", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

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

    if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
      return jsonResponse(req, 500, { error: "Cloudinary env vars are not configured" });
    }

    if (isPdf) {
      return jsonResponse(req, 400, {
        error: "PDF не загружается в Cloudinary. Используйте mode=payment_order (Supabase Storage).",
      });
    }

    const timestamp = Math.round(Date.now() / 1000).toString();
    const paramsToSign = `folder=${folder}&timestamp=${timestamp}${API_SECRET}`;
    const signature = await sha1Hex(paramsToSign);

    const uploadForm = new FormData();
    uploadForm.append("file", file);
    uploadForm.append("folder", folder);
    uploadForm.append("timestamp", timestamp);
    uploadForm.append("api_key", API_KEY);
    uploadForm.append("signature", signature);

    const resourceType = contentType.startsWith("image/") ? "image" : "raw";
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      { method: "POST", body: uploadForm },
    );

    const data = await response.json();
    if (!response.ok || data.error) {
      return jsonResponse(req, 500, { error: data.error?.message || "Upload failed" });
    }

    return jsonResponse(req, 200, { secure_url: data.secure_url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse(req, 500, { error: msg });
  }
});
