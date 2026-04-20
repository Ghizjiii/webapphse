import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BITRIX_WEBHOOK_URL = (Deno.env.get("BITRIX_WEBHOOK_URL") || Deno.env.get("BITRIX_WEBHOOK") || "").replace(/\/+$/, "");
const OUTGOING_TOKEN = Deno.env.get("BITRIX_REFERENCE_SYNC_TOKEN") || Deno.env.get("BITRIX_OUTGOING_TOKEN") || "";
const CONTRACT_ENTITY_TYPE_ID = Number(Deno.env.get("BITRIX_CONTRACT_ENTITY_TYPE_ID") || "1060");
const HR_ENTITY_TYPE_ID = Number(Deno.env.get("BITRIX_HR_ENTITY_TYPE_ID") || "1050");
const HR_START_DATE_FIELD = Deno.env.get("BITRIX_HR_START_DATE_FIELD") || "ufCrm10_1771778909";
const HR_END_DATE_FIELD = Deno.env.get("BITRIX_HR_END_DATE_FIELD") || "ufCrm10_1771778942";
const HR_DAYS_NUMBER_FIELD = Deno.env.get("BITRIX_HR_DAYS_NUMBER_FIELD") || "ufCrm10_1772124949853";
const HR_DAYS_WORDS_FIELD = Deno.env.get("BITRIX_HR_DAYS_WORDS_FIELD") || "ufCrm10_1772131937986";
const HR_POSITION_FIELD = Deno.env.get("BITRIX_HR_POSITION_FIELD") || "ufCrm10_1772992837";
const HR_POSITION_GENITIVE_FIELD = Deno.env.get("BITRIX_HR_POSITION_GENITIVE_FIELD") || "ufCrm10_1771778817";
const HR_EXTERNAL_EMPLOYEE_FULL_NAME_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_EMPLOYEE_FULL_NAME_FIELD") || "ufCrm10_1775226309";
const HR_EXTERNAL_EMPLOYEE_INITIALS_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_EMPLOYEE_INITIALS_FIELD") || "ufCrm10_1775228369";
const HR_EXTERNAL_EMPLOYEE_GENITIVE_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_EMPLOYEE_GENITIVE_FIELD") || "ufCrm10_1775228326";
const HR_EXTERNAL_EMPLOYEE_DATIVE_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_EMPLOYEE_DATIVE_FIELD") || "ufCrm10_1776360538300";
const HR_EXTERNAL_POSITION_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_POSITION_FIELD") || "ufCrm10_1775330493";
const HR_EXTERNAL_POSITION_GENITIVE_LOWER_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_POSITION_GENITIVE_LOWER_FIELD") || "ufCrm10_1775330315";
const HR_EXTERNAL_POSITION_DATIVE_LOWER_FIELD =
  Deno.env.get("BITRIX_HR_EXTERNAL_POSITION_DATIVE_LOWER_FIELD") || "ufCrm10_1776697890";
const MORPHER_API_TOKEN = Deno.env.get("MORPHER_API_TOKEN") || "";
const SYNC_SCOPE = "reference_lists";
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization, X-Client-Info, Apikey";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";
const COMPANY_BIN_FIELD_CANDIDATES = [
  "UF_CRM_BIN_IIN",
  "UF_CRM_1772589149",
  "UF_CRM_1772598092",
  "UF_CRM_1772598149",
];

type PlainObject = Record<string, unknown>;

type BitrixListDefinition = {
  iblockId: number;
  name: string;
};

type BitrixDocumentValidityDetails = {
  course_name: string;
  category: string;
  document_type: string;
  duration_value: number | null;
  duration_unit: "year";
};

type BitrixCoursePriceDetails = {
  course_name: string;
  qualification: string;
  electrical_safety_group: string;
  category: string;
  price: number | null;
};

type BitrixElectricalSafetyAdmissionDetails = {
  category: string;
};

type BitrixElectricalSafetyGroupDetails = {
  text_in_document: string;
};

type BitrixCommissionMemberDetails = {
  city: string;
  my_company: string;
  main_text: string;
};

type BitrixListElement = {
  id: string;
  name: string;
  code: string;
  sortOrder: number;
  details:
    | BitrixDocumentValidityDetails
    | BitrixCoursePriceDetails
    | BitrixElectricalSafetyAdmissionDetails
    | BitrixElectricalSafetyGroupDetails
    | BitrixCommissionMemberDetails
    | null;
};

type BitrixListFieldDefinition = {
  fieldId: string;
  code: string;
  name: string;
  displayValues: Record<string, string>;
};

type CompanyDirectoryRow = {
  bitrix_company_id: string;
  name: string;
  bin_iin: string;
  bin_iin_digits: string;
  phone: string;
  email: string;
  city: string;
  has_contract: boolean;
  contract_count: number;
  contract_bitrix_id: string;
  contract_title: string;
  contract_number: string;
  contract_date: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_status: string;
  contract_is_active: boolean;
};

type ContractSnapshot = {
  id: string;
  title: string;
  number: string;
  contractDate: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  isActive: boolean;
};

type SyncTargets = {
  syncReferenceLists: boolean;
  syncCompanyDirectory: boolean;
  syncHrItem: boolean;
  ignoreEvent: boolean;
  entityTypeId: number | null;
  reason: string;
};

const BITRIX_REFERENCE_LISTS = {
  MY_COMPANIES: { iblockId: 60, name: "Справочник компаний (служебное)" },
  COURSES: { iblockId: 64, name: "Наименование курсов" },
  DOCUMENT_VALIDITY: { iblockId: 66, name: "Сроки документов" },
  CATEGORIES: { iblockId: 68, name: "Категория" },
  DOCUMENT_TYPE: { iblockId: 70, name: "Тип документа" },
  GRADE: { iblockId: 72, name: "Оценка за квалиф. экзамен" },
  EMPLOYEE_STATUS: { iblockId: 74, name: "Статус сотрудника" },
  MARKER_PASS: { iblockId: 76, name: "Отметка о проверке знаний" },
  TYPE_LEARN: { iblockId: 78, name: "Вид проверки знаний / тип обучения" },
  COMMIS_CONCL: { iblockId: 80, name: "Заключение комиссии" },
  COURSE_PRICES: { iblockId: 84, name: "Course default prices" },
  QUALIFICATION: { iblockId: 86, name: "Квалификация" },
  ELECTRICAL_SAFETY_ADMISSION: { iblockId: 88, name: "Допуск электробезопасность" },
  ELECTRICAL_SAFETY_GROUP: { iblockId: 90, name: "Группа электробезопасность" },
  CITIES: { iblockId: 92, name: "Города" },
  COMMISSION_MEMBERS: { iblockId: 94, name: "Члены комиссии (для протокола)" },
  COMMISSION_MY_COMPANIES: { iblockId: 96, name: "Мои компании" },
} as const satisfies Record<string, BitrixListDefinition>;

const BITRIX_REFERENCE_LIST_ORDER = [
  "MY_COMPANIES",
  "CATEGORIES",
  "COURSES",
  "DOCUMENT_VALIDITY",
  "DOCUMENT_TYPE",
  "GRADE",
  "EMPLOYEE_STATUS",
  "MARKER_PASS",
  "TYPE_LEARN",
  "COMMIS_CONCL",
  "COURSE_PRICES",
  "QUALIFICATION",
  "ELECTRICAL_SAFETY_ADMISSION",
  "ELECTRICAL_SAFETY_GROUP",
  "CITIES",
  "COMMISSION_MEMBERS",
  "COMMISSION_MY_COMPANIES",
] as const satisfies ReadonlyArray<keyof typeof BITRIX_REFERENCE_LISTS>;

function resolveBitrixListTypeId(iblockId: number): string {
  return iblockId === 60 ? "bitrix_processes" : "lists";
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

    return requestUrl.hostname === normalizedHostPattern || requestUrl.hostname.endsWith(`.${normalizedHostPattern}`);
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
  const requestOrigin = req.headers.get("origin") || "";
  if (!requestOrigin) {
    return null;
  }

  const allowedOriginEnv = Deno.env.get("ALLOWED_ORIGIN") || "";
  if (!allowedOriginEnv) {
    return jsonResponse(req, 500, { error: "ALLOWED_ORIGIN is not configured" });
  }

  if (requestOrigin && !isOriginAllowed(requestOrigin, allowedOriginEnv)) {
    return jsonResponse(req, 403, { error: "Origin is not allowed" });
  }

  return null;
}

function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service role env vars are not configured");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function plain(value: unknown): string {
  return String(value || "").trim();
}

function digits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function toNumberOrNull(value: unknown): number | null {
  const scalar = firstScalarValue(value);
  if (!scalar) return null;
  const parsed = Number(scalar);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeUnicodeEscapes(value: string): string {
  return String(value || "").replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function normalizeDateValue(value: unknown): string | null {
  const raw = plain(value);
  if (!raw) return null;
  const datePart = raw.includes("T") ? raw.split("T")[0] : raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toPlainRecord(value: unknown): PlainObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PlainObject
    : {};
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
    for (const nestedValue of Object.values(value as PlainObject)) {
      const candidate = firstScalarValue(nestedValue);
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

function pickFormOrJson(body: PlainObject, paths: string[]): unknown {
  for (const path of paths) {
    if (path in body) return body[path];
  }

  for (const path of paths) {
    const parts = path.split(".");
    let current: unknown = body;
    let ok = true;
    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in (current as PlainObject))) {
        ok = false;
        break;
      }
      current = (current as PlainObject)[part];
    }
    if (ok) return current;
  }

  return undefined;
}

function extractListRows(payload: unknown): PlainObject[] {
  if (Array.isArray(payload)) return payload as PlainObject[];
  const wrapped = toPlainRecord(payload);
  if (Array.isArray(wrapped.items)) return wrapped.items as PlainObject[];
  if (Array.isArray(wrapped.result)) return wrapped.result as PlainObject[];
  return [];
}

function companyUfCamelFromUpper(code: string): string | null {
  const normalized = plain(code).toUpperCase();
  const match = normalized.match(/^UF_CRM_(\d+)$/);
  return match ? `ufCrm${match[1]}` : null;
}

function smartUfCamelFromUpper(code: string): string | null {
  const normalized = plain(code).toUpperCase();
  const match = normalized.match(/^UF_CRM_(\d+)_(\d+)$/);
  return match ? `ufCrm${match[1]}_${match[2]}` : null;
}

function fieldKeyVariants(code: string): string[] {
  const base = plain(code);
  if (!base) return [];

  const variants = new Set<string>([base, base.toUpperCase(), base.toLowerCase()]);
  variants.add(base[0].toLowerCase() + base.slice(1));
  variants.add(base[0].toUpperCase() + base.slice(1));

  const smartCamel = smartUfCamelFromUpper(base);
  if (smartCamel) variants.add(smartCamel);

  const companyCamel = companyUfCamelFromUpper(base);
  if (companyCamel) variants.add(companyCamel);

  const camelUnderscoreMatch = base.match(/^(?:U|u)fCrm(\d+)_(\d+)$/);
  if (camelUnderscoreMatch) {
    variants.add(`UfCrm${camelUnderscoreMatch[1]}${camelUnderscoreMatch[2]}`);
    variants.add(`ufCrm${camelUnderscoreMatch[1]}${camelUnderscoreMatch[2]}`);
    variants.add(`UF_CRM_${camelUnderscoreMatch[1]}_${camelUnderscoreMatch[2]}`);
  }

  const upperMatch = base.match(/^UF_CRM_(\d+)_(\d+)$/i);
  if (upperMatch) {
    variants.add(`UfCrm${upperMatch[1]}${upperMatch[2]}`);
    variants.add(`ufCrm${upperMatch[1]}${upperMatch[2]}`);
    variants.add(`ufCrm${upperMatch[1]}_${upperMatch[2]}`);
  }

  const camelFlatMatch = base.match(/^(?:U|u)fCrm(\d{2})(\d+)$/);
  if (camelFlatMatch) {
    variants.add(`ufCrm${camelFlatMatch[1]}_${camelFlatMatch[2]}`);
    variants.add(`UF_CRM_${camelFlatMatch[1]}_${camelFlatMatch[2]}`);
  }

  return Array.from(variants);
}

function getFieldValue(item: PlainObject, code: string): unknown {
  for (const key of fieldKeyVariants(code)) {
    if (Object.prototype.hasOwnProperty.call(item, key)) return item[key];
  }

  const itemKeys = Object.keys(item);
  for (const key of fieldKeyVariants(code)) {
    const target = normalizedKey(key);
    const found = itemKeys.find(itemKey => normalizedKey(itemKey) === target);
    if (found) return item[found];
  }

  return undefined;
}

function pickFirstNonEmpty(item: PlainObject, codes: string[]): string {
  for (const code of codes) {
    const value = plain(getFieldValue(item, code) ?? item[code]);
    if (value) return value;
  }
  return "";
}

function extractPhone(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    const first = toPlainRecord(value[0]);
    return plain(first.VALUE || first.value || first.VALUE_NUMBER);
  }
  return plain(value);
}

function extractEmail(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    const first = toPlainRecord(value[0]);
    return plain(first.VALUE || first.value);
  }
  return plain(value);
}

function isContractStatusActive(status: string): boolean {
  const value = plain(status).toLowerCase();
  if (!value) return false;
  return /(\u0434\u0435\u0439\u0441\u0442\u0432|\u0430\u043a\u0442\u0438\u0432|active|valid|\u0432 \u0440\u0430\u0431\u043e\u0442\u0435)/i.test(value);
}

function choosePrimaryContract(contracts: ContractSnapshot[]): ContractSnapshot | null {
  if (contracts.length === 0) return null;

  return [...contracts].sort((left, right) => {
    const activeDiff = Number(right.isActive) - Number(left.isActive);
    if (activeDiff !== 0) return activeDiff;

    const leftDate = left.endDate || left.startDate || left.contractDate || "";
    const rightDate = right.endDate || right.startDate || right.contractDate || "";
    return rightDate.localeCompare(leftDate);
  })[0];
}

async function parseRequestPayload(req: Request): Promise<PlainObject> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const json = await req.json();
      return json && typeof json === "object" ? json as PlainObject : {};
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

async function callBitrixRestMethod(method: string, params: PlainObject): Promise<unknown> {
  if (!BITRIX_WEBHOOK_URL) {
    throw new Error("BITRIX_WEBHOOK_URL is not configured");
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${BITRIX_WEBHOOK_URL}/${method}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const text = await response.text();
      const body = text ? toPlainRecord(JSON.parse(text)) : {};

      if (!response.ok) {
        const error = new Error(`Bitrix HTTP ${response.status} at ${method}: ${text || "empty response"}`);
        lastError = error;
        if (attempt < 4 && (response.status === 429 || response.status >= 500)) {
          await sleep(350 * attempt);
          continue;
        }
        throw error;
      }

      if (body.error) {
        const code = plain(body.error).toUpperCase();
        const description = plain(body.error_description || body.error);
        const error = new Error(`Bitrix ${method} error ${code}: ${description || "Unknown Bitrix error"}`);
        lastError = error;
        if (attempt < 4 && /QUERY_LIMIT_EXCEEDED|TOO_MANY_REQUESTS|TIMEOUT/.test(code)) {
          await sleep(350 * attempt);
          continue;
        }
        throw error;
      }

      return body.result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      lastError = error instanceof Error ? error : new Error(message);
      if (attempt < 4 && /failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
        await sleep(350 * attempt);
        continue;
      }
    }
  }

  throw lastError || new Error(`Bitrix call failed: ${method}`);
}

function normalizedKey(value: string): string {
  return plain(value)
    .toLowerCase()
    .replace(/[{}_\s[\].-]/g, "");
}

function resolveUpdateFieldKey(item: PlainObject, code: string): string {
  const variants = fieldKeyVariants(code);
  for (const variant of variants) {
    if (variant in item) return variant;
  }

  const itemKeys = Object.keys(item);
  for (const variant of variants) {
    const target = normalizedKey(variant);
    const found = itemKeys.find(key => normalizedKey(key) === target);
    if (found) return found;
  }

  return plain(code);
}

function parseHrDateValue(value: unknown): string | null {
  const raw = firstScalarValue(value);
  if (!raw) return null;

  const isoDateMatch = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/);
  if (isoDateMatch) return isoDateMatch[1];

  const ruDateMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[T\s].*)?$/);
  if (ruDateMatch) return `${ruDateMatch[3]}-${ruDateMatch[2]}-${ruDateMatch[1]}`;

  return null;
}

function parseIsoDateToUtcTimestamp(value: string): number | null {
  const match = plain(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
  return plain(value).replace(/\s+/g, " ").toLowerCase();
}

function trimNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function parseItemId(value: unknown): string {
  const raw = plain(value);
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw;
  const mDoc = raw.match(/^SPA_(\d+)_(\d+)$/i);
  if (mDoc) return mDoc[2];
  const m = raw.match(/(\d+)$/);
  return m ? m[1] : "";
}

function parseEntityTypeId(value: unknown): number | null {
  const raw = plain(value);
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

type MorpherCaseName = "genitive" | "dative";

async function fetchMorpherForms(value: string): Promise<PlainObject> {
  const text = plain(value);
  if (!text) return {};

  const url = new URL("https://ws3.morpher.ru/russian/declension");
  url.searchParams.set("s", text);
  url.searchParams.set("format", "json");

  const headers: Record<string, string> = {};
  if (MORPHER_API_TOKEN) {
    headers.authorization = `Bearer ${MORPHER_API_TOKEN}`;
  }

  const response = await fetch(url, { method: "GET", headers });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Morpher HTTP ${response.status}: ${raw || "empty response"}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json") || raw.trim().startsWith("{")) {
    try {
      return raw ? JSON.parse(raw) as PlainObject : {};
    } catch {
      return {};
    }
  }

  const forms: PlainObject = {
    "\u0420":
      trimNonEmptyString(raw.match(/<Р>([^<]+)<\/Р>/u)?.[1]) ||
      trimNonEmptyString(raw.match(/<r>([^<]+)<\/r>/i)?.[1]) ||
      "",
    "\u0414":
      trimNonEmptyString(raw.match(/<Д>([^<]+)<\/Д>/u)?.[1]) ||
      trimNonEmptyString(raw.match(/<d>([^<]+)<\/d>/i)?.[1]) ||
      "",
  };

  if (!plain(forms["\u0420"]) && !plain(forms["\u0414"])) {
    throw new Error(`Morpher response without expected cases: ${raw || "empty response"}`);
  }

  return forms;
}

function requireMorpherCase(forms: PlainObject, caseName: MorpherCaseName): string {
  const fieldMap: Record<MorpherCaseName, string[]> = {
    genitive: ["\u0420", "r"],
    dative: ["\u0414", "d"],
  };

  for (const key of fieldMap[caseName]) {
    const value = plain(forms[key]);
    if (value) return value;
  }

  throw new Error(`Morpher response without ${caseName} case`);
}

async function toMorpherCase(value: string, caseName: MorpherCaseName): Promise<string> {
  const text = plain(value);
  if (!text) return "";

  return requireMorpherCase(await fetchMorpherForms(text), caseName);
}

function startDatePaths(): string[] {
  return [
    "startDate",
    "start_date",
    "dateStart",
    "date_start",
    "beginDate",
    "begin_date",
    HR_START_DATE_FIELD,
    ...fieldKeyVariants(HR_START_DATE_FIELD),
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
    HR_END_DATE_FIELD,
    ...fieldKeyVariants(HR_END_DATE_FIELD),
  ];
}

async function runHrFieldSync(source: string, eventName: string, body: PlainObject) {
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
    return {
      ok: true,
      ignored: true,
      scope: "hr_fields",
      source,
      eventName,
      reason: "Missing itemId for HR webhook event",
    };
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
    ) ?? extractEventEntityTypeId(body) ?? HR_ENTITY_TYPE_ID;

  if (entityTypeId !== HR_ENTITY_TYPE_ID) {
    return {
      ok: true,
      ignored: true,
      scope: "hr_fields",
      source,
      eventName,
      reason: `Entity type ${entityTypeId} is not target ${HR_ENTITY_TYPE_ID}`,
      itemId,
      entityTypeId,
    };
  }

  const itemResult = await callBitrixRestMethod("crm.item.get", { entityTypeId, id: itemId });
  const item = toPlainRecord(toPlainRecord(itemResult).item || itemResult);
  const fieldsToUpdate: PlainObject = {};
  const warnings: string[] = [];

  const rawStartDate = pickFormOrJson(body, startDatePaths()) ?? getFieldValue(item, HR_START_DATE_FIELD);
  const rawEndDate = pickFormOrJson(body, endDatePaths()) ?? getFieldValue(item, HR_END_DATE_FIELD);
  const rawPosition =
    pickFormOrJson(body, [
      "position",
      "jobTitle",
      "job_title",
      HR_POSITION_FIELD,
      ...fieldKeyVariants(HR_POSITION_FIELD),
    ]) ?? getFieldValue(item, HR_POSITION_FIELD);
  const rawExternalEmployeeFullName =
    pickFormOrJson(body, [
      "externalEmployeeFullName",
      "external_employee_full_name",
      "externalEmployeeFio",
      "external_employee_fio",
      HR_EXTERNAL_EMPLOYEE_FULL_NAME_FIELD,
      ...fieldKeyVariants(HR_EXTERNAL_EMPLOYEE_FULL_NAME_FIELD),
    ]) ?? getFieldValue(item, HR_EXTERNAL_EMPLOYEE_FULL_NAME_FIELD);
  const rawExternalPosition =
    pickFormOrJson(body, [
      "externalEmployeePosition",
      "external_employee_position",
      "externalPosition",
      "external_position",
      HR_EXTERNAL_POSITION_FIELD,
      ...fieldKeyVariants(HR_EXTERNAL_POSITION_FIELD),
    ]) ?? getFieldValue(item, HR_EXTERNAL_POSITION_FIELD);

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
    startDate = parseHrDateValue(rawStartDate);
    endDate = parseHrDateValue(rawEndDate);

    if (!startDate) {
      daysError = `Cannot read start date from ${HR_START_DATE_FIELD}`;
    } else if (!endDate) {
      daysError = `Cannot read end date from ${HR_END_DATE_FIELD}`;
    } else {
      days = calculateInclusiveDays(startDate, endDate);
      if (days === null) {
        daysError = "End date must be the same as or later than start date";
      } else {
        daysWords = numberToWordsRu(days);
        const currentDays = toNumberOrNull(getFieldValue(item, HR_DAYS_NUMBER_FIELD));
        const currentWords = normalizeComparableText(getFieldValue(item, HR_DAYS_WORDS_FIELD));

        updateDaysNumberFieldKey = resolveUpdateFieldKey(item, HR_DAYS_NUMBER_FIELD);
        updateDaysWordsFieldKey = resolveUpdateFieldKey(item, HR_DAYS_WORDS_FIELD);

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
      const currentGenitive = normalizeComparableText(getFieldValue(item, HR_POSITION_GENITIVE_FIELD));

      if (currentGenitive !== normalizeComparableText(genitivePosition)) {
        updatePositionFieldKey = resolveUpdateFieldKey(item, HR_POSITION_GENITIVE_FIELD);
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
      const currentInitials = normalizeComparableText(getFieldValue(item, HR_EXTERNAL_EMPLOYEE_INITIALS_FIELD));
      if (currentInitials !== normalizeComparableText(externalEmployeeInitials)) {
        updateExternalEmployeeInitialsFieldKey = resolveUpdateFieldKey(item, HR_EXTERNAL_EMPLOYEE_INITIALS_FIELD);
        fieldsToUpdate[updateExternalEmployeeInitialsFieldKey] = externalEmployeeInitials;
      }
    }

    try {
      const externalEmployeeForms = await fetchMorpherForms(sourceExternalEmployeeFullName);
      externalEmployeeGenitive = requireMorpherCase(externalEmployeeForms, "genitive");
      hasExternalEmployeeGenitiveSuccess = Boolean(externalEmployeeGenitive);
      const currentExternalEmployeeGenitive = normalizeComparableText(
        getFieldValue(item, HR_EXTERNAL_EMPLOYEE_GENITIVE_FIELD),
      );

      if (currentExternalEmployeeGenitive !== normalizeComparableText(externalEmployeeGenitive)) {
        updateExternalEmployeeGenitiveFieldKey = resolveUpdateFieldKey(item, HR_EXTERNAL_EMPLOYEE_GENITIVE_FIELD);
        fieldsToUpdate[updateExternalEmployeeGenitiveFieldKey] = externalEmployeeGenitive;
      }

      externalEmployeeDative = requireMorpherCase(externalEmployeeForms, "dative");
      hasExternalEmployeeDativeSuccess = Boolean(externalEmployeeDative);
      const currentExternalEmployeeDative = normalizeComparableText(
        getFieldValue(item, HR_EXTERNAL_EMPLOYEE_DATIVE_FIELD),
      );

      if (currentExternalEmployeeDative !== normalizeComparableText(externalEmployeeDative)) {
        updateExternalEmployeeDativeFieldKey = resolveUpdateFieldKey(item, HR_EXTERNAL_EMPLOYEE_DATIVE_FIELD);
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
        getFieldValue(item, HR_EXTERNAL_POSITION_GENITIVE_LOWER_FIELD),
      );

      if (currentExternalPositionGenitive !== normalizeComparableText(externalPositionGenitiveLower)) {
        updateExternalPositionFieldKey = resolveUpdateFieldKey(item, HR_EXTERNAL_POSITION_GENITIVE_LOWER_FIELD);
        fieldsToUpdate[updateExternalPositionFieldKey] = externalPositionGenitiveLower;
      }

      const currentExternalPositionDative = normalizeComparableText(
        getFieldValue(item, HR_EXTERNAL_POSITION_DATIVE_LOWER_FIELD),
      );

      if (currentExternalPositionDative !== normalizeComparableText(externalPositionDativeLower)) {
        updateExternalPositionDativeFieldKey = resolveUpdateFieldKey(item, HR_EXTERNAL_POSITION_DATIVE_LOWER_FIELD);
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

  if (firstBlockingError && !hasAnySuccess) {
    throw new Error(firstBlockingError);
  }

  if (daysError) warnings.push(daysError);
  if (positionError) warnings.push(positionError);
  if (externalEmployeeError) warnings.push(externalEmployeeError);
  if (externalPositionError) warnings.push(externalPositionError);

  const updateFieldKeys = Object.keys(fieldsToUpdate);
  if (updateFieldKeys.length > 0) {
    await callBitrixRestMethod("crm.item.update", {
      entityTypeId,
      id: itemId,
      fields: fieldsToUpdate,
    });
  }

  console.log(JSON.stringify({
    stage: "hr-field-sync",
    source,
    eventName,
    itemId,
    entityTypeId,
    updated: updateFieldKeys.length > 0,
    sourcePosition,
    genitivePosition,
    sourceExternalEmployeeFullName,
    externalEmployeeInitials,
    externalEmployeeGenitive,
    externalEmployeeDative,
    sourceExternalPosition,
    externalPositionGenitiveLower,
    externalPositionDativeLower,
    warnings,
    updateFieldKeys,
    updatePositionFieldKey,
    updateExternalEmployeeInitialsFieldKey,
    updateExternalEmployeeGenitiveFieldKey,
    updateExternalEmployeeDativeFieldKey,
    updateExternalPositionFieldKey,
    updateExternalPositionDativeFieldKey,
  }));

  return {
    ok: true,
    scope: "hr_fields",
    source,
    eventName,
    itemId,
    entityTypeId,
    updated: updateFieldKeys.length > 0,
    partial: Boolean(daysError || positionError || externalEmployeeError || externalPositionError),
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
    updateFieldKeys,
    updateDaysNumberFieldKey,
    updateDaysWordsFieldKey,
    updatePositionFieldKey,
    updateExternalEmployeeInitialsFieldKey,
    updateExternalEmployeeGenitiveFieldKey,
    updateExternalEmployeeDativeFieldKey,
    updateExternalPositionFieldKey,
    updateExternalPositionDativeFieldKey,
  };
}

async function resolveCompanyBinFieldCodes(): Promise<string[]> {
  const result = new Set<string>(COMPANY_BIN_FIELD_CANDIDATES);

  try {
    const raw = await callBitrixRestMethod("crm.company.fields", {});
    const fields = toPlainRecord(toPlainRecord(raw).fields || raw);

    for (const [key, value] of Object.entries(fields)) {
      const field = toPlainRecord(value);
      const title = decodeUnicodeEscapes(plain(field.title || field.formLabel || field.LIST_LABEL)).toLowerCase();
      const code = plain(field.name || field.fieldName || field.FIELD_NAME || key).toUpperCase();
      const byCode = /\bBIN\b|\bIIN\b/.test(code);
      const byTitle = /(\u0431\u0438\u043d|\u0438\u0438\u043d|bin|iin)/i.test(title);
      if ((byCode || byTitle) && code.startsWith("UF_CRM_")) {
        result.add(code);
        const camel = companyUfCamelFromUpper(code);
        if (camel) result.add(camel);
      }
    }
  } catch {
    // best effort
  }

  return Array.from(result);
}

async function listAllBitrixCompanies(): Promise<PlainObject[]> {
  const out: PlainObject[] = [];
  const batchSize = 50;
  const maxPages = 120;

  for (let page = 0; page < maxPages; page++) {
    const start = page * batchSize;
    const raw = await callBitrixRestMethod("crm.company.list", {
      order: { ID: "ASC" },
      start,
      select: ["ID", "TITLE", "PHONE", "EMAIL", "UF_*"],
    });
    const rows = extractListRows(raw);
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < batchSize) break;
  }

  return out;
}

async function listAllBitrixSmartItems(entityTypeId: number): Promise<PlainObject[]> {
  const out: PlainObject[] = [];
  const batchSize = 50;
  const maxPages = 120;

  for (let page = 0; page < maxPages; page++) {
    const start = page * batchSize;
    const raw = await callBitrixRestMethod("crm.item.list", {
      entityTypeId,
      order: { id: "ASC" },
      start,
      select: ["id", "title", "companyId", "COMPANY_ID", "*", "uf*"],
    });
    const rows = extractListRows(raw);
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < batchSize) break;
  }

  return out;
}

async function resolveContractFieldMap(entityTypeId: number): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  try {
    const raw = await callBitrixRestMethod("crm.item.fields", { entityTypeId });
    const fields = toPlainRecord(toPlainRecord(raw).fields || raw);

    const entries = Object.entries(fields).map(([key, value]) => {
      const field = toPlainRecord(value);
      const rawTitle = plain(field.title || field.formLabel || field.LIST_LABEL);
      const upperName = plain(field.upperName || field.FIELD_NAME || key);

      return {
        key,
        upperName,
        title: decodeUnicodeEscapes(rawTitle).toLowerCase(),
        keyProbe: `${key} ${upperName}`.toLowerCase(),
        isUserField: /^uf_/i.test(key) || /^uf_/i.test(upperName),
      };
    });

    const findByTitleOrKey = (
      titlePatterns: RegExp[],
      keyPatterns: RegExp[],
      options?: { preferUserFields?: boolean; disallowSystemFallback?: boolean },
    ) => {
      const userEntries = entries.filter(entry => entry.isUserField);
      const prioritized = options?.preferUserFields
        ? [...userEntries, ...entries.filter(entry => !entry.isUserField)]
        : entries;
      const source = options?.disallowSystemFallback ? userEntries : prioritized;

      const byTitle = source.find(entry => titlePatterns.some(pattern => pattern.test(entry.title)));
      if (byTitle) return byTitle.upperName || byTitle.key || "";

      const byKey = source.find(entry => keyPatterns.some(pattern => pattern.test(entry.keyProbe)));
      return byKey ? (byKey.upperName || byKey.key || "") : "";
    };

    map.company = findByTitleOrKey(
      [/\u043a\u043e\u043c\u043f\u0430\u043d/, /\u043a\u043b\u0438\u0435\u043d\u0442/, /client/, /company/],
      [/(^|_)company(_id)?($|_)/, /client/],
    );
    map.number = findByTitleOrKey(
      [/\u043d\u043e\u043c\u0435\u0440.*\u0434\u043e\u0433\u043e\u0432\u043e\u0440/, /^\u0434\u043e\u0433\u043e\u0432\u043e\u0440\s*№?/, /contract.*number/],
      [/(contract|dogovor).*(number|num|nomer)/, /(number|num|nomer).*(contract|dogovor)/],
    );
    map.contractDate = findByTitleOrKey(
      [/\u0434\u0430\u0442\u0430.*\u0434\u043e\u0433\u043e\u0432\u043e\u0440/, /contract.*date/],
      [/(contract|dogovor).*(date|data)/],
      { preferUserFields: true, disallowSystemFallback: true },
    );
    map.startDate = findByTitleOrKey(
      [/\u0434\u0430\u0442\u0430.*\u043d\u0430\u0447/, /\u0434\u0435\u0439\u0441\u0442\u0432.*\u0441/, /date.*start/, /start.*date/],
      [/(start|begin|from|date_start|date_begin)/],
      { preferUserFields: true, disallowSystemFallback: true },
    );
    map.endDate = findByTitleOrKey(
      [/\u0434\u0430\u0442\u0430.*\u043e\u043a\u043e\u043d\u0447/, /\u0434\u0435\u0439\u0441\u0442\u0432.*\u043f\u043e/, /date.*end/, /end.*date/],
      [/(end|finish|to|expire|close|date_end|date_close)/],
      { preferUserFields: true, disallowSystemFallback: true },
    );
    map.status = findByTitleOrKey(
      [/^\u0441\u0442\u0430\u0442\u0443\u0441$/, /contract.*status/, /\u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435/],
      [/(^|_)(status|stage)(_|$)/],
    );

    if (!map.company) map.company = "companyId";
    if (!map.status) map.status = "stageId";
  } catch {
    // best effort
  }

  return map;
}

async function fetchCompanyDirectorySnapshotFromBitrix(): Promise<{
  rows: CompanyDirectoryRow[];
  companiesCount: number;
  contractsCount: number;
}> {
  const [companiesRaw, contractsRaw, binFieldCodes, contractFieldMap] = await Promise.all([
    listAllBitrixCompanies(),
    listAllBitrixSmartItems(CONTRACT_ENTITY_TYPE_ID),
    resolveCompanyBinFieldCodes(),
    resolveContractFieldMap(CONTRACT_ENTITY_TYPE_ID),
  ]);

  const companyById = new Map<string, CompanyDirectoryRow>();
  for (const row of companiesRaw) {
    const bitrixId = plain(row.ID || row.id);
    if (!bitrixId) continue;

    const binValue = pickFirstNonEmpty(row, binFieldCodes);
    companyById.set(bitrixId, {
      bitrix_company_id: bitrixId,
      name: plain(row.TITLE || row.title),
      bin_iin: plain(binValue),
      bin_iin_digits: digits(binValue),
      phone: extractPhone(row.PHONE || row.phone),
      email: extractEmail(row.EMAIL || row.email),
      city: plain(row.CITY || row.UF_CRM_CITY || row.UF_CRM_1772560175),
      has_contract: false,
      contract_count: 0,
      contract_bitrix_id: "",
      contract_title: "",
      contract_number: "",
      contract_date: null,
      contract_start: null,
      contract_end: null,
      contract_status: "",
      contract_is_active: false,
    });
  }

  const contractsByCompanyId = new Map<string, ContractSnapshot[]>();
  const today = new Date().toISOString().slice(0, 10);

  for (const item of contractsRaw) {
    const contractId = plain(item.id || item.ID);
    const title = plain(item.title || item.TITLE);
    const companyId = plain(
      item.companyId ||
      item.COMPANY_ID ||
      (contractFieldMap.company ? getFieldValue(item, contractFieldMap.company) : "")
    );
    if (!contractId || !companyId) continue;

    const number = plain(
      (contractFieldMap.number ? getFieldValue(item, contractFieldMap.number) : "") ||
      getFieldValue(item, "number") ||
      getFieldValue(item, "contractNumber") ||
      getFieldValue(item, "contract_number") ||
      title
    );
    const contractDate = normalizeDateValue(
      contractFieldMap.contractDate ? getFieldValue(item, contractFieldMap.contractDate) : null
    );
    const startDate = normalizeDateValue(
      contractFieldMap.startDate ? getFieldValue(item, contractFieldMap.startDate) : null
    );
    const endDate = normalizeDateValue(
      contractFieldMap.endDate ? getFieldValue(item, contractFieldMap.endDate) : null
    );
    const status = plain(
      (contractFieldMap.status ? getFieldValue(item, contractFieldMap.status) : "") ||
      getFieldValue(item, "status") ||
      getFieldValue(item, "stageId")
    );
    const isActiveByDate = Boolean(startDate && endDate && startDate <= endDate && startDate <= today && endDate >= today);

    const contract: ContractSnapshot = {
      id: contractId,
      title,
      number,
      contractDate,
      startDate,
      endDate,
      status,
      isActive: isContractStatusActive(status) || isActiveByDate,
    };

    const list = contractsByCompanyId.get(companyId) || [];
    list.push(contract);
    contractsByCompanyId.set(companyId, list);
  }

  for (const [companyId, contracts] of contractsByCompanyId.entries()) {
    const target = companyById.get(companyId);
    if (!target) continue;

    const primary = choosePrimaryContract(contracts);
    target.has_contract = contracts.length > 0;
    target.contract_count = contracts.length;

    if (primary) {
      target.contract_bitrix_id = primary.id;
      target.contract_title = primary.title;
      target.contract_number = primary.number;
      target.contract_date = primary.contractDate;
      target.contract_start = primary.startDate;
      target.contract_end = primary.endDate;
      target.contract_status = primary.status;
      target.contract_is_active = primary.isActive;
    }
  }

  return {
    rows: Array.from(companyById.values()),
    companiesCount: companiesRaw.length,
    contractsCount: contractsRaw.length,
  };
}

function normalizeListField(entry: [string, unknown]): BitrixListFieldDefinition {
  const [fieldId, raw] = entry;
  const field = toPlainRecord(raw);
  const displayValuesRaw = toPlainRecord(field.DISPLAY_VALUES_FORM);

  return {
    fieldId: plain(field.FIELD_ID || fieldId),
    code: plain(field.CODE),
    name: plain(field.NAME),
    displayValues: Object.fromEntries(
      Object.entries(displayValuesRaw).map(([key, value]) => [key, plain(value)])
    ),
  };
}

function findField(
  fields: BitrixListFieldDefinition[],
  params: { code?: string; name?: string; fieldId?: string },
): BitrixListFieldDefinition | null {
  const targetCode = plain(params.code).toLowerCase();
  const targetName = plain(params.name).toLowerCase();
  const targetFieldId = plain(params.fieldId).toLowerCase();

  return fields.find(field => {
    const fieldCode = field.code.toLowerCase();
    const fieldName = field.name.toLowerCase();
    const fieldFieldId = field.fieldId.toLowerCase();
    return (
      (targetCode && fieldCode === targetCode) ||
      (targetName && fieldName === targetName) ||
      (targetFieldId && fieldFieldId === targetFieldId)
    );
  }) || null;
}

function resolveFieldDisplayValue(field: BitrixListFieldDefinition | null, rawValue: unknown): string {
  const scalar = firstScalarValue(rawValue);
  if (!scalar) return "";
  return field?.displayValues[scalar] || scalar;
}

function resolveFieldNumberValue(rawValue: unknown): number | null {
  const scalar = firstScalarValue(rawValue).replace(",", ".");
  if (!scalar) return null;
  const parsed = Number(scalar);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveFieldMoneyValue(rawValue: unknown): number | null {
  const visit = (value: unknown): number | null => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string") {
      const normalized = value
        .split("|")[0]
        .replace(/\s+/g, "")
        .replace(",", ".")
        .replace(/[^\d.-]/g, "");
      if (!normalized) return null;
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const parsed = visit(item);
        if (parsed !== null) return parsed;
      }
      return null;
    }

    if (value && typeof value === "object") {
      const record = value as PlainObject;
      for (const key of ["VALUE", "value", "AMOUNT", "amount", "PRICE", "price"]) {
        if (!(key in record)) continue;
        const parsed = visit(record[key]);
        if (parsed !== null) return parsed;
      }
      for (const nested of Object.values(record)) {
        const parsed = visit(nested);
        if (parsed !== null) return parsed;
      }
    }

    return null;
  };

  return visit(rawValue);
}

function buildDocumentValidityDetails(
  raw: PlainObject,
  fields: BitrixListFieldDefinition[],
): BitrixDocumentValidityDetails {
  const courseField = findField(fields, { code: "UKE", name: "Наименование курсов", fieldId: "PROPERTY_874" });
  const categoryField = findField(fields, { code: "KATEGORIYA", name: "Категория", fieldId: "PROPERTY_876" });
  const documentTypeField = findField(fields, { code: "TIP_DOKUMENTA", name: "Тип документа", fieldId: "PROPERTY_878" });
  const durationField = findField(fields, { code: "SROK_GOD", name: "Срок (год)", fieldId: "PROPERTY_880" });

  return {
    course_name: resolveFieldDisplayValue(courseField, courseField ? raw[courseField.fieldId] : raw.NAME) || plain(raw.NAME),
    category: resolveFieldDisplayValue(categoryField, categoryField ? raw[categoryField.fieldId] : ""),
    document_type: resolveFieldDisplayValue(documentTypeField, documentTypeField ? raw[documentTypeField.fieldId] : ""),
    duration_value: resolveFieldNumberValue(durationField ? raw[durationField.fieldId] : ""),
    duration_unit: "year",
  };
}

function buildCoursePriceDetails(
  raw: PlainObject,
  fields: BitrixListFieldDefinition[],
): BitrixCoursePriceDetails {
  const courseField = findField(fields, { code: "NAIMENOVANIE_KURSOV", fieldId: "PROPERTY_948" });
  const qualificationField = findField(fields, { code: "KVALIFIKATSIYA", fieldId: "PROPERTY_952" });
  const electricalSafetyGroupField = findField(fields, { code: "GRUPPA_ELEKTROBEZOPASNOST_", fieldId: "PROPERTY_960" });
  const categoryField = findField(fields, { code: "KATEGORIYA", fieldId: "PROPERTY_950" });
  const priceField = findField(fields, { code: "TSENA", fieldId: "PROPERTY_946" });

  return {
    course_name: resolveFieldDisplayValue(courseField, courseField ? raw[courseField.fieldId] : raw.NAME) || plain(raw.NAME),
    qualification: resolveFieldDisplayValue(qualificationField, qualificationField ? raw[qualificationField.fieldId] : ""),
    electrical_safety_group: resolveFieldDisplayValue(
      electricalSafetyGroupField,
      electricalSafetyGroupField ? raw[electricalSafetyGroupField.fieldId] : "",
    ),
    category: resolveFieldDisplayValue(categoryField, categoryField ? raw[categoryField.fieldId] : ""),
    price: resolveFieldMoneyValue(priceField ? raw[priceField.fieldId] : ""),
  };
}

function buildElectricalSafetyAdmissionDetails(
  raw: PlainObject,
  fields: BitrixListFieldDefinition[],
): BitrixElectricalSafetyAdmissionDetails {
  const categoryField = findField(fields, { code: "KATEGORIYA", fieldId: "PROPERTY_954" });

  return {
    category: resolveFieldDisplayValue(categoryField, categoryField ? raw[categoryField.fieldId] : ""),
  };
}

function buildElectricalSafetyGroupDetails(
  raw: PlainObject,
  fields: BitrixListFieldDefinition[],
): BitrixElectricalSafetyGroupDetails {
  const textField = findField(fields, { code: "TEKST_V_DOKUMENTE", fieldId: "PROPERTY_956" });

  return {
    text_in_document: resolveFieldDisplayValue(textField, textField ? raw[textField.fieldId] : ""),
  };
}

function buildCommissionMemberDetails(
  raw: PlainObject,
  fields: BitrixListFieldDefinition[],
): BitrixCommissionMemberDetails {
  const cityField = findField(fields, { code: "GOROD", fieldId: "PROPERTY_962" });
  const myCompanyField = findField(fields, { code: "MOYA_KOMPANIYA", fieldId: "PROPERTY_964" });

  return {
    city: resolveFieldDisplayValue(cityField, cityField ? raw[cityField.fieldId] : ""),
    my_company: resolveFieldDisplayValue(myCompanyField, myCompanyField ? raw[myCompanyField.fieldId] : ""),
    main_text: plain(raw.PREVIEW_TEXT || raw.previewText),
  };
}

function resolveMyCompanyShortName(
  raw: PlainObject,
  fields: BitrixListFieldDefinition[],
): string {
  const shortNameField = findField(fields, {
    code: "KRATKOE_NAZVANIE",
    name: "Краткое название",
    fieldId: "PROPERTY_456",
  });

  return resolveFieldDisplayValue(
    shortNameField,
    shortNameField ? raw[shortNameField.fieldId] : raw.PROPERTY_456,
  );
}

function resolveMyCompanyVisibleInApp(
  raw: PlainObject,
  fields: BitrixListFieldDefinition[],
): boolean {
  const displayField = findField(fields, {
    code: "PRILOZHENIE_OTOBR",
    fieldId: "PROPERTY_938",
  });
  const value = resolveFieldDisplayValue(
    displayField,
    displayField ? raw[displayField.fieldId] : raw.PROPERTY_938,
  ).toLocaleLowerCase("ru");

  return value === "да" || value === "yes" || value === "y" || value === "true" || value === "1";
}

function resolveMyCompanyChairman(
  raw: PlainObject,
  fields: BitrixListFieldDefinition[],
): string {
  const chairmanField = findField(fields, {
    code: "PREDSEDATEL_PRILOZH_",
    fieldId: "PROPERTY_940",
  });

  return resolveFieldDisplayValue(
    chairmanField,
    chairmanField ? raw[chairmanField.fieldId] : raw.PROPERTY_940,
  );
}

function listRequiresFieldMetadata(iblockId: number): boolean {
  return iblockId === BITRIX_REFERENCE_LISTS.DOCUMENT_VALIDITY.iblockId ||
    iblockId === BITRIX_REFERENCE_LISTS.MY_COMPANIES.iblockId ||
    iblockId === BITRIX_REFERENCE_LISTS.COURSE_PRICES.iblockId ||
    iblockId === BITRIX_REFERENCE_LISTS.ELECTRICAL_SAFETY_ADMISSION.iblockId ||
    iblockId === BITRIX_REFERENCE_LISTS.ELECTRICAL_SAFETY_GROUP.iblockId ||
    iblockId === BITRIX_REFERENCE_LISTS.COMMISSION_MEMBERS.iblockId;
}

function normalizeListElement(
  raw: PlainObject,
  index: number,
  iblockId: number,
  fields: BitrixListFieldDefinition[],
): BitrixListElement | null {
  const id = plain(raw.ID || raw.id);
  const baseName = plain(raw.NAME || raw.name);
  if (!id || !baseName) return null;

  const isMyCompaniesList = iblockId === BITRIX_REFERENCE_LISTS.MY_COMPANIES.iblockId;
  if (isMyCompaniesList && !resolveMyCompanyVisibleInApp(raw, fields)) return null;

  const sortRaw = Number(raw.SORT || raw.sort || 0);
  const resolvedName = isMyCompaniesList
    ? resolveMyCompanyShortName(raw, fields) || baseName
    : baseName;
  const resolvedChairman = isMyCompaniesList
    ? resolveMyCompanyChairman(raw, fields)
    : "";

  return {
    id,
    name: resolvedName,
    code: resolvedChairman || plain(raw.CODE || raw.code),
    sortOrder: Number.isFinite(sortRaw) && sortRaw > 0 ? sortRaw : index + 1,
    details:
      iblockId === BITRIX_REFERENCE_LISTS.DOCUMENT_VALIDITY.iblockId
        ? buildDocumentValidityDetails(raw, fields)
        : iblockId === BITRIX_REFERENCE_LISTS.COURSE_PRICES.iblockId
          ? buildCoursePriceDetails(raw, fields)
          : iblockId === BITRIX_REFERENCE_LISTS.ELECTRICAL_SAFETY_ADMISSION.iblockId
            ? buildElectricalSafetyAdmissionDetails(raw, fields)
            : iblockId === BITRIX_REFERENCE_LISTS.ELECTRICAL_SAFETY_GROUP.iblockId
              ? buildElectricalSafetyGroupDetails(raw, fields)
              : iblockId === BITRIX_REFERENCE_LISTS.COMMISSION_MEMBERS.iblockId
                ? buildCommissionMemberDetails(raw, fields)
          : null,
  };
}

async function callBitrixListMethod(method: string, params: Record<string, string | number>): Promise<unknown> {
  if (!BITRIX_WEBHOOK_URL) {
    throw new Error("BITRIX_WEBHOOK_URL is not configured");
  }

  const url = `${BITRIX_WEBHOOK_URL}/${method}.json`;
  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        body.append(key, String(value));
      }

      const response = await fetch(url, {
        method: "POST",
        body,
      });

      const bodyText = await response.text();
      let data: PlainObject = {};
      try {
        data = bodyText ? JSON.parse(bodyText) as PlainObject : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const error = new Error(`Bitrix HTTP ${response.status} at ${method}: ${bodyText || "empty response"}`);
        lastError = error;
        if (attempt < maxAttempts && (response.status === 429 || response.status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, 350 * attempt));
          continue;
        }
        throw error;
      }

      if (data.error) {
        const code = plain(data.error).toUpperCase();
        const description = plain(data.error_description || data.error || "Unknown Bitrix error");
        const error = new Error(`Bitrix ${method} error ${code}: ${description}`);
        lastError = error;
        if (attempt < maxAttempts && (code === "QUERY_LIMIT_EXCEEDED" || code === "TOO_MANY_REQUESTS" || code === "TIMEOUT")) {
          await new Promise(resolve => setTimeout(resolve, 350 * attempt));
          continue;
        }
        throw error;
      }

      return data.result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || "");
      lastError = error instanceof Error ? error : new Error(message);
      const networkLike = /failed to fetch|networkerror|network request failed|load failed/i.test(message);
      if (attempt < maxAttempts && networkLike) {
        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`Bitrix list call failed: ${method}`);
}

async function fetchBitrixListFields(iblockId: number): Promise<BitrixListFieldDefinition[]> {
  const result = await callBitrixListMethod("lists.field.get", {
    IBLOCK_TYPE_ID: resolveBitrixListTypeId(iblockId),
    IBLOCK_ID: iblockId,
  });
  return Object.entries(toPlainRecord(result)).map(normalizeListField);
}

async function fetchBitrixListElements(iblockId: number): Promise<BitrixListElement[]> {
  const [result, fields] = await Promise.all([
    callBitrixListMethod("lists.element.get", {
      IBLOCK_TYPE_ID: resolveBitrixListTypeId(iblockId),
      IBLOCK_ID: iblockId,
    }),
    listRequiresFieldMetadata(iblockId)
      ? fetchBitrixListFields(iblockId)
      : Promise.resolve([] as BitrixListFieldDefinition[]),
  ]);

  const rows = Array.isArray(result) ? result : [];
  return rows
    .map((row, index) => normalizeListElement(row as PlainObject, index, iblockId, fields))
    .filter((row): row is BitrixListElement => Boolean(row));
}

async function fetchAllReferenceListElements() {
  return await Promise.all(
    BITRIX_REFERENCE_LIST_ORDER.map(async listKey => {
      const definition = BITRIX_REFERENCE_LISTS[listKey];
      const items = await fetchBitrixListElements(definition.iblockId);
      return { listKey, definition, items };
    }),
  );
}

async function upsertSyncStatus(supabase: ReturnType<typeof adminClient>, patch: PlainObject) {
  const payload = {
    scope: SYNC_SCOPE,
    updated_at: new Date().toISOString(),
    ...patch,
  };

  const { error } = await supabase
    .from("reference_sync_status")
    .upsert(payload, { onConflict: "scope" });

  if (error) throw error;
}

async function replaceReferenceTable(
  supabase: ReturnType<typeof adminClient>,
  tableName: "ref_categories" | "ref_courses",
  items: Array<{ name: string; bitrix_value: string; sort_order: number }>,
) {
  const { error: deleteError } = await supabase.from(tableName).delete().gte("sort_order", 0);
  if (deleteError) throw deleteError;

  if (items.length === 0) return;

  const { error: insertError } = await supabase.from(tableName).insert(items.map(item => ({
    ...item,
    updated_at: new Date().toISOString(),
  })));
  if (insertError) throw insertError;
}

async function replaceDocumentValidityRules(
  supabase: ReturnType<typeof adminClient>,
  items: BitrixListElement[],
  now: string,
) {
  const payload = items.map((item, index) => {
    const details = item.details as BitrixDocumentValidityDetails | null;
    const courseName = plain(details?.course_name || item.name);
    const category = plain(details?.category);
    const documentType = plain(details?.document_type);
    const durationValueRaw = details?.duration_value;
    const durationValue = typeof durationValueRaw === "number" ? durationValueRaw : Number(durationValueRaw);

    if (!courseName || !category || !documentType || !Number.isFinite(durationValue) || durationValue <= 0) {
      throw new Error(`Не удалось прочитать правило срока из Bitrix для элемента "${item.name}" (#${item.id})`);
    }

    return {
      course_name: courseName,
      category,
      document_type: documentType,
      duration_value: durationValue,
      duration_unit: details?.duration_unit || "year",
      sort_order: item.sortOrder || index + 1,
      updated_at: now,
    };
  });

  const { error: deleteError } = await supabase.from("ref_document_validity_rules").delete().gte("sort_order", 0);
  if (deleteError) throw deleteError;

  if (payload.length === 0) return;

  const { error: insertError } = await supabase.from("ref_document_validity_rules").insert(payload);
  if (insertError) throw insertError;
}

async function replaceCoursePrices(
  supabase: ReturnType<typeof adminClient>,
  items: BitrixListElement[],
  now: string,
) {
  const payload = items.map((item, index) => {
    const details = item.details as BitrixCoursePriceDetails | null;
    const courseName = plain(details?.course_name || item.name);
    const qualification = plain(details?.qualification);
    const electricalSafetyGroup = plain(details?.electrical_safety_group);
    const category = plain(details?.category);
    const price = details?.price ?? null;

    if (!courseName || !category) {
      throw new Error(`Не удалось прочитать цену курса из Bitrix для элемента "${item.name}" (#${item.id})`);
    }

    return {
      bitrix_item_id: item.id,
      name: item.name,
      course_name: courseName,
      qualification,
      electrical_safety_group: electricalSafetyGroup,
      category,
      price,
      sort_order: item.sortOrder || index + 1,
      updated_at: now,
    };
  });

  const { error: deleteError } = await supabase.from("ref_course_prices").delete().gte("sort_order", 0);
  if (deleteError) throw deleteError;

  if (payload.length === 0) return;

  const { error: insertError } = await supabase.from("ref_course_prices").insert(payload);
  if (insertError) throw insertError;
}

async function replaceCompanyDirectorySnapshot(
  supabase: ReturnType<typeof adminClient>,
  rows: CompanyDirectoryRow[],
  now: string,
) {
  const payload = rows.map(row => ({
    ...row,
    updated_at: now,
  }));

  if (payload.length > 0) {
    const { error: upsertError } = await supabase
      .from("ref_company_directory")
      .upsert(payload, { onConflict: "bitrix_company_id" });
    if (upsertError) throw upsertError;
  }

  if (payload.length === 0) return;

  const { data: existingRows, error: selectError } = await supabase
    .from("ref_company_directory")
    .select("bitrix_company_id");
  if (selectError) throw selectError;

  const nextIds = new Set(payload.map(row => row.bitrix_company_id));
  const staleIds = (existingRows || [])
    .map(row => plain((row as PlainObject).bitrix_company_id))
    .filter(id => id && !nextIds.has(id));

  if (staleIds.length === 0) return;

  const batchSize = 200;
  for (let index = 0; index < staleIds.length; index += batchSize) {
    const batch = staleIds.slice(index, index + batchSize);
    const { error: deleteError } = await supabase
      .from("ref_company_directory")
      .delete()
      .in("bitrix_company_id", batch);
    if (deleteError) throw deleteError;
  }
}

function extractEventEntityTypeId(body: PlainObject): number | null {
  return toNumberOrNull(
    pickFormOrJson(body, [
      "entityTypeId",
      "ENTITY_TYPE_ID",
      "document_id",
      "DOCUMENT_ID",
      "data.FIELDS.ENTITY_TYPE_ID",
      "data.FIELDS.entityTypeId",
      "FIELDS.ENTITY_TYPE_ID",
      "FIELDS.entityTypeId",
      "data[FIELDS][ENTITY_TYPE_ID]",
      "data[FIELDS][entityTypeId]",
      "FIELDS[ENTITY_TYPE_ID]",
      "FIELDS[entityTypeId]",
    ]),
  ) ?? parseEntityTypeId(pickFormOrJson(body, ["document_id", "DOCUMENT_ID"]));
}

function determineSyncTargets(source: string, eventName: string, body: PlainObject): SyncTargets {
  const normalizedEvent = plain(eventName).toUpperCase();
  const entityTypeId = extractEventEntityTypeId(body);

  if (source === "manual-ui" || !normalizedEvent || normalizedEvent === "REFERENCE-SYNC") {
    return {
      syncReferenceLists: true,
      syncCompanyDirectory: true,
      syncHrItem: false,
      ignoreEvent: false,
      entityTypeId,
      reason: "manual or direct reference sync request",
    };
  }

  const isCompanyEvent = /^ONCRMCOMPANY(ADD|UPDATE|DELETE)$/.test(normalizedEvent);
  const isDynamicItemEvent = /^ONCRMDYNAMICITEM(ADD|UPDATE|DELETE)$/.test(normalizedEvent);
  const isFieldMetadataEvent = /(USERFIELD|SETENUMVALUES|LIST|IBLOCK)/.test(normalizedEvent);

  const syncHrItem = isDynamicItemEvent && entityTypeId === HR_ENTITY_TYPE_ID;
  const syncCompanyDirectory = isCompanyEvent || (isDynamicItemEvent && entityTypeId === CONTRACT_ENTITY_TYPE_ID);
  const syncReferenceLists = isFieldMetadataEvent;
  const ignoreEvent = !syncHrItem && !syncReferenceLists && !syncCompanyDirectory;

  return {
    syncReferenceLists,
    syncCompanyDirectory,
    syncHrItem,
    ignoreEvent,
    entityTypeId,
    reason: ignoreEvent
      ? `Ignoring event ${normalizedEvent}${entityTypeId ? ` for entityTypeId ${entityTypeId}` : ""}`
      : `Matched event ${normalizedEvent}`,
  };
}

async function authorizeRequest(req: Request, body: PlainObject, supabase: ReturnType<typeof adminClient>) {
  const url = new URL(req.url);
  const queryToken = plain(url.searchParams.get("token"));
  const headerToken = plain(req.headers.get("x-webhook-token"));
  const bearerToken = plain(req.headers.get("authorization")).replace(/^Bearer\s+/i, "").trim();
  const bodyToken = plain(
    pickFormOrJson(body, [
      "token",
      "webhookToken",
      "secret",
      "auth.application_token",
      "auth[application_token]",
      "auth.applicationToken",
    ]),
  );

  const hasValidWebhookToken = Boolean(
    OUTGOING_TOKEN &&
    [queryToken, headerToken, bodyToken].some(token => token === OUTGOING_TOKEN)
  );

  if (hasValidWebhookToken) {
    console.log(JSON.stringify({
      stage: "authorize",
      mode: "bitrix-webhook",
      hasQueryToken: Boolean(queryToken),
      hasHeaderToken: Boolean(headerToken),
      hasBodyToken: Boolean(bodyToken),
    }));
    return { source: "bitrix-webhook", userId: null };
  }

  if (bearerToken) {
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (!error && data.user) {
      const { data: profile, error: profileError } = await supabase
        .from("app_profiles")
        .select("role, is_active")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileError || !profile || !profile.is_active || profile.role !== "admin") {
        throw new Error("Admin access is required");
      }

      console.log(JSON.stringify({
        stage: "authorize",
        mode: "manual-ui",
        userId: data.user.id,
      }));
      return { source: "manual-ui", userId: data.user.id };
    }
    console.warn(JSON.stringify({
      stage: "authorize",
      mode: "bearer-rejected",
      error: error?.message || "User not found for bearer token",
    }));
  }

  throw new Error("Unauthorized");
}

async function runReferenceSync(source: string, eventName: string, body: PlainObject) {
  const supabase = adminClient();
  const startedAt = new Date().toISOString();
  const targets = determineSyncTargets(source, eventName, body);

  if (!targets.syncReferenceLists && !targets.syncCompanyDirectory) {
    return {
      ok: true,
      ignored: true,
      scope: SYNC_SCOPE,
      source,
      eventName,
      targets,
      reason: targets.reason,
    };
  }

  console.log(JSON.stringify({
    stage: "sync-start",
    source,
    eventName,
    targets,
  }));

  await upsertSyncStatus(supabase, {
    last_started_at: startedAt,
    last_source: source,
    last_event: eventName,
    last_status: "running",
    last_error: "",
  });

  try {
    const now = new Date().toISOString();
    let listsSnapshot: Awaited<ReturnType<typeof fetchAllReferenceListElements>> = [];
    let flatListPayload: Array<{
      list_key: string;
      list_name: string;
      iblock_id: number;
      bitrix_item_id: string;
      name: string;
      bitrix_value: string;
      code: string;
      sort_order: number;
      details_json: Record<string, unknown> | null;
      updated_at: string;
    }> = [];
    let categoryItems: BitrixListElement[] = [];
    let courseItems: BitrixListElement[] = [];
    let documentValidityItems: BitrixListElement[] = [];
    let coursePriceItems: BitrixListElement[] = [];

    if (targets.syncReferenceLists) {
      listsSnapshot = await fetchAllReferenceListElements();
      flatListPayload = listsSnapshot.flatMap(({ listKey, definition, items }) =>
        items.map(item => ({
          list_key: listKey,
          list_name: definition.name,
          iblock_id: definition.iblockId,
          bitrix_item_id: item.id,
          name: item.name,
          bitrix_value: item.name,
          code: item.code,
          sort_order: item.sortOrder,
          details_json: item.details ? { ...item.details } : null,
          updated_at: now,
        }))
      );

      const iblockIds = listsSnapshot.map(item => item.definition.iblockId);
      const { error: deleteListsError } = await supabase
        .from("ref_bitrix_list_items")
        .delete()
        .in("iblock_id", iblockIds);
      if (deleteListsError) throw deleteListsError;

      if (flatListPayload.length > 0) {
        const { error: insertListsError } = await supabase
          .from("ref_bitrix_list_items")
          .insert(flatListPayload);
        if (insertListsError) throw insertListsError;
      }

      categoryItems = listsSnapshot.find(item => item.listKey === "CATEGORIES")?.items || [];
      courseItems = listsSnapshot.find(item => item.listKey === "COURSES")?.items || [];
      documentValidityItems = listsSnapshot.find(item => item.listKey === "DOCUMENT_VALIDITY")?.items || [];
      coursePriceItems = listsSnapshot.find(item => item.listKey === "COURSE_PRICES")?.items || [];

      await replaceReferenceTable(
        supabase,
        "ref_categories",
        categoryItems.map(item => ({
          name: item.name,
          bitrix_value: item.name,
          sort_order: item.sortOrder,
        })),
      );
      await replaceReferenceTable(
        supabase,
        "ref_courses",
        courseItems.map(item => ({
          name: item.name,
          bitrix_value: item.name,
          sort_order: item.sortOrder,
        })),
      );
      await replaceDocumentValidityRules(supabase, documentValidityItems, now);
      await replaceCoursePrices(supabase, coursePriceItems, now);
    }

    let companySnapshot: Awaited<ReturnType<typeof fetchCompanyDirectorySnapshotFromBitrix>> | null = null;
    if (targets.syncCompanyDirectory) {
      companySnapshot = await fetchCompanyDirectorySnapshotFromBitrix();
      await replaceCompanyDirectorySnapshot(supabase, companySnapshot.rows, now);
    }

    const stats = {
      lists_count: listsSnapshot.length,
      items_count: flatListPayload.length,
      categories_count: categoryItems.length,
      courses_count: courseItems.length,
      document_validity_count: documentValidityItems.length,
      course_prices_count: coursePriceItems.length,
      companies_count: companySnapshot?.companiesCount || 0,
      company_directory_count: companySnapshot?.rows.length || 0,
      contracts_count: companySnapshot?.contractsCount || 0,
      sync_reference_lists: targets.syncReferenceLists,
      sync_company_directory: targets.syncCompanyDirectory,
      event_entity_type_id: targets.entityTypeId,
    };

    await upsertSyncStatus(supabase, {
      last_finished_at: now,
      last_success_at: now,
      last_source: source,
      last_event: eventName,
      last_status: "success",
      last_error: "",
      stats,
    });

    console.log(JSON.stringify({
      stage: "sync-success",
      source,
      eventName,
      stats,
    }));

    return {
      ok: true,
      scope: SYNC_SCOPE,
      last_success_at: now,
      targets,
      stats,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "Unknown sync error";

    console.error(JSON.stringify({
      stage: "sync-error",
      source,
      eventName,
      message,
    }));

    await upsertSyncStatus(supabase, {
      last_finished_at: finishedAt,
      last_source: source,
      last_event: eventName,
      last_status: "error",
      last_error: message,
    });

    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflightResponse(req);

  const corsError = validateCorsRequest(req);
  if (corsError) return corsError;

  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "Method not allowed" });
  }

  try {
    const body = await parseRequestPayload(req);
    const supabase = adminClient();
    console.log(JSON.stringify({
      stage: "request",
      method: req.method,
      event: plain(pickFormOrJson(body, ["event", "EVENT_NAME", "event_name"])) || "reference-sync",
      hasOrigin: Boolean(req.headers.get("origin")),
      hasAuthorization: Boolean(req.headers.get("authorization")),
    }));
    const auth = await authorizeRequest(req, body, supabase);
    const eventName = plain(pickFormOrJson(body, ["event", "EVENT_NAME", "event_name"])) || "reference-sync";
    const source = auth.source === "manual-ui"
      ? plain(pickFormOrJson(body, ["source", "trigger"])) || "manual-ui"
      : auth.source;
    const targets = determineSyncTargets(source, eventName, body);

    const result = targets.syncHrItem
      ? await runHrFieldSync(source, eventName, body)
      : await runReferenceSync(source, eventName, body);

    return jsonResponse(req, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /unauthorized/i.test(message) ? 401 : 500;
    return jsonResponse(req, status, { error: message });
  }
});
