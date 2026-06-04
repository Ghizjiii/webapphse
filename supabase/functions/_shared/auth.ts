import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

export type AppProfileRow = {
  user_id: string;
  email: string;
  full_name: string;
  role: "admin" | "coordinator" | "department_head" | "user";
  is_active: boolean;
  region_bitrix_item_id: string | null;
  region_name: string | null;
  questionnaire_access: "own" | "all";
  bitrix_user_id: string | null;
  bitrix_user_name: string | null;
};

export function plain(value: unknown): string {
  return String(value || "").trim();
}

export function adminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role env vars are not configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getAuthenticatedUser(req: Request, supabase = adminClient()) {
  const bearerToken = plain(req.headers.get("authorization")).replace(/^Bearer\s+/i, "").trim();
  if (!bearerToken) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase.auth.getUser(bearerToken);
  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  return {
    token: bearerToken,
    user: data.user,
  };
}

export async function getAppProfile(userId: string, supabase = adminClient()): Promise<AppProfileRow> {
  const { data, error } = await supabase
    .from("app_profiles")
    .select("user_id, email, full_name, role, is_active, region_bitrix_item_id, region_name, questionnaire_access, bitrix_user_id, bitrix_user_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("App profile not found");
  }

  return data as AppProfileRow;
}

export async function requireActiveProfile(req: Request, supabase = adminClient()) {
  const auth = await getAuthenticatedUser(req, supabase);
  const profile = await getAppProfile(auth.user.id, supabase);

  if (!profile.is_active) {
    throw new Error("User is inactive");
  }

  return {
    ...auth,
    profile,
    supabase,
  };
}

export async function requireAdminProfile(req: Request, supabase = adminClient()) {
  const auth = await requireActiveProfile(req, supabase);

  if (auth.profile.role !== "admin") {
    throw new Error("Admin access is required");
  }

  return auth;
}
