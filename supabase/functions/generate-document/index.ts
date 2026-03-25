import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, preflightResponse, validateCorsRequest } from "../_shared/cors.ts";

const googleScriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL") || "";
const googleScriptToken = Deno.env.get("GOOGLE_APPS_SCRIPT_TOKEN") || "";

type GenerateBody = {
  templateKey: string;
  templateName?: string;
  docType?: "certificate" | "id_card";
  fileName: string;
  placeholders?: Record<string, string>;
  photoUrl?: string;
  items?: Array<{
    placeholders: Record<string, string>;
    photoUrl?: string;
  }>;
};

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

  if (!googleScriptUrl) {
    return jsonResponse(req, 500, { error: "GOOGLE_APPS_SCRIPT_URL is not configured" });
  }

  try {
    const body = await req.json() as GenerateBody;

    const hasSinglePlaceholders = !!body.placeholders && typeof body.placeholders === "object";
    const hasItems = Array.isArray(body.items) && body.items.length > 0;
    if (!body.templateKey || !body.fileName || (!hasSinglePlaceholders && !hasItems)) {
      return jsonResponse(req, 400, {
        error: "templateKey, fileName and placeholders or items[] are required",
      });
    }

    const payload = {
      token: googleScriptToken || undefined,
      templateKey: body.templateKey,
      templateName: body.templateName || "",
      docType: body.docType || "",
      fileName: body.fileName,
      placeholders: hasSinglePlaceholders ? body.placeholders : {},
      photoUrl: body.photoUrl || "",
      items: hasItems ? body.items : [],
    };

    const upstream = await fetch(googleScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const rawText = await upstream.text();
    let upstreamJson: Record<string, unknown> = {};
    try {
      upstreamJson = rawText ? JSON.parse(rawText) as Record<string, unknown> : {};
    } catch {
      upstreamJson = {};
    }

    if (!upstream.ok) {
      return jsonResponse(req, 502, {
        error: upstreamJson.error || `Google Apps Script HTTP ${upstream.status}`,
        upstream: upstreamJson,
      });
    }

    const fileUrl = String(upstreamJson.fileUrl || upstreamJson.url || "");
    const fileId = String(upstreamJson.fileId || "");
    const generatedFileName = String(upstreamJson.fileName || body.fileName);
    const upstreamError = String(upstreamJson.error || "").trim();
    const unresolvedCount = Number(upstreamJson.unresolvedCount || 0);
    const unresolvedTokens = Array.isArray(upstreamJson.unresolvedTokens) ? upstreamJson.unresolvedTokens : [];
    const photoIssueCount = Number(upstreamJson.photoIssueCount || 0);
    const photoIssues = Array.isArray(upstreamJson.photoIssues) ? upstreamJson.photoIssues : [];

    if (upstreamError) {
      return jsonResponse(req, 502, {
        error: `Google Apps Script error: ${upstreamError}`,
        upstream: upstreamJson,
      });
    }

    if (!fileUrl) {
      return jsonResponse(req, 502, {
        error: "Google Apps Script did not return fileUrl",
        upstream: upstreamJson,
      });
    }

    return jsonResponse(req, 200, {
      ok: true,
      fileUrl,
      fileId,
      fileName: generatedFileName,
      templateKey: body.templateKey,
      templateName: body.templateName || "",
      unresolvedCount,
      unresolvedTokens,
      photoIssueCount,
      photoIssues,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(req, 500, { error: msg });
  }
});
