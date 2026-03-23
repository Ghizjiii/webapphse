import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

type PlainObject = Record<string, unknown>;

const allowedOriginEnv = Deno.env.get('ALLOWED_ORIGIN') || '';
const bitrixWebhookUrl = Deno.env.get('BITRIX_WEBHOOK_URL') || Deno.env.get('BITRIX_WEBHOOK') || '';

function normalizeOriginRule(value: string): string {
 const trimmed = String(value || '').trim();
 if (!trimmed) return '';
 if (trimmed === '*') return '*';
 return trimmed.replace(/\/+$/, '');
}

function isOriginRuleMatch(requestOrigin: string, rule: string): boolean {
 const normalizedRequestOrigin = normalizeOriginRule(requestOrigin);
 const normalizedRule = normalizeOriginRule(rule);
 if (!normalizedRequestOrigin || !normalizedRule) return false;
 if (normalizedRule === '*') return true;
 if (normalizedRule === normalizedRequestOrigin) return true;
 if (!normalizedRule.includes('*')) return false;

 try {
 const req = new URL(normalizedRequestOrigin);
 const hasScheme = normalizedRule.includes('://');
 const protocolPrefix = hasScheme ? `${req.protocol}//` : '';
 const hostPattern = hasScheme ? normalizedRule.split('://')[1] : normalizedRule;
 const normalizedHostPattern = hostPattern.startsWith('*.') ? hostPattern.slice(2) : hostPattern;
 if (!normalizedHostPattern) return false;
 if (hasScheme && !normalizedRule.startsWith(protocolPrefix)) return false;
 return req.hostname === normalizedHostPattern || req.hostname.endsWith(`.${normalizedHostPattern}`);
 } catch {
 return false;
 }
}

function resolveAllowedOrigin(requestOrigin: string): string {
 const configured = allowedOriginEnv.split(',').map(v => normalizeOriginRule(v)).filter(Boolean);
 if (configured.length === 0) return requestOrigin || '*';
 if (requestOrigin && configured.some(rule => isOriginRuleMatch(requestOrigin, rule))) return requestOrigin;
 const firstExact = configured.find(v => v && !v.includes('*'));
 return firstExact || '*';
}

function corsHeaders(req: Request): Record<string, string> {
 return {
 'Access-Control-Allow-Origin': resolveAllowedOrigin(req.headers.get('origin') || ''),
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
 Vary: 'Origin',
 };
}

async function callBitrix(method: string, params: PlainObject): Promise<unknown> {
 if (!bitrixWebhookUrl) throw new Error('BITRIX_WEBHOOK_URL is not configured');
 const url = `${bitrixWebhookUrl.replace(/\/+$/, '')}/${method}.json`;
 let lastError: unknown = null;

 for (let attempt = 1; attempt <= 4; attempt++) {
 try {
 const response = await fetch(url, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(params),
 });
 const rawText = await response.text();
 const data = rawText ? JSON.parse(rawText) as PlainObject : {};
 if (!response.ok) throw new Error(`Bitrix HTTP ${response.status} at ${method}: ${rawText || 'empty response'}`);
 const code = String(data.error || '').trim().toUpperCase();
 if (code) {
 const description = String(data.error_description || data.error || 'Unknown Bitrix error');
 throw new Error(`Bitrix ${method} error ${code}: ${description}`);
 }
 return data.result;
 } catch (error) {
 lastError = error;
 if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 300 * attempt));
 }
 }

 throw lastError instanceof Error ? lastError : new Error(`Bitrix call failed: ${method}`);
}

Deno.serve(async (req: Request) => {
 const headers = corsHeaders(req);

 if (!allowedOriginEnv) {
 return new Response(JSON.stringify({ error: 'ALLOWED_ORIGIN is not configured' }), {
 status: 500,
 headers: { ...headers, 'Content-Type': 'application/json' },
 });
 }

 if (req.method === 'OPTIONS') {
 return new Response(null, { status: 200, headers });
 }

 if (req.method !== 'POST') {
 return new Response(JSON.stringify({ error: 'Method not allowed' }), {
 status: 405,
 headers: { ...headers, 'Content-Type': 'application/json' },
 });
 }

 try {
 const body = await req.json() as { method?: string; params?: PlainObject };
 const method = String(body.method || '').trim();
 const params = body.params && typeof body.params === 'object' ? body.params : {};

 if (!method) {
 return new Response(JSON.stringify({ error: 'method is required' }), {
 status: 400,
 headers: { ...headers, 'Content-Type': 'application/json' },
 });
 }

 const result = await callBitrix(method, params);
 return new Response(JSON.stringify({ result }), {
 status: 200,
 headers: { ...headers, 'Content-Type': 'application/json' },
 });
 } catch (error) {
 const message = error instanceof Error ? error.message : String(error || 'Unknown error');
 return new Response(JSON.stringify({ error: message }), {
 status: 500,
 headers: { ...headers, 'Content-Type': 'application/json' },
 });
 }
});
