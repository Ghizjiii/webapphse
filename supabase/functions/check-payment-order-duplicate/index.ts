import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function normalizeNumber(value: string): string {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/g, "");
  if (!cleaned) return "";
  if (/^\d+$/.test(cleaned)) return String(Number(cleaned));
  return cleaned;
}

function normalizeDate(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  const dmy = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  const match = iso || dmy;
  if (!match) return raw;

  const year = Number(iso ? match[1] : match[3]);
  const month = Number(iso ? match[2] : match[2]);
  const day = Number(iso ? match[3] : match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return raw;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeAmount(value: number | string | undefined): number {
  let raw = typeof value === "number" ? String(value) : String(value || "");
  raw = raw.replace(/\s+/g, "").replace(/[^\d.,]/g, "");
  if (!raw) return NaN;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    raw = raw.replace(new RegExp(`\\${thousandsSeparator}`, "g"), "").replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    raw = raw.replace(",", ".");
  } else if ((raw.match(/\./g) || []).length > 1) {
    const lastSeparator = raw.lastIndexOf(".");
    raw = `${raw.slice(0, lastSeparator).replace(/\./g, "")}.${raw.slice(lastSeparator + 1)}`;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : NaN;
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

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse(req, 500, { error: "Supabase env vars are not configured" });
  }

  try {
    const body = await req.json() as {
      payment_order_number?: string;
      payment_order_date?: string;
      payment_order_amount?: number | string;
      questionnaire_id?: string;
    };

    const paymentOrderNumberNorm = normalizeNumber(body.payment_order_number || "");
    const paymentOrderDate = normalizeDate(body.payment_order_date || "");
    const paymentOrderAmount = normalizeAmount(body.payment_order_amount);
    const questionnaireId = String(body.questionnaire_id || "").trim();

    if (!paymentOrderNumberNorm || !paymentOrderDate || !Number.isFinite(paymentOrderAmount)) {
      return jsonResponse(req, 400, {
        error: "payment_order_number, payment_order_date, payment_order_amount are required",
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = sb
      .from("payment_order_registry")
      .select("questionnaire_id")
      .eq("payment_order_number_norm", paymentOrderNumberNorm)
      .eq("payment_order_date", paymentOrderDate)
      .eq("payment_order_amount", paymentOrderAmount)
      .limit(1);

    if (questionnaireId) {
      query = query.neq("questionnaire_id", questionnaireId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      return jsonResponse(req, 500, { error: error.message || "Failed to query payment registry" });
    }

    return jsonResponse(req, 200, {
      duplicate: Boolean(data),
      matched_questionnaire_id: data?.questionnaire_id || "",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(req, 500, { error: msg });
  }
});
