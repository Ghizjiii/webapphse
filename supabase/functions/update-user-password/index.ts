import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return preflightResponse(req);
  }

  const corsError = validateCorsRequest(req);
  if (corsError) {
    return corsError;
  }

  try {
    const adminToken = Deno.env.get("ADMIN_API_TOKEN");
    if (!adminToken) {
      return jsonResponse(req, 500, { error: "ADMIN_API_TOKEN is not configured" });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const providedToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!providedToken || providedToken !== adminToken) {
      return jsonResponse(req, 401, { error: "Unauthorized" });
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return jsonResponse(req, 400, { error: "email and password are required" });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message.includes("already been registered") || createError.message.includes("already exists")) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const user = users?.users.find(u => u.email === email);
        if (user) {
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { password });
          if (updateError) {
            return jsonResponse(req, 400, { error: updateError.message });
          }

          return jsonResponse(req, 200, { success: true, action: "updated", userId: user.id });
        }
      }

      return jsonResponse(req, 400, { error: createError.message });
    }

    return jsonResponse(req, 200, { success: true, action: "created", userId: created.user?.id });
  } catch (e) {
    return jsonResponse(req, 500, { error: String(e) });
  }
});
