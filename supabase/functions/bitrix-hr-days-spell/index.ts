import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BITRIX_WEBHOOK_URL = Deno.env.get("BITRIX_WEBHOOK_URL") || Deno.env.get("BITRIX_WEBHOOK") || "";
const OUTGOING_TOKEN = Deno.env.get("BITRIX_OUTGOING_TOKEN") || "";

const TARGET_ENTITY_TYPE_ID = Number(Deno.env.get("BITRIX_HR_ENTITY_TYPE_ID") || "1050");
const START_DATE_FIELD = Deno.env.get("BITRIX_HR_START_DATE_FIELD") || "ufCrm10_1771778909";
const END_DATE_FIELD = Deno.env.get("BITRIX_HR_END_DATE_FIELD") || "ufCrm10_1771778942";
const DAYS_NUMBER_FIELD = Deno.env.get("BITRIX_HR_DAYS_NUMBER_FIELD") || "ufCrm10_1772124949853";
const DAYS_WORDS_FIELD = Deno.env.get("BITRIX_HR_DAYS_WORDS_FIELD") || "ufCrm10_1772131937986";
const POSITION_FIELD = Deno.env.get("BITRIX_HR_POSITION_FIELD") || "ufCrm10_1772992837";
const POSITION_GENITIVE_FIELD = Deno.env.get("BITRIX_HR_POSITION_GENITIVE_FIELD") || "ufCrm10_1771778817";
const EXTERNAL_EMPLOYEE_FULL_NAME_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_EMPLOYEE_FULL_NAME_FIELD") || "ufCrm10_1775226309";
const EXTERNAL_EMPLOYEE_INITIALS_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_EMPLOYEE_INITIALS_FIELD") || "ufCrm10_1775228369";
const EXTERNAL_EMPLOYEE_GENITIVE_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_EMPLOYEE_GENITIVE_FIELD") || "ufCrm10_1775228326";
const EXTERNAL_EMPLOYEE_DATIVE_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_EMPLOYEE_DATIVE_FIELD") || "ufCrm10_1776360538300";
const EXTERNAL_POSITION_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_POSITION_FIELD") || "ufCrm10_1775330493";
const EXTERNAL_POSITION_GENITIVE_LOWER_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_POSITION_GENITIVE_LOWER_FIELD") || "ufCrm10_1775330315";
const EXTERNAL_POSITION_DATIVE_LOWER_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_POSITION_DATIVE_LOWER_FIELD") || "ufCrm10_1776697890";
const MORPHER_API_TOKEN = Deno.env.get("MORPHER_API_TOKEN") || "";

type PlainObject = Record<string, unknown>;

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

    return requestUrl.hostname === normalizedHostPattern || requestUrl.hostname.endsWith(`.${normalizedHostPattern}`);
  } catch {
    return false;
  }
}

function isOriginAllowed(requestOrigin: string, envValue = Deno.env.get("ALLOWED_ORIGIN") || ""): boolean {
  const configured = configuredOrigins(envValue);
  if (configured.length === 0) return false;
  return configured.some(rule => isOriginRuleMatch(requestOrigin, rule));
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

type MorpherCaseName = "genitive" | "dative";

async function fetchMorpherForms(value: string): Promise<PlainObject> {
  const text = String(value || "").trim();
  if (!text) return {};

  const url = new URL("https://ws3.morpher.ru/russian/declension");
  url.searchParams.set("s", text);
  url.searchParams.set("format", "json");

  const headers: Record<string, string> = {};
  if (MORPHER_API_TOKEN) {
    headers.authorization = `Bearer ${MORPHER_API_TOKEN}`;
  }

  const res = await fetch(url, { method: "GET", headers });
  const raw = await res.text();

  if (!res.ok) {
    throw new Error(`Morpher HTTP ${res.status}: ${raw || "empty response"}`);
  }

  let parsed: PlainObject = {};
  try {
    parsed = raw ? JSON.parse(raw) as PlainObject : {};
  } catch {
    parsed = {};
  }

  return parsed;
}

function requireMorpherCase(forms: PlainObject, caseName: MorpherCaseName): string {
  const fieldMap: Record<MorpherCaseName, string[]> = {
    genitive: ["\u0420", "r"],
    dative: ["\u0414", "d"],
  };

  for (const key of fieldMap[caseName]) {
    const value = String(forms[key] || "").trim();
    if (value) return value;
  }

  throw new Error(`Morpher did not return ${caseName} form`);
}

async function toMorpherCase(value: string, caseName: MorpherCaseName): Promise<string> {
  const text = String(value || "").trim();
  if (!text) return "";

  return requireMorpherCase(await fetchMorpherForms(text), caseName);
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
    const foundKey = keys.find(key => normalizedKey(key) === target);
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
    const found = itemKeys.find(key => normalizedKey(key) === target);
    if (found) return found;
  }

  const cleaned = normalizeFieldCode(code);
  const smartField = cleaned.match(/^(?:U|u)fCrm(\d{2})(\d+)$/);
  if (smartField) return `ufCrm${smartField[1]}_${smartField[2]}`;
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

function firstScalarValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstScalarValue(item);
      if (candidate) return candidate;
    }
    return "";
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value as PlainObject)) {
      const candidate = firstScalarValue(nested);
      if (candidate) return candidate;
    }
  }

  return "";
}

function splitFullName(value: string): string[] {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function initialLetter(value: string): string {
  const chars = Array.from(String(value || "").trim());
  return chars.length > 0 ? `${chars[0]}.` : "";
}

function formatSurnameWithInitials(fullName: string): string {
  const parts = splitFullName(fullName);
  if (parts.length === 0) return "";

  const surname = parts[0];
  const nameInitial = initialLetter(parts[1] || "");
  const patronymicInitial = initialLetter(parts[2] || "");
  const initials = `${nameInitial}${patronymicInitial}`;

  return initials ? `${surname} ${initials}` : surname;
}

function toLowerCaseRu(value: string): string {
  return String(value || "").trim().toLocaleLowerCase("ru-RU");
}

function parseDateValue(value: unknown): string | null {
  const raw = firstScalarValue(value);
  if (!raw) return null;

  const isoDateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (isoDateMatch) return isoDateMatch[1];

  const ruDateMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[T\s].*)?$/);
  if (ruDateMatch) return `${ruDateMatch[3]}-${ruDateMatch[2]}-${ruDateMatch[1]}`;

  return null;
}

function parseIsoDateToUtcTimestamp(value: string): number | null {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function calculateInclusiveDays(startDate: string, endDate: string): number | null {
  const startTimestamp = parseIsoDateToUtcTimestamp(startDate);
  const endTimestamp = parseIsoDateToUtcTimestamp(endDate);

  if (startTimestamp === null || endTimestamp === null) return null;

  const diffDays = Math.round((endTimestamp - startTimestamp) / 86_400_000) + 1;
  return diffDays > 0 ? diffDays : null;
}

function normalizeComparableText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
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
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

function startDatePaths(): string[] {
  return [
    "startDate",
    "start_date",
    "dateStart",
    "date_start",
    "beginDate",
    "begin_date",
    START_DATE_FIELD,
    ...fieldCodeVariants(START_DATE_FIELD),
  ];
}

function endDatePaths(): string[] {
  return [
    "endDate",
    "end_date",
    "dateEnd",
    "date_end",
    "finishDate",
    "finish_date",
    END_DATE_FIELD,
    ...fieldCodeVariants(END_DATE_FIELD),
  ];
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

  if (!BITRIX_WEBHOOK_URL) {
    return jsonResponse(req, 500, { error: "BITRIX_WEBHOOK_URL is not configured" });
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
      return jsonResponse(req, 401, { error: "Unauthorized" });
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
      return jsonResponse(req, 400, { error: "itemId is required" });
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
      return jsonResponse(req, 200, {
        ok: true,
        ignored: true,
        reason: `Entity type ${entityTypeId} is not target ${TARGET_ENTITY_TYPE_ID}`,
      });
    }

    const itemResult = await callBitrix("crm.item.get", { entityTypeId, id: itemId });
    const item = ((itemResult.item || itemResult) as PlainObject) || {};

    const fieldsToUpdate: PlainObject = {};
    const warnings: string[] = [];

    const rawStartDate = pickFormOrJson(body, startDatePaths()) ?? findFieldValue(item, START_DATE_FIELD);
    const rawEndDate = pickFormOrJson(body, endDatePaths()) ?? findFieldValue(item, END_DATE_FIELD);
    const rawPosition =
      pickFormOrJson(body, [
        "position",
        "jobTitle",
        "job_title",
        POSITION_FIELD,
        ...fieldCodeVariants(POSITION_FIELD),
      ]) ?? findFieldValue(item, POSITION_FIELD);
    const rawExternalEmployeeFullName =
      pickFormOrJson(body, [
        "externalEmployeeFullName",
        "external_employee_full_name",
        "externalEmployeeFio",
        "external_employee_fio",
        EXTERNAL_EMPLOYEE_FULL_NAME_FIELD,
        ...fieldCodeVariants(EXTERNAL_EMPLOYEE_FULL_NAME_FIELD),
      ]) ?? findFieldValue(item, EXTERNAL_EMPLOYEE_FULL_NAME_FIELD);
    const rawExternalPosition =
      pickFormOrJson(body, [
        "externalEmployeePosition",
        "external_employee_position",
        "externalPosition",
        "external_position",
        EXTERNAL_POSITION_FIELD,
        ...fieldCodeVariants(EXTERNAL_POSITION_FIELD),
      ]) ?? findFieldValue(item, EXTERNAL_POSITION_FIELD);

    const startDateValue = firstScalarValue(rawStartDate);
    const endDateValue = firstScalarValue(rawEndDate);
    const sourcePosition = firstScalarValue(rawPosition);
    const sourceExternalEmployeeFullName = firstScalarValue(rawExternalEmployeeFullName);
    const sourceExternalPosition = firstScalarValue(rawExternalPosition);

    let startDate: string | null = null;
    let endDate: string | null = null;
    let days: number | null = null;
    let daysWords = "";
    let daysError = "";
    let updateDaysNumberFieldKey = "";
    let updateDaysWordsFieldKey = "";

    if (startDateValue || endDateValue) {
      startDate = parseDateValue(rawStartDate);
      endDate = parseDateValue(rawEndDate);

      if (!startDate) {
        daysError = `Cannot read start date from ${START_DATE_FIELD}`;
      } else if (!endDate) {
        daysError = `Cannot read end date from ${END_DATE_FIELD}`;
      } else {
        days = calculateInclusiveDays(startDate, endDate);
        if (days === null) {
          daysError = "End date must be the same as or later than start date";
        } else {
          daysWords = numberToWordsRu(days);
          const currentDays = parseNumberValue(findFieldValue(item, DAYS_NUMBER_FIELD));
          const currentWords = normalizeComparableText(findFieldValue(item, DAYS_WORDS_FIELD));

          updateDaysNumberFieldKey = resolveUpdateFieldKey(item, DAYS_NUMBER_FIELD);
          updateDaysWordsFieldKey = resolveUpdateFieldKey(item, DAYS_WORDS_FIELD);

          if (currentDays !== days) {
            fieldsToUpdate[updateDaysNumberFieldKey] = days;
          }

          if (currentWords !== normalizeComparableText(daysWords)) {
            fieldsToUpdate[updateDaysWordsFieldKey] = daysWords;
          }
        }
      }
    } else {
      warnings.push("Days sync skipped because start and end dates are empty");
    }

    let genitivePosition = "";
    let positionError = "";
    let updatePositionFieldKey = "";

    if (sourcePosition) {
      try {
        genitivePosition = await toMorpherCase(sourcePosition, "genitive");
        const currentGenitive = normalizeComparableText(findFieldValue(item, POSITION_GENITIVE_FIELD));

        if (currentGenitive !== normalizeComparableText(genitivePosition)) {
          updatePositionFieldKey = resolveUpdateFieldKey(item, POSITION_GENITIVE_FIELD);
          fieldsToUpdate[updatePositionFieldKey] = genitivePosition;
        }
      } catch (error) {
        positionError = error instanceof Error ? error.message : String(error);
      }
    } else {
      warnings.push("Position genitive sync skipped because position field is empty");
    }

    let externalEmployeeInitials = "";
    let externalEmployeeGenitive = "";
    let externalEmployeeDative = "";
    let externalEmployeeError = "";
    let updateExternalEmployeeInitialsFieldKey = "";
    let updateExternalEmployeeGenitiveFieldKey = "";
    let updateExternalEmployeeDativeFieldKey = "";
    let hasExternalEmployeeInitialsSuccess = false;
    let hasExternalEmployeeGenitiveSuccess = false;
    let hasExternalEmployeeDativeSuccess = false;

    if (sourceExternalEmployeeFullName) {
      externalEmployeeInitials = formatSurnameWithInitials(sourceExternalEmployeeFullName);
      hasExternalEmployeeInitialsSuccess = Boolean(externalEmployeeInitials);

      if (externalEmployeeInitials) {
        const currentInitials = normalizeComparableText(findFieldValue(item, EXTERNAL_EMPLOYEE_INITIALS_FIELD));
        if (currentInitials !== normalizeComparableText(externalEmployeeInitials)) {
          updateExternalEmployeeInitialsFieldKey = resolveUpdateFieldKey(item, EXTERNAL_EMPLOYEE_INITIALS_FIELD);
          fieldsToUpdate[updateExternalEmployeeInitialsFieldKey] = externalEmployeeInitials;
        }
      }

      try {
        const externalEmployeeForms = await fetchMorpherForms(sourceExternalEmployeeFullName);
        externalEmployeeGenitive = requireMorpherCase(externalEmployeeForms, "genitive");
        hasExternalEmployeeGenitiveSuccess = Boolean(externalEmployeeGenitive);

        const currentExternalEmployeeGenitive = normalizeComparableText(
          findFieldValue(item, EXTERNAL_EMPLOYEE_GENITIVE_FIELD),
        );

        if (currentExternalEmployeeGenitive !== normalizeComparableText(externalEmployeeGenitive)) {
          updateExternalEmployeeGenitiveFieldKey = resolveUpdateFieldKey(item, EXTERNAL_EMPLOYEE_GENITIVE_FIELD);
          fieldsToUpdate[updateExternalEmployeeGenitiveFieldKey] = externalEmployeeGenitive;
        }

        externalEmployeeDative = requireMorpherCase(externalEmployeeForms, "dative");
        hasExternalEmployeeDativeSuccess = Boolean(externalEmployeeDative);

        const currentExternalEmployeeDative = normalizeComparableText(
          findFieldValue(item, EXTERNAL_EMPLOYEE_DATIVE_FIELD),
        );

        if (currentExternalEmployeeDative !== normalizeComparableText(externalEmployeeDative)) {
          updateExternalEmployeeDativeFieldKey = resolveUpdateFieldKey(item, EXTERNAL_EMPLOYEE_DATIVE_FIELD);
          fieldsToUpdate[updateExternalEmployeeDativeFieldKey] = externalEmployeeDative;
        }
      } catch (error) {
        externalEmployeeError = error instanceof Error ? error.message : String(error);
      }
    } else {
      warnings.push("External employee sync skipped because full name field is empty");
    }

    let externalPositionSourceLower = "";
    let externalPositionGenitiveLower = "";
    let externalPositionDativeLower = "";
    let externalPositionError = "";
    let updateExternalPositionFieldKey = "";
    let updateExternalPositionDativeFieldKey = "";

    if (sourceExternalPosition) {
      try {
        externalPositionSourceLower = toLowerCaseRu(sourceExternalPosition);
        const externalPositionForms = await fetchMorpherForms(externalPositionSourceLower);
        externalPositionGenitiveLower = toLowerCaseRu(requireMorpherCase(externalPositionForms, "genitive"));
        externalPositionDativeLower = toLowerCaseRu(requireMorpherCase(externalPositionForms, "dative"));

        const currentExternalPositionGenitive = normalizeComparableText(
          findFieldValue(item, EXTERNAL_POSITION_GENITIVE_LOWER_FIELD),
        );

        if (currentExternalPositionGenitive !== normalizeComparableText(externalPositionGenitiveLower)) {
          updateExternalPositionFieldKey = resolveUpdateFieldKey(item, EXTERNAL_POSITION_GENITIVE_LOWER_FIELD);
          fieldsToUpdate[updateExternalPositionFieldKey] = externalPositionGenitiveLower;
        }

        const currentExternalPositionDative = normalizeComparableText(
          findFieldValue(item, EXTERNAL_POSITION_DATIVE_LOWER_FIELD),
        );

        if (currentExternalPositionDative !== normalizeComparableText(externalPositionDativeLower)) {
          updateExternalPositionDativeFieldKey = resolveUpdateFieldKey(item, EXTERNAL_POSITION_DATIVE_LOWER_FIELD);
          fieldsToUpdate[updateExternalPositionDativeFieldKey] = externalPositionDativeLower;
        }
      } catch (error) {
        externalPositionError = error instanceof Error ? error.message : String(error);
      }
    } else {
      warnings.push("External position genitive/dative sync skipped because source position field is empty");
    }

    const daysAttempted = Boolean(startDateValue || endDateValue);
    const positionAttempted = Boolean(sourcePosition);
    const externalEmployeeAttempted = Boolean(sourceExternalEmployeeFullName);
    const externalPositionAttempted = Boolean(sourceExternalPosition);
    const hasDaysSuccess = Boolean(daysAttempted && startDate && endDate && days !== null);
    const hasPositionSuccess = Boolean(positionAttempted && !positionError);
    const hasExternalEmployeeSuccess = Boolean(
      externalEmployeeAttempted &&
      (hasExternalEmployeeInitialsSuccess || hasExternalEmployeeGenitiveSuccess || hasExternalEmployeeDativeSuccess),
    );
    const hasExternalPositionSuccess = Boolean(externalPositionAttempted && !externalPositionError);
    const hasAnySuccess = hasDaysSuccess || hasPositionSuccess || hasExternalEmployeeSuccess || hasExternalPositionSuccess;
    const firstBlockingError = daysError || positionError || externalEmployeeError || externalPositionError;
    const hasExternalPositionDativeSuccess = Boolean(externalPositionAttempted && !externalPositionError && externalPositionDativeLower);

    if (firstBlockingError && !hasAnySuccess) {
      return jsonResponse(req, daysError ? 400 : 502, {
        error: firstBlockingError,
        itemId,
        entityTypeId,
        startDate,
        endDate,
        days,
        daysWords,
        sourcePosition,
        genitivePosition,
        sourceExternalEmployeeFullName,
        externalEmployeeInitials,
        externalEmployeeGenitive,
        externalEmployeeDative,
        sourceExternalPosition,
        externalPositionSourceLower,
        externalPositionGenitiveLower,
        externalPositionDativeLower,
        warnings,
      });
    }

    if (daysError) {
      warnings.push(daysError);
    }

    if (positionError) {
      warnings.push(positionError);
    }

    if (externalEmployeeError) {
      warnings.push(externalEmployeeError);
    }

    if (externalPositionError) {
      warnings.push(externalPositionError);
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      return jsonResponse(req, 200, {
        ok: true,
        updated: false,
        partial: Boolean(daysError || positionError || externalEmployeeError || externalPositionError),
        itemId,
        entityTypeId,
        startDate,
        endDate,
        days,
        daysWords,
        sourcePosition,
        genitivePosition,
        sourceExternalEmployeeFullName,
        externalEmployeeInitials,
        externalEmployeeGenitive,
        externalEmployeeDative,
        sourceExternalPosition,
        externalPositionSourceLower,
        externalPositionGenitiveLower,
        externalPositionDativeLower,
        warnings,
      });
    }

    await callBitrix("crm.item.update", {
      entityTypeId,
      id: itemId,
      fields: fieldsToUpdate,
    });

    return jsonResponse(req, 200, {
      ok: true,
      updated: true,
      partial: Boolean(daysError || positionError || externalEmployeeError || externalPositionError),
      itemId,
      entityTypeId,
      startDate,
      endDate,
      days,
      daysWords,
      sourcePosition,
      genitivePosition,
      sourceExternalEmployeeFullName,
      externalEmployeeInitials,
      externalEmployeeGenitive,
      externalEmployeeDative,
      sourceExternalPosition,
      externalPositionSourceLower,
      externalPositionGenitiveLower,
      externalPositionDativeLower,
      warnings,
      updateFieldKeys: Object.keys(fieldsToUpdate),
      updateDaysNumberFieldKey,
      updateDaysWordsFieldKey,
      updatePositionFieldKey,
      updateExternalEmployeeInitialsFieldKey,
      updateExternalEmployeeGenitiveFieldKey,
      updateExternalEmployeeDativeFieldKey,
      updateExternalPositionFieldKey,
      updateExternalPositionDativeFieldKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(req, 500, { error: message });
  }
});
