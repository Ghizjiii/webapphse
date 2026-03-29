import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";

const OCR_API_URL = String(Deno.env.get("PAYMENT_OCR_API_URL") || "").trim().replace(/\/+$/, "");
const OCR_API_TOKEN = String(Deno.env.get("PAYMENT_OCR_API_TOKEN") || "").trim();

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const detail = String(record.detail || record.error || record.message || "").trim();
    if (detail) return detail;
  }

  return fallback;
}

function asTrimmedString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return preflightResponse(req);
  }

  const corsError = validateCorsRequest(req);
  if (corsError) {
    return corsError;
  }

  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "Method not allowed" });
  }

  if (!OCR_API_URL) {
    return jsonResponse(req, 500, { error: "PAYMENT_OCR_API_URL is not configured" });
  }

  if (!OCR_API_TOKEN) {
    return jsonResponse(req, 500, { error: "PAYMENT_OCR_API_TOKEN is not configured" });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonResponse(req, 400, { error: "No file provided" });
    }

    const upstreamFormData = new FormData();
    upstreamFormData.append(
      "file",
      new File([await file.arrayBuffer()], file.name || "payment-order", {
        type: file.type || "application/octet-stream",
      }),
    );

    const upstreamResponse = await fetch(`${OCR_API_URL}/parse-payment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OCR_API_TOKEN}`,
      },
      body: upstreamFormData,
    });

    const upstreamText = await upstreamResponse.text();
    let upstreamPayload: unknown = null;

    try {
      upstreamPayload = upstreamText ? JSON.parse(upstreamText) : null;
    } catch {
      upstreamPayload = null;
    }

    if (!upstreamResponse.ok) {
      return jsonResponse(req, upstreamResponse.status, {
        error: extractErrorMessage(
          upstreamPayload,
          upstreamText || `OCR request failed with HTTP ${upstreamResponse.status}`,
        ),
      });
    }

    if (!upstreamPayload || typeof upstreamPayload !== "object") {
      return jsonResponse(req, 502, { error: "OCR service returned an invalid response" });
    }

    const parsed = upstreamPayload as Record<string, unknown>;

    return jsonResponse(req, 200, {
      ok: true,
      source: asTrimmedString(parsed.source),
      filename: asTrimmedString(parsed.filename) || file.name || "payment-order",
      extracted: {
        payment_order_number: asTrimmedString(parsed.payment_number),
        payment_order_date: asTrimmedString(parsed.payment_date),
        payment_order_amount: asTrimmedString(parsed.amount),
        payment_order_bin_iin: asTrimmedString(parsed.payer_bin),
        payment_order_payer_name: asTrimmedString(parsed.payer_name),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OCR proxy error";
    return jsonResponse(req, 500, { error: message });
  }
});
