import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";
import { plain, requireActiveProfile, requireAdminProfile } from "../_shared/auth.ts";

const BITRIX_WEBHOOK_URL = (Deno.env.get("BITRIX_WEBHOOK_URL") || "").replace(/\/+$/, "");

type TrashAction = "delete" | "restore";

function bitrixMethodUrl(method: string): string {
  if (!BITRIX_WEBHOOK_URL) throw new Error("BITRIX_WEBHOOK_URL is not configured");
  return `${BITRIX_WEBHOOK_URL}/${method}.json`;
}

async function callBitrix(method: string, params: Record<string, unknown>) {
  const response = await fetch(bitrixMethodUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const message = plain(payload?.error_description) || plain(payload?.error) || `Bitrix HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload?.result;
}

async function purgeOldDeletedQuestionnaires(supabase: { rpc: (fn: string) => PromiseLike<unknown> }) {
  try {
    await supabase.rpc("purge_deleted_questionnaires");
  } catch {
    // Purge is opportunistic; deletion/restore must not fail because cleanup failed.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflightResponse(req);

  const corsError = validateCorsRequest(req);
  if (corsError) return corsError;

  try {
    const body = await req.json().catch(() => ({}));
    const action = plain(body.action) as TrashAction;
    const questionnaireId = plain(body.questionnaireId);

    if (!questionnaireId) {
      return jsonResponse(req, 400, { error: "questionnaireId is required" });
    }

    if (action === "restore") {
      const auth = await requireAdminProfile(req);
      await purgeOldDeletedQuestionnaires(auth.supabase);

      const { data: questionnaire, error: fetchError } = await auth.supabase
        .from("questionnaires")
        .select("id, deleted_at, deleted_previous_is_active")
        .eq("id", questionnaireId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!questionnaire) return jsonResponse(req, 404, { error: "Questionnaire not found" });

      const { error: updateError } = await auth.supabase
        .from("questionnaires")
        .update({
          deleted_at: null,
          deleted_by: null,
          is_active: questionnaire.deleted_previous_is_active === false ? false : true,
          deleted_previous_is_active: null,
          bitrix_deal_delete_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", questionnaireId);

      if (updateError) throw updateError;

      return jsonResponse(req, 200, { ok: true, restored: true });
    }

    if (action !== "delete") {
      return jsonResponse(req, 400, { error: "Unsupported action" });
    }

    const auth = await requireActiveProfile(req);
    await purgeOldDeletedQuestionnaires(auth.supabase);

    const { data: questionnaire, error: questionnaireError } = await auth.supabase
      .from("questionnaires")
      .select("id, created_by, is_active, deleted_at")
      .eq("id", questionnaireId)
      .maybeSingle();

    if (questionnaireError) throw questionnaireError;
    if (!questionnaire) return jsonResponse(req, 404, { error: "Questionnaire not found" });

    const canDelete =
      auth.profile.role === "admin" ||
      auth.profile.questionnaire_access === "all" ||
      plain(questionnaire.created_by) === auth.user.id;

    if (!canDelete) {
      return jsonResponse(req, 403, { error: "No access to delete this questionnaire" });
    }

    if (questionnaire.deleted_at) {
      return jsonResponse(req, 200, { ok: true, alreadyDeleted: true });
    }

    const { data: deals, error: dealsError } = await auth.supabase
      .from("deals")
      .select("id, bitrix_deal_id")
      .eq("questionnaire_id", questionnaireId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (dealsError) throw dealsError;

    const bitrixDealId = plain((deals || []).find((deal: { bitrix_deal_id?: string | null }) => plain(deal.bitrix_deal_id))?.bitrix_deal_id);
    let bitrixDeletedAt: string | null = null;

    if (bitrixDealId) {
      try {
        await callBitrix("crm.deal.delete", { id: bitrixDealId });
        bitrixDeletedAt = new Date().toISOString();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete Bitrix deal";
        if (/not\s*found|does\s+not\s+exist/i.test(message)) {
          bitrixDeletedAt = new Date().toISOString();
        } else {
          await auth.supabase
            .from("questionnaires")
            .update({
              bitrix_deal_delete_error: message,
              updated_at: new Date().toISOString(),
            })
            .eq("id", questionnaireId);
          return jsonResponse(req, 502, {
            error: `Failed to delete linked Bitrix24 deal #${bitrixDealId}: ${message}`,
            bitrixDealId,
          });
        }
      }
    }

    const deletedAt = new Date().toISOString();
    const { error: updateError } = await auth.supabase
      .from("questionnaires")
      .update({
        deleted_at: deletedAt,
        deleted_by: auth.user.id,
        deleted_previous_is_active: Boolean(questionnaire.is_active),
        is_active: false,
        bitrix_deal_deleted_at: bitrixDeletedAt,
        bitrix_deal_delete_error: null,
        updated_at: deletedAt,
      })
      .eq("id", questionnaireId);

    if (updateError) throw updateError;

    return jsonResponse(req, 200, {
      ok: true,
      deletedAt,
      bitrixDealId: bitrixDealId || null,
      bitrixDealDeletedAt: bitrixDeletedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /unauthorized/i.test(message) ? 401 : /admin access/i.test(message) ? 403 : 500;
    return jsonResponse(req, status, { error: message });
  }
});

