import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type CreateUserPayload = {
  email?: unknown;
  password?: unknown;
  full_name?: unknown;
  role?: unknown;
  region_bitrix_item_id?: unknown;
  region_name?: unknown;
  questionnaire_access?: unknown;
  bitrix_user_id?: unknown;
  bitrix_user_name?: unknown;
};

type SetPasswordPayload = {
  user_id?: unknown;
  password?: unknown;
};

type UpdateUserPayload = {
  user_id?: unknown;
  email?: unknown;
  full_name?: unknown;
  role?: unknown;
  is_active?: unknown;
  region_bitrix_item_id?: unknown;
  region_name?: unknown;
  questionnaire_access?: unknown;
  bitrix_user_id?: unknown;
  bitrix_user_name?: unknown;
};

type AppProfileRow = {
  user_id: string;
  role: "admin" | "coordinator" | "department_head" | "user";
  is_active: boolean;
};

type AuthUserRow = {
  id: string;
  email?: string | null;
};

const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization, X-Client-Info, Apikey";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";

function plain(value: unknown): string {
  return String(value || "").trim();
}

type AppRole = "admin" | "coordinator" | "department_head" | "user";
type QuestionnaireAccessScope = "own" | "all";

function normalizeRole(value: unknown): AppRole {
  const role = plain(value).toLowerCase();
  if (role === "admin" || role === "coordinator" || role === "department_head" || role === "user") {
    return role;
  }
  return "user";
}

function normalizeQuestionnaireAccess(value: unknown, role: AppRole): QuestionnaireAccessScope {
  if (role === "admin") return "all";

  const access = plain(value).toLowerCase();
  if (access === "all" || access === "own") return access;
  return "own";
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

async function findAuthUserByEmail(email: string, supabase = adminClient()): Promise<AuthUserRow | null> {
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) {
      throw new Error(error.message);
    }

    const match = (data.users || []).find(user => plain(user.email).toLowerCase() === email);
    if (match) {
      return {
        id: match.id,
        email: match.email,
      };
    }

    if (!data.users || data.users.length < 200) {
      break;
    }

    page += 1;
  }

  return null;
}

async function upsertAppProfile(params: {
  userId: string;
  email: string;
  fullName: string;
  role: AppRole;
  regionBitrixItemId: string;
  regionName: string;
  questionnaireAccess: QuestionnaireAccessScope;
  bitrixUserId: string;
  bitrixUserName: string;
  isActive?: boolean;
}, supabase = adminClient()) {
  const { error } = await supabase
    .from("app_profiles")
    .upsert({
      user_id: params.userId,
      email: params.email,
      full_name: params.fullName,
      role: params.role,
      is_active: params.isActive ?? true,
      region_bitrix_item_id: params.regionBitrixItemId || "",
      region_name: params.regionName || "",
      questionnaire_access: params.questionnaireAccess,
      bitrix_user_id: params.bitrixUserId || "",
      bitrix_user_name: params.bitrixUserName || "",
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(error.message);
  }
}

async function createUser(body: CreateUserPayload) {
  const supabase = adminClient();
  const email = plain(body.email).toLowerCase();
  const password = plain(body.password);
  const fullName = plain(body.full_name);
  const role = normalizeRole(body.role);
  const questionnaireAccess = normalizeQuestionnaireAccess(body.questionnaire_access, role);
  const regionBitrixItemId = plain(body.region_bitrix_item_id);
  const regionName = plain(body.region_name);
  const bitrixUserId = plain(body.bitrix_user_id);
  const bitrixUserName = plain(body.bitrix_user_name);

  if (!email || !password) {
    throw new Error("email and password are required");
  }

  let userId = "";
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (createError || !created.user) {
    const duplicateEmail = /already been registered|already exists|duplicate/i.test(createError?.message || "");

    if (!duplicateEmail) {
      throw new Error(createError?.message || "Failed to create user");
    }

    const existingUser = await findAuthUserByEmail(email, supabase);
    if (!existingUser) {
      throw new Error(createError?.message || "Failed to create user");
    }

    userId = existingUser.id;

    const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      user_metadata: fullName ? { full_name: fullName } : {},
    });

    if (updateError) {
      throw new Error(updateError.message);
    }
  } else {
    userId = created.user.id;
  }

  await upsertAppProfile({
    userId,
    email,
    fullName,
    role,
    isActive: true,
    regionBitrixItemId,
    regionName,
    questionnaireAccess,
    bitrixUserId,
    bitrixUserName,
  }, supabase);

  return {
    ok: true,
    action: "create-user",
    user_id: userId,
  };
}

async function setPassword(body: SetPasswordPayload) {
  const supabase = adminClient();
  const userId = plain(body.user_id);
  const password = plain(body.password);

  if (!userId || !password) {
    throw new Error("user_id and password are required");
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    ok: true,
    action: "set-password",
    user_id: userId,
  };
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  const raw = plain(value).toLowerCase();
  if (!raw) return fallback;
  if (["true", "1", "yes", "y"].includes(raw)) return true;
  if (["false", "0", "no", "n"].includes(raw)) return false;
  return fallback;
}

async function updateUser(body: UpdateUserPayload) {
  const supabase = adminClient();
  const userId = plain(body.user_id);
  const email = plain(body.email).toLowerCase();
  const fullName = plain(body.full_name);
  const role = normalizeRole(body.role);
  const isActive = normalizeBoolean(body.is_active, true);
  const questionnaireAccess = normalizeQuestionnaireAccess(body.questionnaire_access, role);
  const regionBitrixItemId = plain(body.region_bitrix_item_id);
  const regionName = plain(body.region_name);
  const bitrixUserId = plain(body.bitrix_user_id);
  const bitrixUserName = plain(body.bitrix_user_name);

  if (!userId || !email) {
    throw new Error("user_id and email are required");
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
    email,
    user_metadata: fullName ? { full_name: fullName } : {},
  });

  if (authError) {
    throw new Error(authError.message);
  }

  await upsertAppProfile({
    userId,
    email,
    fullName,
    role,
    isActive,
    regionBitrixItemId,
    regionName,
    questionnaireAccess,
    bitrixUserId,
    bitrixUserName,
  }, supabase);

  return {
    ok: true,
    action: "update-user",
    user_id: userId,
  };
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
    await requireAdminProfile(req);
    const body = await req.json();
    const action = plain(body?.action);

    if (action === "create-user") {
      const result = await createUser(body as CreateUserPayload);
      return jsonResponse(req, 200, result);
    }

    if (action === "set-password") {
      const result = await setPassword(body as SetPasswordPayload);
      return jsonResponse(req, 200, result);
    }

    if (action === "update-user") {
      const result = await updateUser(body as UpdateUserPayload);
      return jsonResponse(req, 200, result);
    }

    return jsonResponse(req, 400, { error: "Unknown action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown error");
    const status = /unauthorized|admin access/i.test(message) ? 401 : 400;
    return jsonResponse(req, status, { error: message });
  }
});
