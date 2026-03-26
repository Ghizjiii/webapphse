import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const googleScriptUrl =
  Deno.env.get("GOOGLE_APPS_SCRIPT_PROTOCOL_URL") ||
  Deno.env.get("GOOGLE_APPS_SCRIPT_URL") ||
  "";
const googleScriptToken =
  Deno.env.get("GOOGLE_APPS_SCRIPT_PROTOCOL_TOKEN") ||
  Deno.env.get("GOOGLE_APPS_SCRIPT_TOKEN") ||
  "";

const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization, X-Client-Info, Apikey";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";

function normalizeOriginRule(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  return trimmed.replace(/\/+$/, "");
}

function configuredOrigins(envValue: string): string[] {
  return String(envValue || "")
    .split(",")
    .map(v => normalizeOriginRule(v))
    .filter(Boolean);
}

function fallbackAllowedOrigin(configured: string[]): string {
  const firstExact = configured.find(v => v && !v.includes("*"));
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

function isOriginAllowed(
  requestOrigin: string,
  envValue = Deno.env.get("ALLOWED_ORIGIN") || "",
): boolean {
  const configured = configuredOrigins(envValue);
  if (configured.length === 0) return false;
  return configured.some(rule => isOriginRuleMatch(requestOrigin, rule));
}

function resolveAllowedOrigin(
  requestOrigin: string,
  envValue = Deno.env.get("ALLOWED_ORIGIN") || "",
): string {
  const normalizedRequestOrigin = normalizeOriginRule(requestOrigin);
  const configured = configuredOrigins(envValue);

  if (configured.length === 0) return normalizedRequestOrigin || "*";
  if (normalizedRequestOrigin && configured.some(rule => isOriginRuleMatch(normalizedRequestOrigin, rule))) {
    return normalizedRequestOrigin;
  }

  return fallbackAllowedOrigin(configured);
}

function corsHeaders(req: Request, extraHeaders: Record<string, string> = {}): Record<string, string> {
  const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGIN") || "";
  const requestOrigin = req.headers.get("origin") || "";

  return {
    "Access-Control-Allow-Origin": resolveAllowedOrigin(requestOrigin, allowedOriginEnv),
    "Access-Control-Allow-Methods": DEFAULT_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": DEFAULT_ALLOWED_HEADERS,
    "Vary": "Origin",
    ...extraHeaders,
  };
}

function jsonResponse(
  req: Request,
  status: number,
  payload: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(req, extraHeaders),
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

type GenerateProtocolBody = {
  templateKey: string;
  templateName?: string;
  fileName: string;
  placeholders?: Record<string, string>;
  items?: Array<{
    placeholders: Record<string, string>;
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
    return jsonResponse(req, 500, { error: "GOOGLE_APPS_SCRIPT_PROTOCOL_URL is not configured" });
  }

  try {
    const body = await req.json() as GenerateProtocolBody;

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
      docType: "protocol",
      fileName: body.fileName,
      placeholders: hasSinglePlaceholders ? body.placeholders : {},
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(req, 500, { error: msg });
  }
});
