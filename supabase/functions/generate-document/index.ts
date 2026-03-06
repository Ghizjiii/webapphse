import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGIN") || "";
const googleScriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL") || "";
const googleScriptToken = Deno.env.get("GOOGLE_APPS_SCRIPT_TOKEN") || "";

function resolveAllowedOrigin(requestOrigin: string): string {
  const configured = allowedOriginEnv
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);

  if (configured.length === 0) return requestOrigin || "*";
  if (configured.includes("*")) return requestOrigin || "*";
  if (requestOrigin && configured.includes(requestOrigin)) return requestOrigin;
  return configured[0];
}

function corsHeaders(req: Request): Record<string, string> {
  const requestOrigin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(requestOrigin),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

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
  const headers = corsHeaders(req);

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

  if (!googleScriptUrl) {
    return new Response(JSON.stringify({ error: "GOOGLE_APPS_SCRIPT_URL is not configured" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json() as GenerateBody;

    const hasSinglePlaceholders = !!body.placeholders && typeof body.placeholders === "object";
    const hasItems = Array.isArray(body.items) && body.items.length > 0;
    if (!body.templateKey || !body.fileName || (!hasSinglePlaceholders && !hasItems)) {
      return new Response(JSON.stringify({ error: "templateKey, fileName and placeholders or items[] are required" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({
        error: upstreamJson.error || `Google Apps Script HTTP ${upstream.status}`,
        upstream: upstreamJson,
      }), {
        status: 502,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    const fileUrl = String(upstreamJson.fileUrl || upstreamJson.url || "");
    const fileId = String(upstreamJson.fileId || "");
    const generatedFileName = String(upstreamJson.fileName || body.fileName);
    const upstreamError = String(upstreamJson.error || "").trim();
    const unresolvedCount = Number(upstreamJson.unresolvedCount || 0);
    const unresolvedTokens = Array.isArray(upstreamJson.unresolvedTokens) ? upstreamJson.unresolvedTokens : [];

    if (upstreamError) {
      return new Response(JSON.stringify({
        error: `Google Apps Script error: ${upstreamError}`,
        upstream: upstreamJson,
      }), {
        status: 502,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    if (!fileUrl) {
      return new Response(JSON.stringify({ error: "Google Apps Script did not return fileUrl", upstream: upstreamJson }), {
        status: 502,
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      fileUrl,
      fileId,
      fileName: generatedFileName,
      templateKey: body.templateKey,
      templateName: body.templateName || "",
      unresolvedCount,
      unresolvedTokens,
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
