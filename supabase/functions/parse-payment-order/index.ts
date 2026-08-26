import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";

const OCR_API_URL = String(Deno.env.get("PAYMENT_OCR_API_URL") || "").trim().replace(/\/+$/, "");
const OCR_API_TOKEN = String(Deno.env.get("PAYMENT_OCR_API_TOKEN") || "").trim();
const LOCAL_OCR_API_URL = String(Deno.env.get("LOCAL_PAYMENT_OCR_API_URL") || "http://ocr-api:8000").trim().replace(/\/+$/, "");

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

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map(item => String(item ?? "").trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is Record<string, unknown> => (
    item !== null && typeof item === "object" && !Array.isArray(item)
  ));
  return items.length > 0 ? items : undefined;
}

function getRecordValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
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

    const fileBytes = await file.arrayBuffer();

    async function callUpstream(path: string, headers: Record<string, string>) {
      const upstreamFormData = new FormData();
      upstreamFormData.append(
        "file",
        new File([fileBytes], file.name || "payment-order", {
          type: file.type || "application/octet-stream",
        }),
      );

      return await fetch(`${OCR_API_URL}${path}`, {
        method: "POST",
        headers,
        body: upstreamFormData,
      });
    }

    let upstreamResponse = await callUpstream("/parse-payment", {
      Authorization: `Bearer ${OCR_API_TOKEN}`,
    });

    if ([401, 403, 404, 405].includes(upstreamResponse.status)) {
      upstreamResponse = await callUpstream("/extract-payment-order", {
        "x-ocr-token": OCR_API_TOKEN,
      });
    }

    if ([401, 403, 404, 405].includes(upstreamResponse.status) && LOCAL_OCR_API_URL) {
      const localFormData = new FormData();
      localFormData.append(
        "file",
        new File([fileBytes], file.name || "payment-order", {
          type: file.type || "application/octet-stream",
        }),
      );

      upstreamResponse = await fetch(`${LOCAL_OCR_API_URL}/extract-payment-order`, {
        method: "POST",
        body: localFormData,
      });
    }

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
    const extracted = parsed.extracted && typeof parsed.extracted === "object"
      ? parsed.extracted as Record<string, unknown>
      : parsed;

    return jsonResponse(req, 200, {
      ok: true,
      source: asTrimmedString(parsed.source),
      filename: asTrimmedString(parsed.filename) || file.name || "payment-order",
      extracted: {
        payment_order_number: asTrimmedString(getRecordValue(extracted, ["payment_order_number", "payment_number"])),
        payment_order_date: asTrimmedString(getRecordValue(extracted, ["payment_order_date", "payment_date"])),
        payment_order_amount: asTrimmedString(getRecordValue(extracted, ["payment_order_amount", "amount"])),
        payment_order_bin_iin: asTrimmedString(getRecordValue(extracted, ["payment_order_bin_iin", "payer_bin"])),
        payment_order_payer_name: asTrimmedString(getRecordValue(extracted, ["payment_order_payer_name", "payer_name"])),
        payment_order_beneficiary_valid: asBoolean(getRecordValue(extracted, ["payment_order_beneficiary_valid", "beneficiary_valid"])),
        payment_order_beneficiary_bin: asTrimmedString(getRecordValue(extracted, ["payment_order_beneficiary_bin", "beneficiary_bin"])),
        payment_order_beneficiary_account: asTrimmedString(getRecordValue(extracted, ["payment_order_beneficiary_account", "beneficiary_account"])),
        payment_order_beneficiary_name: asTrimmedString(getRecordValue(extracted, ["payment_order_beneficiary_name", "beneficiary_name"])),
        payment_order_beneficiary_bin_matched: asBoolean(getRecordValue(extracted, ["payment_order_beneficiary_bin_matched", "beneficiary_bin_matched"])),
        payment_order_beneficiary_account_matched: asBoolean(getRecordValue(extracted, ["payment_order_beneficiary_account_matched", "beneficiary_account_matched"])),
        payment_order_beneficiary_reason: asTrimmedString(getRecordValue(extracted, ["payment_order_beneficiary_reason", "beneficiary_reason"])),
        payment_order_detected_bins: asStringArray(getRecordValue(extracted, ["payment_order_detected_bins", "detected_bins"])),
        payment_order_detected_accounts: asStringArray(getRecordValue(extracted, ["payment_order_detected_accounts", "detected_accounts"])),
        payment_order_beneficiary_checks: asRecordArray(getRecordValue(extracted, ["payment_order_beneficiary_checks", "beneficiary_checks"])),
        payment_order_accepted_beneficiaries: asRecordArray(getRecordValue(extracted, ["payment_order_accepted_beneficiaries", "accepted_beneficiaries"])),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown OCR proxy error";
    return jsonResponse(req, 500, { error: message });
  }
});
