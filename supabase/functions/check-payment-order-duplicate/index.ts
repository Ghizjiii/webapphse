import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGIN") || "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function normalizeOriginRule(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  return trimmed.replace(/\/+$/, "");
}

function isOriginRuleMatch(requestOrigin: string, rule: string): boolean {
  const normalizedRequestOrigin = normalizeOriginRule(requestOrigin);
  const normalizedRule = normalizeOriginRule(rule);

  if (!normalizedRequestOrigin || !normalizedRule) return false;
  if (normalizedRule === "*") return true;
  if (normalizedRule === normalizedRequestOrigin) return true;

  if (!normalizedRule.includes("*")) return false;

  try {
    const req = new URL(normalizedRequestOrigin);
    const hasScheme = normalizedRule.includes("://");
    const protocolPrefix = hasScheme ? `${req.protocol}//` : "";
    const hostPattern = hasScheme ? normalizedRule.split("://")[1] : normalizedRule;
    const normalizedHostPattern = hostPattern.startsWith("*.") ? hostPattern.slice(2) : hostPattern;

    if (!normalizedHostPattern) return false;
    if (hasScheme && !normalizedRule.startsWith(protocolPrefix)) return false;

    return req.hostname === normalizedHostPattern || req.hostname.endsWith(`.${normalizedHostPattern}`);
  } catch {
    return false;
  }
}

function fallbackAllowedOrigin(configured: string[]): string {
  const firstExact = configured.find(v => v && !v.includes("*"));
  return firstExact || "*";
}

function resolveAllowedOrigin(requestOrigin: string): string {
  const request = normalizeOriginRule(requestOrigin);
  const configured = String(allowedOriginEnv || "")
    .split(",")
    .map(v => normalizeOriginRule(v))
    .filter(Boolean);

  if (configured.length === 0) return request || "*";
  if (request && configured.some(rule => isOriginRuleMatch(request, rule))) return request;
  return fallbackAllowedOrigin(configured);
}

function corsHeadersFor(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(req.headers.get("origin") || ""),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

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
  const headers = corsHeadersFor(req);

  if (!allowedOriginEnv) {
    return new Response(JSON.stringify({ error: "ALLOWED_ORIGIN is not configured" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase env vars are not configured" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
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
      return new Response(JSON.stringify({ error: "company_bin, payment_order_number, payment_order_date, payment_order_amount are required" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ error: error.message || "Failed to query payment registry" }), {
        status: 500,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      duplicate: Boolean(data),
      matched_questionnaire_id: data?.questionnaire_id || "",
    }), {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
