import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BITRIX_WEBHOOK_URL = (Deno.env.get("BITRIX_WEBHOOK_URL") || Deno.env.get("BITRIX_WEBHOOK") || "").replace(/\/+$/, "");
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization, X-Client-Info, Apikey";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";

type PlainObject = Record<string, unknown>;

type AppProfileRow = {
  user_id: string;
  role: "admin" | "coordinator" | "department_head" | "user";
  is_active: boolean;
};

function plain(value: unknown): string {
  return String(value || "").trim();
}

function normalizeOriginRule(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  return trimmed.replace(/\/+$/, "");
}

function configuredOrigins(envValue: string): string[] {
  return String(envValue || "")
    .split(",")
    .map(value => normalizeOriginRule(value))
    .filter(Boolean);
}

function fallbackAllowedOrigin(configured: string[]): string {
  const firstExact = configured.find(value => value && !value.includes("*"));
  return firstExact || "*";
}

function isOriginRuleMatch(requestOrigin: string, rule: string): boolean {
  const normalizedRequestOrigin = normalizeOriginRule(requestOrigin);
  const normalizedRule = normalizeOriginRule(rule);

  if (!normalizedRequestOrigin || !normalizedRule) return false;
  if (normalizedRule === "*") return true;
  if (normalizedRule === normalizedRequestOrigin) return true;
  if (!normalizedRule.includes("*")) return false;

  try {
    const requestUrl = new URL(normalizedRequestOrigin);
    const hasScheme = normalizedRule.includes("://");
    const protocolPrefix = hasScheme ? `${requestUrl.protocol}//` : "";
    const hostPattern = hasScheme ? normalizedRule.split("://")[1] : normalizedRule;
    const normalizedHostPattern = hostPattern.startsWith("*.") ? hostPattern.slice(2) : hostPattern;

    if (!normalizedHostPattern) return false;
    if (hasScheme && !normalizedRule.startsWith(protocolPrefix)) return false;

    return (
      requestUrl.hostname === normalizedHostPattern ||
      requestUrl.hostname.endsWith(`.${normalizedHostPattern}`)
    );
  } catch {
    return false;
  }
}

function resolveAllowedOrigin(requestOrigin: string, envValue = Deno.env.get("ALLOWED_ORIGIN") || ""): string {
  const normalizedRequestOrigin = normalizeOriginRule(requestOrigin);
  const configured = configuredOrigins(envValue);

  if (configured.length === 0) return normalizedRequestOrigin || "*";
  if (normalizedRequestOrigin && configured.some(rule => isOriginRuleMatch(normalizedRequestOrigin, rule))) {
    return normalizedRequestOrigin;
  }

  return fallbackAllowedOrigin(configured);
}

function isOriginAllowed(requestOrigin: string, envValue = Deno.env.get("ALLOWED_ORIGIN") || ""): boolean {
  const configured = configuredOrigins(envValue);
  if (configured.length === 0) return false;
  return configured.some(rule => isOriginRuleMatch(requestOrigin, rule));
}

function corsHeaders(req: Request, extraHeaders: Record<string, string> = {}): Record<string, string> {
  const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGIN") || "";
  const requestOrigin = req.headers.get("origin") || "";

  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(requestOrigin, allowedOriginEnv),
    "Access-Control-Allow-Methods": DEFAULT_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    Vary: "Origin",
    ...extraHeaders,
  };
}

function jsonResponse(req: Request, status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "application/json",
    },
  });
}

function preflightResponse(req: Request): Response {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(req),
  });
}

function validateCorsRequest(req: Request): Response | null {
  const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGIN") || "";
  if (!allowedOriginEnv) {
    return jsonResponse(req, 500, { error: "ALLOWED_ORIGIN is not configured" });
  }

  const requestOrigin = req.headers.get("origin") || "";
  if (requestOrigin && !isOriginAllowed(requestOrigin, allowedOriginEnv)) {
    return jsonResponse(req, 403, { error: "Origin is not allowed" });
  }

  return null;
}

function adminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role env vars are not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getAuthenticatedUser(req: Request, supabase = adminClient()) {
  const bearerToken = plain(req.headers.get("authorization")).replace(/^Bearer\s+/i, "").trim();
  if (!bearerToken) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase.auth.getUser(bearerToken);
  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  return data.user;
}

async function getAppProfile(userId: string, supabase = adminClient()): Promise<AppProfileRow> {
  const { data, error } = await supabase
    .from("app_profiles")
    .select("user_id, role, is_active")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("App profile not found");
  }

  return data as AppProfileRow;
}

async function requireAdminProfile(req: Request) {
  const supabase = adminClient();
  const user = await getAuthenticatedUser(req, supabase);
  const profile = await getAppProfile(user.id, supabase);

  if (!profile.is_active) {
    throw new Error("User is inactive");
  }
  if (profile.role !== "admin") {
    throw new Error("Admin access is required");
  }

  return { supabase, user, profile };
}

function toPlainObject(value: unknown): PlainObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PlainObject
    : {};
}

function extractRows(payload: unknown): PlainObject[] {
  if (Array.isArray(payload)) return payload as PlainObject[];
  const wrapped = toPlainObject(payload);
  if (Array.isArray(wrapped.result)) return wrapped.result as PlainObject[];
  if (Array.isArray(wrapped.items)) return wrapped.items as PlainObject[];
  return [];
}

async function callBitrix(method: string, params: PlainObject): Promise<unknown> {
  if (!BITRIX_WEBHOOK_URL) {
    throw new Error("BITRIX_WEBHOOK_URL is not configured");
  }

  const response = await fetch(`${BITRIX_WEBHOOK_URL}/${method}.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  const text = await response.text();
  const body = text ? toPlainObject(JSON.parse(text)) : {};

  if (!response.ok) {
    throw new Error(`Bitrix HTTP ${response.status}: ${text || "empty response"}`);
  }

  if (body.error) {
    throw new Error(plain(body.error_description || body.error));
  }

  return body.result;
}

function employeeFullName(row: PlainObject): string {
  return [
    plain(row.LAST_NAME || row.last_name),
    plain(row.NAME || row.name),
    plain(row.SECOND_NAME || row.second_name),
  ]
    .filter(Boolean)
    .join(" ");
}

function departmentIds(row: PlainObject): number[] {
  const raw = row.UF_DEPARTMENT || row.uf_department;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0);
}

async function fetchEmployees() {
  const allRows: PlainObject[] = [];
  const batchSize = 50;
  const maxPages = 200;

  for (let page = 0; page < maxPages; page += 1) {
    const start = page * batchSize;
    const result = await callBitrix("user.get", {
      SORT_BY: "ID",
      SORT_ORDER: "ASC",
      start,
    });
    const rows = extractRows(result);
    if (rows.length === 0) break;
    allRows.push(...rows);
    if (rows.length < batchSize) break;
  }

  return allRows
    .filter(row => {
      const userType = plain(row.USER_TYPE || row.user_type).toLowerCase();
      if (!userType) return true;
      return userType === "employee";
    })
    .map(row => ({
      bitrix_user_id: plain(row.ID || row.id),
      email: plain(row.EMAIL || row.email).toLowerCase(),
      full_name: employeeFullName(row),
      active: plain(row.ACTIVE || row.active).toUpperCase() !== "N",
      work_position: plain(row.WORK_POSITION || row.work_position) || "",
      department_ids: departmentIds(row),
      raw_payload: row,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))
    .filter(row => row.bitrix_user_id);
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

  try {
    const { supabase } = await requireAdminProfile(req);
    const employees = await fetchEmployees();

    if (employees.length > 0) {
      const { error } = await supabase
        .from("bitrix_employees")
        .upsert(employees, { onConflict: "bitrix_user_id" });

      if (error) {
        throw new Error(error.message);
      }
    }

    return jsonResponse(req, 200, {
      ok: true,
      count: employees.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    const status = /unauthorized|admin access/i.test(message) ? 401 : 400;
    return jsonResponse(req, status, { error: message });
  }
});
