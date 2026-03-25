import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function normalizeDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function normalizeNumber(value: string): string {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/g, "");
  if (!cleaned) return "";
  if (/^\d+$/.test(cleaned)) return String(Number(cleaned));
  return cleaned;
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
      company_bin?: string;
      payment_order_number?: string;
      payment_order_date?: string;
      payment_order_amount?: number | string;
      questionnaire_id?: string;
    };

    const companyBinDigits = normalizeDigits(body.company_bin || "");
    const paymentOrderNumberNorm = normalizeNumber(body.payment_order_number || "");
    const paymentOrderDate = String(body.payment_order_date || "").trim();
    const amountRaw = typeof body.payment_order_amount === "number"
      ? body.payment_order_amount
      : Number(String(body.payment_order_amount || "").replace(",", "."));
    const paymentOrderAmount = Number.isFinite(amountRaw) ? Math.round(amountRaw * 100) / 100 : NaN;
    const questionnaireId = String(body.questionnaire_id || "").trim();

    if (!companyBinDigits || !paymentOrderNumberNorm || !paymentOrderDate || !Number.isFinite(paymentOrderAmount)) {
      return jsonResponse(req, 400, {
        error: "company_bin, payment_order_number, payment_order_date, payment_order_amount are required",
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let query = sb
      .from("payment_order_registry")
      .select("questionnaire_id")
      .eq("company_bin_digits", companyBinDigits)
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
