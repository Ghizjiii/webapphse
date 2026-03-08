import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BITRIX_WEBHOOK_URL = Deno.env.get("BITRIX_WEBHOOK_URL") || Deno.env.get("BITRIX_WEBHOOK") || "";
const OUTGOING_TOKEN = Deno.env.get("BITRIX_OUTGOING_TOKEN") || "";

const TARGET_ENTITY_TYPE_ID = Number(Deno.env.get("BITRIX_HR_ENTITY_TYPE_ID") || "1050");
const DAYS_NUMBER_FIELD = Deno.env.get("BITRIX_HR_DAYS_NUMBER_FIELD") || "ufCrm10_1772124949853";
const DAYS_WORDS_FIELD = Deno.env.get("BITRIX_HR_DAYS_WORDS_FIELD") || "ufCrm10_1772131937986";

type PlainObject = Record<string, unknown>;

function jsonResponse(status: number, payload: PlainObject): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bitrixMethodUrl(base: string, method: string): string {
  return `${base.replace(/\/+$/, "")}/${method}.json`;
}

async function callBitrix(method: string, params: PlainObject): Promise<PlainObject> {
  const res = await fetch(bitrixMethodUrl(BITRIX_WEBHOOK_URL, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const raw = await res.text();
  let parsed: PlainObject = {};
  try {
    parsed = raw ? JSON.parse(raw) as PlainObject : {};
  } catch {
    parsed = {};
  }

  if (!res.ok) {
    throw new Error(`Bitrix HTTP ${res.status}: ${raw || "empty response"}`);
  }

  const bitrixError = String(parsed.error || "").trim();
  if (bitrixError) {
    const desc = String(parsed.error_description || bitrixError);
    throw new Error(`Bitrix ${method} failed: ${desc}`);
  }

  return (parsed.result as PlainObject) || {};
}

function normalizeFieldCode(code: string): string {
  return String(code || "").replace(/[{}]/g, "").trim();
}

function fieldCodeVariants(code: string): string[] {
  const cleaned = normalizeFieldCode(code);
  const out = new Set<string>([cleaned]);

  if (cleaned) {
    out.add(cleaned[0].toLowerCase() + cleaned.slice(1));
    out.add(cleaned[0].toUpperCase() + cleaned.slice(1));
    out.add(cleaned.toUpperCase());
  }

  const mCamelUnderscore = cleaned.match(/^(?:U|u)fCrm(\d+)_(\d+)$/);
  if (mCamelUnderscore) {
    const partA = mCamelUnderscore[1];
    const partB = mCamelUnderscore[2];
    out.add(`UfCrm${partA}${partB}`);
    out.add(`ufCrm${partA}${partB}`);
    out.add(`UF_CRM_${partA}_${partB}`);
  }

  const mUpper = cleaned.match(/^UF_CRM_(\d+)_(\d+)$/i);
  if (mUpper) {
    const partA = mUpper[1];
    const partB = mUpper[2];
    out.add(`UfCrm${partA}${partB}`);
    out.add(`ufCrm${partA}${partB}`);
    out.add(`ufCrm${partA}_${partB}`);
  }

  const mCamelFlat = cleaned.match(/^(?:U|u)fCrm(\d{2})(\d+)$/);
  if (mCamelFlat) {
    const partA = mCamelFlat[1];
    const partB = mCamelFlat[2];
    out.add(`ufCrm${partA}_${partB}`);
    out.add(`UF_CRM_${partA}_${partB}`);
  }

  return Array.from(out).filter(Boolean);
}

function normalizedKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[{}_\s[\].-]/g, "");
}

function findFieldValue(source: PlainObject, code: string): unknown {
  const variants = fieldCodeVariants(code);
  const keys = Object.keys(source);
  for (const variant of variants) {
    if (variant in source) return source[variant];
    const target = normalizedKey(variant);
    const foundKey = keys.find(k => normalizedKey(k) === target);
    if (foundKey) return source[foundKey];
  }
  return undefined;
}

function resolveUpdateFieldKey(item: PlainObject, code: string): string {
  const variants = fieldCodeVariants(code);
  for (const variant of variants) {
    if (variant in item) return variant;
  }

  const itemKeys = Object.keys(item);
  for (const variant of variants) {
    const target = normalizedKey(variant);
    const found = itemKeys.find(k => normalizedKey(k) === target);
    if (found) return found;
  }

  // Safe default for Smart Process API
  const cleaned = normalizeFieldCode(code);
  const m = cleaned.match(/^(?:U|u)fCrm(\d{2})(\d+)$/);
  if (m) return `ufCrm${m[1]}_${m[2]}`;
  return cleaned;
}

function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function pickFormOrJson(body: PlainObject, paths: string[]): unknown {
  for (const path of paths) {
    if (path in body) return body[path];
  }

  for (const path of paths) {
    const parts = path.split(".");
    let cur: unknown = body;
    let ok = true;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !(part in (cur as PlainObject))) {
        ok = false;
        break;
      }
      cur = (cur as PlainObject)[part];
    }
    if (ok) return cur;
  }

  return undefined;
}

function parseItemId(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  const mDoc = raw.match(/^SPA_(\d+)_(\d+)$/i);
  if (mDoc) return mDoc[2];
  const m = raw.match(/(\d+)$/);
  return m ? m[1] : "";
}

function parseEntityTypeId(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const mDoc = raw.match(/^SPA_(\d+)_(\d+)$/i);
  if (mDoc) return Number(mDoc[1]);
  return null;
}

function morph(value: number, one: string, two: string, many: string): string {
  const n = Math.abs(value) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;
  return many;
}

function hundredToWords(num: number, feminine = false): string {
  const onesMale = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const onesFemale = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
  const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
  const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
  const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

  const parts: string[] = [];
  const h = Math.trunc(num / 100);
  const rest = num % 100;
  const t = Math.trunc(rest / 10);
  const o = rest % 10;

  if (h > 0) parts.push(hundreds[h]);
  if (rest >= 10 && rest <= 19) {
    parts.push(teens[rest - 10]);
  } else {
    if (t > 1) parts.push(tens[t]);
    if (o > 0) parts.push((feminine ? onesFemale : onesMale)[o]);
  }

  return parts.join(" ").trim();
}

function numberToWordsRu(num: number): string {
  if (num === 0) return "ноль";
  if (!Number.isFinite(num)) return "";

  const abs = Math.abs(Math.trunc(num));
  let rest = abs;
  const parts: string[] = [];

  const billions = Math.trunc(rest / 1_000_000_000);
  if (billions > 0) {
    parts.push(hundredToWords(billions, false), morph(billions, "миллиард", "миллиарда", "миллиардов"));
    rest %= 1_000_000_000;
  }

  const millions = Math.trunc(rest / 1_000_000);
  if (millions > 0) {
    parts.push(hundredToWords(millions, false), morph(millions, "миллион", "миллиона", "миллионов"));
    rest %= 1_000_000;
  }

  const thousands = Math.trunc(rest / 1000);
  if (thousands > 0) {
    parts.push(hundredToWords(thousands, true), morph(thousands, "тысяча", "тысячи", "тысяч"));
    rest %= 1000;
  }

  if (rest > 0) {
    parts.push(hundredToWords(rest, false));
  }

  const output = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return num < 0 ? `минус ${output}` : output;
}

async function parseRequestPayload(req: Request): Promise<PlainObject> {
  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      const json = await req.json();
      return (json && typeof json === "object" ? json as PlainObject : {});
    } catch {
      return {};
    }
  }

  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: PlainObject = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (!BITRIX_WEBHOOK_URL) {
    return jsonResponse(500, { error: "BITRIX_WEBHOOK_URL is not configured" });
  }

  try {
    const body = await parseRequestPayload(req);

    const url = new URL(req.url);
    const tokenFromQuery = url.searchParams.get("token") || "";
    const tokenFromHeader = String(req.headers.get("x-webhook-token") || "").trim();
    const tokenFromBearer = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const tokenFromBody = String(
      pickFormOrJson(body, [
        "token",
        "webhookToken",
        "secret",
        "auth.application_token",
        "auth[application_token]",
        "auth.applicationToken",
      ]) || "",
    ).trim();
    const providedToken = tokenFromQuery || tokenFromHeader || tokenFromBearer || tokenFromBody;

    if (OUTGOING_TOKEN && providedToken !== OUTGOING_TOKEN) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const itemId = parseItemId(
      pickFormOrJson(body, [
        "itemId",
        "item_id",
        "id",
        "document_id",
        "data.FIELDS.ID",
        "data[FIELDS][ID]",
      ]),
    );

    if (!itemId) {
      return jsonResponse(400, { error: "itemId is required" });
    }

    const entityTypeId =
      parseEntityTypeId(
        pickFormOrJson(body, [
          "entityTypeId",
          "entity_type_id",
          "document_id",
          "data.FIELDS.ENTITY_TYPE_ID",
          "data[FIELDS][ENTITY_TYPE_ID]",
        ]),
      ) ?? TARGET_ENTITY_TYPE_ID;

    if (entityTypeId !== TARGET_ENTITY_TYPE_ID) {
      return jsonResponse(200, {
        ok: true,
        ignored: true,
        reason: `Entity type ${entityTypeId} is not target ${TARGET_ENTITY_TYPE_ID}`,
      });
    }

    const itemResult = await callBitrix("crm.item.get", { entityTypeId, id: itemId });
    const item = ((itemResult.item || itemResult) as PlainObject) || {};

    const inputDays =
      pickFormOrJson(body, [
        "days",
        "vacationDays",
        "vacation_days",
        DAYS_NUMBER_FIELD,
        ...fieldCodeVariants(DAYS_NUMBER_FIELD),
      ]) ??
      findFieldValue(item, DAYS_NUMBER_FIELD);

    const days = parseNumberValue(inputDays);
    if (days === null) {
      return jsonResponse(400, {
        error: "Cannot read vacation days number",
        field: DAYS_NUMBER_FIELD,
      });
    }

    const daysWords = numberToWordsRu(days);
    const currentWords = String(findFieldValue(item, DAYS_WORDS_FIELD) || "").trim().toLowerCase();
    if (currentWords === daysWords.toLowerCase()) {
      return jsonResponse(200, {
        ok: true,
        updated: false,
        itemId,
        days,
        daysWords,
      });
    }

    const updateFieldKey = resolveUpdateFieldKey(item, DAYS_WORDS_FIELD);
    await callBitrix("crm.item.update", {
      entityTypeId,
      id: itemId,
      fields: { [updateFieldKey]: daysWords },
    });

    return jsonResponse(200, {
      ok: true,
      updated: true,
      itemId,
      entityTypeId,
      days,
      daysWords,
      updateFieldKey,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(500, { error: msg });
  }
});
