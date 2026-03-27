import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BITRIX_WEBHOOK_URL = (Deno.env.get("BITRIX_WEBHOOK_URL") || "").replace(/\/+$/, "");
const BITRIX_DEAL_BASE_URL = Deno.env.get("BITRIX_DEAL_BASE_URL") || "https://hsecompany.bitrix24.kz/crm/deal/details";
const SMART_PROCESS_ENTITY_TYPE_ID = Number(Deno.env.get("BITRIX_SMART_PROCESS_ENTITY_TYPE_ID") || "1056");
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization, X-Client-Info, Apikey";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";

const BITRIX_FIELDS = {
  LAST_NAME: "ufCrm12_1772560668",
  FIRST_NAME: "ufCrm12_1772560711",
  MIDDLE_NAME: "ufCrm12_1772560721",
  POSITION: "ufCrm12_1772560767",
  CATEGORY: "ufCrm12_1772560781",
  COURSE_NAME: "ufCrm12_1772560835",
  COURSE_START_DATE: "ufCrm12_1772561081",
  DOCUMENT_EXPIRY_DATE: "ufCrm12_1772561142",
  COMMISSION_CHAIR: "ufCrm12_1772561169",
  PROTOCOL: "ufCrm12_1772561202",
  DOCUMENT_NUMBER: "ufCrm12_1772561299",
  COMMISSION_MEMBER_1: "ufCrm12_1772561371",
  COMMISSION_MEMBER_2: "ufCrm12_1772561385",
  COMMISSION_MEMBER_3: "ufCrm12_1772561392",
  COMMISSION_MEMBER_4: "ufCrm12_1772561401",
  COMMISSION_MEMBERS: "ufCrm12_1772561415",
  QUALIFICATION: "ufCrm12_1772561427",
  LEVEL: "ufCrm12_1774461941",
  MARKER_PASS: "ufCrm12_1774463808",
  TYPE_LEARN: "ufCrm12_1774464295",
  COMMIS_CONCL: "ufCrm12_1774464335",
  GRADE: "ufCrm12_1774464392",
  MANAGER: "ufCrm12_1772561434",
  IS_PRINTED: "ufCrm12_1772561447",
  EMPLOYEE_STATUS: "ufCrm12_1772561489",
  PRICE: "ufCrm12_1773257578",
} as const;

const BITRIX_FIELDS_RAW = {
  LAST_NAME: "UF_CRM_12_1772560668",
  FIRST_NAME: "UF_CRM_12_1772560711",
  MIDDLE_NAME: "UF_CRM_12_1772560721",
  POSITION: "UF_CRM_12_1772560767",
  CATEGORY: "UF_CRM_12_1772560781",
  COURSE_NAME: "UF_CRM_12_1772560835",
  COURSE_START_DATE: "UF_CRM_12_1772561081",
  DOCUMENT_EXPIRY_DATE: "UF_CRM_12_1772561142",
  COMMISSION_CHAIR: "UF_CRM_12_1772561169",
  PROTOCOL: "UF_CRM_12_1772561202",
  DOCUMENT_NUMBER: "UF_CRM_12_1772561299",
  COMMISSION_MEMBER_1: "UF_CRM_12_1772561371",
  COMMISSION_MEMBER_2: "UF_CRM_12_1772561385",
  COMMISSION_MEMBER_3: "UF_CRM_12_1772561392",
  COMMISSION_MEMBER_4: "UF_CRM_12_1772561401",
  COMMISSION_MEMBERS: "UF_CRM_12_1772561415",
  QUALIFICATION: "UF_CRM_12_1772561427",
  LEVEL: "UF_CRM_12_1774461941",
  MARKER_PASS: "UF_CRM_12_1774463808",
  TYPE_LEARN: "UF_CRM_12_1774464295",
  COMMIS_CONCL: "UF_CRM_12_1774464335",
  GRADE: "UF_CRM_12_1774464392",
  MANAGER: "UF_CRM_12_1772561434",
  IS_PRINTED: "UF_CRM_12_1772561447",
  EMPLOYEE_STATUS: "UF_CRM_12_1772561489",
  PRICE: "UF_CRM_12_1773257578",
  PHOTO: "UF_CRM_12_1772578817",
} as const;

const PHOTO_FIELD_KEY = "ufCrm12_1772578817";
const COMPANY_BIN_FIELD_CANDIDATES = [
  "UF_CRM_BIN_IIN",
  "UF_CRM_1772589149",
  "UF_CRM_1772598092",
  "UF_CRM_1772598149",
];
const BITRIX_SYNC_CONCURRENCY = 3;
const BITRIX_DELETE_CONCURRENCY = 5;
const SUPABASE_DELETE_BATCH_SIZE = 200;

type CompanyRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  bin_iin: string;
  city: string;
  bitrix_company_id: string | null;
  payment_order_url: string | null;
  payment_order_name: string | null;
  payment_order_storage_bucket: string | null;
  payment_order_storage_path: string | null;
  payment_is_paid: boolean | null;
};

type DealRow = {
  id: string;
  bitrix_deal_id: string | null;
  bitrix_company_id: string | null;
  payment_file_sync_key: string | null;
};

type ParticipantRow = {
  id: string;
  last_name: string;
  first_name: string;
  patronymic: string;
  position: string;
  category: string;
  photo_url: string | null;
};

type SyncTask = {
  participant: ParticipantRow;
  courseName: string;
};

type ExistingCertificateRow = {
  id: string;
  participant_id: string | null;
  bitrix_item_id: string | null;
  photo_sync_key: string | null;
  last_name: string;
  first_name: string;
  middle_name: string;
  position: string;
  category: string;
  course_name: string;
  start_date: string | null;
  expiry_date: string | null;
  commission_chair: string | null;
  protocol_number: string | null;
  document_number: string | null;
  commission_member_1: string | null;
  commission_member_2: string | null;
  commission_member_3: string | null;
  commission_member_4: string | null;
  commission_members: string | null;
  qualification: string | null;
  level: string | null;
  marker_pass: string | null;
  type_learn: string | null;
  commis_concl: string | null;
  grade: string | null;
  manager: string | null;
  is_printed: boolean | null;
  employee_status: string | null;
  price: number | null;
};

type PreparedFile = {
  fileName: string;
  base64: string;
};

type SmartFieldKind = "text" | "date" | "boolean" | "number";

type SmartFieldEntry = {
  code: string;
  kind: SmartFieldKind;
  value: string | number;
};

type EnumMaps = {
  categoryMap: Map<string, string>;
  courseMap: Map<string, string>;
  markerPassMap: Map<string, string>;
  typeLearnMap: Map<string, string>;
  commisConclMap: Map<string, string>;
  gradeMap: Map<string, string>;
  employeeStatusMap: Map<string, string>;
};

type PhotoContract = {
  fieldKey: string;
  variant: "tuple" | "wrapped" | "wrappedWithId" | "tupleArray";
};

const preparedPhotoCache = new Map<string, Promise<PreparedFile>>();
let photoContractCache: PhotoContract | null = null;

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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeFileName(name: string): string {
  return plain(name).replace(/[\\/:*?"<>|]+/g, "_");
}

function taskKey(participantId: string | null | undefined, courseName: string | null | undefined): string {
  return `${plain(participantId)}::${plain(courseName).toLowerCase()}`;
}

function normalizeBitrixDate(value: unknown): string | null {
  const raw = plain(value);
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const ruMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;

  return raw;
}

function normalizeBitrixBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const raw = plain(value).toUpperCase();
  if (!raw) return null;
  if (["Y", "YES", "TRUE", "1", "ДА"].includes(raw)) return true;
  if (["N", "NO", "FALSE", "0", "НЕТ"].includes(raw)) return false;
  return null;
}

function normalizeBitrixNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = plain(value).replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMarkerPassValue(value: unknown): string {
  const normalized = plain(value).toLocaleLowerCase("ru");
  if (!normalized) return "";
  if (normalized === "прошел" || normalized === "прошла" || normalized === "прошел (-а)" || normalized === "прошла (-а)") {
    return "Прошел (-а)";
  }
  if (normalized === "не прошел" || normalized === "не прошла" || normalized === "не прошел (-а)" || normalized === "не прошла (-а)") {
    return "Не прошел (-а)";
  }
  if (normalized === "подлежит повторной проверке знаний" || normalized === "проверка знаний проведена") {
    return "Подлежит повторной проверке знаний";
  }
  return plain(value);
}

function normalizeCommisConclValue(value: unknown): string {
  const normalized = plain(value).toLocaleLowerCase("ru");
  if (!normalized) return "";
  if (
    normalized === "сдал" ||
    normalized === "сдала" ||
    normalized === "сдал (-а)" ||
    normalized === "сдала (-а)" ||
    normalized === "сдал (-a)" ||
    normalized === "сдала (-a)"
  ) {
    return "Сдал (-а)";
  }
  if (
    normalized === "не сдал" ||
    normalized === "не сдала" ||
    normalized === "не сдал (-а)" ||
    normalized === "не сдала (-а)" ||
    normalized === "не сдал (-a)" ||
    normalized === "не сдала (-a)"
  ) {
    return "Не сдал (-а)";
  }
  return plain(value);
}

function toBitrixCommisConclValue(value: unknown): string {
  const normalized = normalizeCommisConclValue(value);
  if (normalized === "Сдал (-а)") return "Сдал (-a)";
  if (normalized === "Не сдал (-а)") return "Не сдал (-a)";
  return normalized;
}

function normalizeTypeLearnValue(value: unknown): string {
  const normalized = plain(value).toLocaleLowerCase("ru");
  if (!normalized) return "";
  if (normalized === "первичный" || normalized === "первичная") return "первичная";
  if (normalized === "повторный" || normalized === "повторная") return "повторная";
  if (normalized === "периодический" || normalized === "периодическая") return "периодическая";
  return plain(value);
}

function normalizeGradeValue(value: unknown): string {
  const normalized = plain(value).toLocaleLowerCase("ru");
  if (!normalized) return "";
  if (normalized === "плохо") return "Плохо";
  if (normalized === "удовлетворительно") return "Удовлетворительно";
  if (normalized === "хорошо") return "Хорошо";
  if (normalized === "отлично") return "Отлично";
  return plain(value);
}

function normalizeEmployeeStatusValue(value: unknown): string {
  const normalized = plain(value).toLocaleLowerCase("ru");
  if (!normalized) return "";
  if (normalized === "работает" || normalized === "active" || normalized === "работающий") return "Работает";
  if (normalized === "уволен" || normalized === "inactive" || normalized === "не работает") return "Уволен";
  return plain(value);
}

function preferredTextValue(localValue: unknown, currentBitrixValue: unknown): string | undefined {
  const localPlain = plain(localValue);
  if (localPlain) return localPlain;
  const currentPlain = plain(currentBitrixValue);
  return currentPlain || undefined;
}

function preferredDateValue(localValue: unknown, currentBitrixValue: unknown): string | undefined {
  const localDate = normalizeBitrixDate(localValue);
  if (localDate) return localDate;
  const currentDate = normalizeBitrixDate(currentBitrixValue);
  return currentDate || undefined;
}

function preferredBooleanValue(localValue: boolean | null | undefined, currentBitrixValue: unknown): string | undefined {
  if (localValue === true) return "Y";
  if (localValue === false) return "N";
  const currentBool = normalizeBitrixBoolean(currentBitrixValue);
  if (currentBool === true) return "Y";
  if (currentBool === false) return "N";
  return undefined;
}

function preferredNumberValue(localValue: number | null | undefined, currentBitrixValue: unknown): number | undefined {
  if (typeof localValue === "number" && Number.isFinite(localValue)) return localValue;
  const currentNumber = normalizeBitrixNumber(currentBitrixValue);
  return currentNumber ?? undefined;
}

function preferredEnumValue(
  localValue: unknown,
  currentBitrixValue: unknown,
  map: Map<string, string>,
  normalizer: (value: unknown) => string = value => plain(value).toLowerCase(),
): string | undefined {
  const normalizedLocal = normalizer(localValue);
  if (normalizedLocal) return map.get(normalizedLocal) || plain(currentBitrixValue) || plain(localValue);
  const currentPlain = plain(currentBitrixValue);
  return currentPlain || undefined;
}

function getPaymentFileSourceKey(company: CompanyRow): string {
  const bucket = plain(company.payment_order_storage_bucket);
  const path = plain(company.payment_order_storage_path);
  const url = plain(company.payment_order_url);
  const name = plain(company.payment_order_name);

  if (bucket && path) return `storage:${bucket}:${path}:${name}`;
  if (url) return `url:${url}:${name}`;
  return "";
}

function getPhotoSourceKey(photoUrl: string | null | undefined): string {
  return plain(photoUrl);
}

function smartItemHasPhoto(item: Record<string, unknown>): boolean {
  return hasPersistedFileValue(getFieldValue(item, PHOTO_FIELD_KEY)) ||
    hasPersistedFileValue(getFieldValue(item, BITRIX_FIELDS_RAW.PHOTO));
}

function isBitrixItemMissingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /ENTITY_ITEM_NOT_FOUND|ITEM_NOT_FOUND|not found|does not exist|could not find/i.test(message);
}

function areSmartFieldValuesEqual(kind: SmartFieldKind, currentValue: unknown, desiredValue: unknown): boolean {
  switch (kind) {
    case "date":
      return normalizeBitrixDate(currentValue) === normalizeBitrixDate(desiredValue);
    case "boolean":
      return normalizeBitrixBoolean(currentValue) === normalizeBitrixBoolean(desiredValue);
    case "number":
      return normalizeBitrixNumber(currentValue) === normalizeBitrixNumber(desiredValue);
    case "text":
    default:
      return plain(currentValue) === plain(desiredValue);
  }
}

function buildSmartProcessFieldRecord(entries: SmartFieldEntry[]): Record<string, unknown> {
  return entries.reduce<Record<string, unknown>>((acc, entry) => {
    acc[entry.code] = entry.value;
    return acc;
  }, {});
}

function buildSmartProcessUpdatePatch(currentItem: Record<string, unknown>, entries: SmartFieldEntry[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const entry of entries) {
    const currentValue = entry.code === "TITLE" ? currentItem.TITLE : getSmartFieldValue(currentItem, entry.code);
    if (areSmartFieldValuesEqual(entry.kind, currentValue, entry.value)) continue;
    patch[entry.code] = entry.value;
  }
  return patch;
}

function needsCertificateRestore(cert: ExistingCertificateRow): boolean {
  return !plain(cert.document_number) ||
    !plain(cert.protocol_number) ||
    !plain(cert.commission_chair) ||
    !plain(cert.commission_member_1) ||
    !plain(cert.commission_member_2) ||
    !plain(cert.commission_member_3) ||
    !plain(cert.commission_member_4) ||
    !plain(cert.commission_members) ||
    !plain(cert.qualification) ||
    !plain(cert.level) ||
    !plain(cert.manager) ||
    !plain(cert.marker_pass) ||
    !plain(cert.type_learn) ||
    !plain(cert.commis_concl) ||
    !plain(cert.grade) ||
    !plain(cert.employee_status) ||
    !cert.start_date ||
    !cert.expiry_date ||
    cert.price == null;
}

function buildCertificateRestorePatch(cert: ExistingCertificateRow, item: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const assignIfMissing = (field: keyof ExistingCertificateRow, value: unknown) => {
    const currentValue = cert[field];
    if ((typeof currentValue === "string" ? plain(currentValue) : currentValue) != null) {
      if (typeof currentValue === "string" && plain(currentValue)) return;
      if (typeof currentValue !== "string" && currentValue !== null && currentValue !== undefined) return;
    }
    if (typeof value === "string") {
      if (!plain(value)) return;
      patch[field] = plain(value);
      return;
    }
    if (value === null || value === undefined) return;
    patch[field] = value;
  };

  assignIfMissing("start_date", normalizeBitrixDate(getFieldValue(item, BITRIX_FIELDS_RAW.COURSE_START_DATE) ?? getFieldValue(item, BITRIX_FIELDS.COURSE_START_DATE)));
  assignIfMissing("expiry_date", normalizeBitrixDate(getFieldValue(item, BITRIX_FIELDS_RAW.DOCUMENT_EXPIRY_DATE) ?? getFieldValue(item, BITRIX_FIELDS.DOCUMENT_EXPIRY_DATE)));
  assignIfMissing("commission_chair", getFieldValue(item, BITRIX_FIELDS_RAW.COMMISSION_CHAIR) ?? getFieldValue(item, BITRIX_FIELDS.COMMISSION_CHAIR));
  assignIfMissing("protocol_number", getFieldValue(item, BITRIX_FIELDS_RAW.PROTOCOL) ?? getFieldValue(item, BITRIX_FIELDS.PROTOCOL));
  assignIfMissing("document_number", getFieldValue(item, BITRIX_FIELDS_RAW.DOCUMENT_NUMBER) ?? getFieldValue(item, BITRIX_FIELDS.DOCUMENT_NUMBER));
  assignIfMissing("commission_member_1", getFieldValue(item, BITRIX_FIELDS_RAW.COMMISSION_MEMBER_1) ?? getFieldValue(item, BITRIX_FIELDS.COMMISSION_MEMBER_1));
  assignIfMissing("commission_member_2", getFieldValue(item, BITRIX_FIELDS_RAW.COMMISSION_MEMBER_2) ?? getFieldValue(item, BITRIX_FIELDS.COMMISSION_MEMBER_2));
  assignIfMissing("commission_member_3", getFieldValue(item, BITRIX_FIELDS_RAW.COMMISSION_MEMBER_3) ?? getFieldValue(item, BITRIX_FIELDS.COMMISSION_MEMBER_3));
  assignIfMissing("commission_member_4", getFieldValue(item, BITRIX_FIELDS_RAW.COMMISSION_MEMBER_4) ?? getFieldValue(item, BITRIX_FIELDS.COMMISSION_MEMBER_4));
  assignIfMissing("commission_members", getFieldValue(item, BITRIX_FIELDS_RAW.COMMISSION_MEMBERS) ?? getFieldValue(item, BITRIX_FIELDS.COMMISSION_MEMBERS));
  assignIfMissing("qualification", getFieldValue(item, BITRIX_FIELDS_RAW.QUALIFICATION) ?? getFieldValue(item, BITRIX_FIELDS.QUALIFICATION));
  assignIfMissing("level", getFieldValue(item, BITRIX_FIELDS_RAW.LEVEL) ?? getFieldValue(item, BITRIX_FIELDS.LEVEL));
  assignIfMissing("marker_pass", getFieldValue(item, BITRIX_FIELDS_RAW.MARKER_PASS) ?? getFieldValue(item, BITRIX_FIELDS.MARKER_PASS));
  assignIfMissing("type_learn", getFieldValue(item, BITRIX_FIELDS_RAW.TYPE_LEARN) ?? getFieldValue(item, BITRIX_FIELDS.TYPE_LEARN));
  assignIfMissing("commis_concl", getFieldValue(item, BITRIX_FIELDS_RAW.COMMIS_CONCL) ?? getFieldValue(item, BITRIX_FIELDS.COMMIS_CONCL));
  assignIfMissing("grade", getFieldValue(item, BITRIX_FIELDS_RAW.GRADE) ?? getFieldValue(item, BITRIX_FIELDS.GRADE));
  assignIfMissing("manager", getFieldValue(item, BITRIX_FIELDS_RAW.MANAGER) ?? getFieldValue(item, BITRIX_FIELDS.MANAGER));
  assignIfMissing("employee_status", getFieldValue(item, BITRIX_FIELDS_RAW.EMPLOYEE_STATUS) ?? getFieldValue(item, BITRIX_FIELDS.EMPLOYEE_STATUS));

  const printedValue = normalizeBitrixBoolean(getFieldValue(item, BITRIX_FIELDS_RAW.IS_PRINTED) ?? getFieldValue(item, BITRIX_FIELDS.IS_PRINTED));
  if (cert.is_printed == null && printedValue !== null) patch.is_printed = printedValue;

  const priceValue = normalizeBitrixNumber(getFieldValue(item, BITRIX_FIELDS_RAW.PRICE) ?? getFieldValue(item, BITRIX_FIELDS.PRICE));
  if (cert.price == null && priceValue !== null) patch.price = priceValue;

  return patch;
}

function extensionFromContentType(contentType: string): string {
  const ct = plain(contentType).toLowerCase();
  if (!ct) return "";
  if (ct.includes("pdf")) return "pdf";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("bmp")) return "bmp";
  if (ct.includes("tiff") || ct.includes("tif")) return "tiff";
  return "";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function buildDealUrl(bitrixDealId: string): string {
  return `${BITRIX_DEAL_BASE_URL.replace(/\/+$/, "")}/${bitrixDealId}/`;
}

function companyCamel(code: string): string | null {
  const match = plain(code).toUpperCase().match(/^UF_CRM_(\d+)$/);
  return match ? `ufCrm${match[1]}` : null;
}

function smartCamel(code: string): string | null {
  const match = plain(code).toUpperCase().match(/^UF_CRM_(\d+)_(\d+)$/);
  return match ? `ufCrm${match[1]}_${match[2]}` : null;
}

function fieldVariants(code: string): string[] {
  const value = plain(code);
  if (!value) return [];
  const out = new Set<string>([value, value.toUpperCase(), value.toLowerCase()]);
  const camel = smartCamel(value) || companyCamel(value);
  if (camel) out.add(camel);
  return Array.from(out);
}

function getFieldValue(item: Record<string, unknown>, code: string): unknown {
  for (const key of fieldVariants(code)) {
    if (Object.prototype.hasOwnProperty.call(item, key)) return item[key];
  }
  return undefined;
}

function getSmartFieldValue(item: Record<string, unknown>, code: string): unknown {
  const direct = getFieldValue(item, code);
  if (direct !== undefined) return direct;

  for (const key of Object.keys(BITRIX_FIELDS) as Array<keyof typeof BITRIX_FIELDS>) {
    if (BITRIX_FIELDS[key] === code || BITRIX_FIELDS_RAW[key] === code) {
      return getFieldValue(item, BITRIX_FIELDS[key]) ?? getFieldValue(item, BITRIX_FIELDS_RAW[key]);
    }
  }

  return undefined;
}

function hasPersistedFileValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") return value.trim() !== "" && !/^(0|null|undefined)$/i.test(value.trim());
  if (Array.isArray(value)) return value.some(item => hasPersistedFileValue(item));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return [obj.id, obj.ID, obj.fileId, obj.FILE_ID, obj.url, obj.URL, obj.src, obj.SRC].some(item => hasPersistedFileValue(item));
  }
  return false;
}

function fileFieldSignature(value: unknown): string {
  if (value == null) return "";

  if (Array.isArray(value)) {
    return value.map(fileFieldSignature).filter(Boolean).join("|");
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const atoms = [
      obj.id,
      obj.ID,
      obj.fileId,
      obj.FILE_ID,
      obj.name,
      obj.NAME,
      obj.originalName,
      obj.ORIGINAL_NAME,
      obj.url,
      obj.URL,
      obj.src,
      obj.SRC,
      obj.downloadUrl,
      obj.DOWNLOAD_URL,
      obj.value,
      obj.VALUE,
    ]
      .map(item => plain(item))
      .filter(Boolean);

    if (atoms.length > 0) return atoms.join("|");

    return Object.keys(obj)
      .sort()
      .map(key => `${key}:${fileFieldSignature(obj[key])}`)
      .join("|");
  }

  return plain(value);
}

function dealFieldKeyVariants(code: string): string[] {
  const value = plain(code);
  if (!value) return [];

  const out = new Set<string>([value, value.toUpperCase(), value.toLowerCase()]);
  const camel = companyCamel(value);
  if (camel) out.add(camel);
  return Array.from(out);
}

async function fetchDealFieldValue(bitrixDealId: string, paymentFieldCode: string): Promise<unknown> {
  const deal = await fetchDealFields(bitrixDealId);

  for (const key of dealFieldKeyVariants(paymentFieldCode)) {
    if (Object.prototype.hasOwnProperty.call(deal, key)) return deal[key];
  }

  return undefined;
}

async function fetchDealFields(bitrixDealId: string): Promise<Record<string, unknown>> {
  const raw = await callBitrix("crm.deal.get", { id: bitrixDealId });
  return (raw || {}) as Record<string, unknown>;
}

function getDealFieldValue(deal: Record<string, unknown>, fieldCode: string): unknown {
  for (const key of dealFieldKeyVariants(fieldCode)) {
    if (Object.prototype.hasOwnProperty.call(deal, key)) return deal[key];
  }
  return undefined;
}

async function readDealFileFieldSignature(bitrixDealId: string, paymentFieldCode: string): Promise<string> {
  try {
    const value = await fetchDealFieldValue(bitrixDealId, paymentFieldCode);
    return fileFieldSignature(value);
  } catch {
    return "";
  }
}

async function verifyDealFileAttached(params: {
  bitrixDealId: string;
  paymentFieldCode: string;
  expectedFileName: string;
  beforeSignature?: string;
}): Promise<boolean> {
  const expectedFileName = plain(params.expectedFileName).toLowerCase();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const value = await fetchDealFieldValue(params.bitrixDealId, params.paymentFieldCode);
      if (hasPersistedFileValue(value)) {
        const signature = fileFieldSignature(value);
        if (expectedFileName && signature.toLowerCase().includes(expectedFileName)) return true;

        const before = plain(params.beforeSignature);
        if (before && signature && signature !== before) return true;
        if (!before && signature) return true;
      }
    } catch {
      // best effort probe
    }

    if (attempt < 2) {
      await sleep(220 * (attempt + 1));
    }
  }

  return false;
}

async function callBitrix(method: string, params: Record<string, unknown>): Promise<unknown> {
  if (!BITRIX_WEBHOOK_URL) throw new Error("BITRIX_WEBHOOK_URL is not configured");

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(`${BITRIX_WEBHOOK_URL}/${method}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};

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
        const error = new Error(`Bitrix ${method} error ${code}: ${plain(body.error_description || body.error)}`);
        lastError = error;
        if (attempt < 4 && /QUERY_LIMIT_EXCEEDED|TOO_MANY_REQUESTS|TIMEOUT/.test(code)) {
          await sleep(350 * attempt);
          continue;
        }
        throw error;
      }

      return body.result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
      if (attempt < 4 && /failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
        await sleep(350 * attempt);
        continue;
      }
    }
  }

  throw lastError || new Error(`Bitrix call failed: ${method}`);
}

async function runInChunks<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += concurrency) {
    await Promise.all(items.slice(index, index + concurrency).map(worker));
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

async function loadEnumMaps() {
  const raw = await callBitrix("crm.item.fields", { entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID });
  const fields = (raw?.fields || raw || {}) as Record<string, unknown>;
  const findField = (rawName: string, camelName: string) => {
    for (const [key, value] of Object.entries(fields)) {
      if (!value || typeof value !== "object") continue;
      if (key.toLowerCase() === rawName.toLowerCase() || key.toLowerCase() === camelName.toLowerCase()) {
        return value as Record<string, unknown>;
      }
      const obj = value as Record<string, unknown>;
      const fieldName = plain(obj.upperName || obj.UPPER_NAME || obj.fieldName || obj.FIELD_NAME).toUpperCase();
      if (fieldName === rawName.toUpperCase()) return obj;
    }
    return null;
  };
  const toMap = (field: Record<string, unknown> | null) => {
    const out = new Map<string, string>();
    if (!field) return out;
    for (const source of [field.items, field.LIST, field.list, field.ENUM, (field.settings as Record<string, unknown> | undefined)?.LIST]) {
      if (!Array.isArray(source)) continue;
      for (const item of source as Array<Record<string, unknown>>) {
        const id = plain(item.ID || item.id);
        const value = plain(item.VALUE || item.value || item.DISPLAY_VALUE || item.label).toLowerCase();
        if (id && value) out.set(value, id);
      }
      if (out.size > 0) break;
    }
    return out;
  };
  return {
    categoryMap: toMap(findField(BITRIX_FIELDS_RAW.CATEGORY, BITRIX_FIELDS.CATEGORY)),
    courseMap: toMap(findField(BITRIX_FIELDS_RAW.COURSE_NAME, BITRIX_FIELDS.COURSE_NAME)),
    markerPassMap: toMap(findField(BITRIX_FIELDS_RAW.MARKER_PASS, BITRIX_FIELDS.MARKER_PASS)),
    typeLearnMap: toMap(findField(BITRIX_FIELDS_RAW.TYPE_LEARN, BITRIX_FIELDS.TYPE_LEARN)),
    commisConclMap: toMap(findField(BITRIX_FIELDS_RAW.COMMIS_CONCL, BITRIX_FIELDS.COMMIS_CONCL)),
    gradeMap: toMap(findField(BITRIX_FIELDS_RAW.GRADE, BITRIX_FIELDS.GRADE)),
    employeeStatusMap: toMap(findField(BITRIX_FIELDS_RAW.EMPLOYEE_STATUS, BITRIX_FIELDS.EMPLOYEE_STATUS)),
  };
}

function buildDesiredSmartProcessFieldEntries(params: {
  participant: ParticipantRow;
  courseName: string;
  expectedTitle: string;
  existingCertificate: ExistingCertificateRow | null;
  currentItem: Record<string, unknown> | null;
  enumMaps: EnumMaps;
}): SmartFieldEntry[] {
  const currentItem = params.currentItem || {};
  const cert = params.existingCertificate;
  const entries: SmartFieldEntry[] = [
    { code: "TITLE", kind: "text", value: params.expectedTitle },
    { code: BITRIX_FIELDS.LAST_NAME, kind: "text", value: params.participant.last_name },
    { code: BITRIX_FIELDS.FIRST_NAME, kind: "text", value: params.participant.first_name },
    { code: BITRIX_FIELDS.MIDDLE_NAME, kind: "text", value: params.participant.patronymic },
    { code: BITRIX_FIELDS.POSITION, kind: "text", value: params.participant.position },
  ];

  const pushIfDefined = (code: string, kind: SmartFieldKind, value: string | number | undefined) => {
    if (value === undefined) return;
    if (typeof value === "string" && !plain(value)) return;
    entries.push({ code, kind, value });
  };

  pushIfDefined(
    BITRIX_FIELDS.CATEGORY,
    "text",
    preferredEnumValue(params.participant.category, getSmartFieldValue(currentItem, BITRIX_FIELDS.CATEGORY), params.enumMaps.categoryMap),
  );
  pushIfDefined(
    BITRIX_FIELDS.COURSE_NAME,
    "text",
    preferredEnumValue(params.courseName, getSmartFieldValue(currentItem, BITRIX_FIELDS.COURSE_NAME), params.enumMaps.courseMap),
  );
  pushIfDefined(
    BITRIX_FIELDS.COURSE_START_DATE,
    "date",
    preferredDateValue(cert?.start_date, getSmartFieldValue(currentItem, BITRIX_FIELDS.COURSE_START_DATE)),
  );
  pushIfDefined(
    BITRIX_FIELDS.DOCUMENT_EXPIRY_DATE,
    "date",
    preferredDateValue(cert?.expiry_date, getSmartFieldValue(currentItem, BITRIX_FIELDS.DOCUMENT_EXPIRY_DATE)),
  );
  pushIfDefined(
    BITRIX_FIELDS.COMMISSION_CHAIR,
    "text",
    preferredTextValue(cert?.commission_chair, getSmartFieldValue(currentItem, BITRIX_FIELDS.COMMISSION_CHAIR)),
  );
  pushIfDefined(
    BITRIX_FIELDS.PROTOCOL,
    "text",
    preferredTextValue(cert?.protocol_number, getSmartFieldValue(currentItem, BITRIX_FIELDS.PROTOCOL)),
  );
  pushIfDefined(
    BITRIX_FIELDS.DOCUMENT_NUMBER,
    "text",
    preferredTextValue(cert?.document_number, getSmartFieldValue(currentItem, BITRIX_FIELDS.DOCUMENT_NUMBER)),
  );
  pushIfDefined(
    BITRIX_FIELDS.COMMISSION_MEMBER_1,
    "text",
    preferredTextValue(cert?.commission_member_1, getSmartFieldValue(currentItem, BITRIX_FIELDS.COMMISSION_MEMBER_1)),
  );
  pushIfDefined(
    BITRIX_FIELDS.COMMISSION_MEMBER_2,
    "text",
    preferredTextValue(cert?.commission_member_2, getSmartFieldValue(currentItem, BITRIX_FIELDS.COMMISSION_MEMBER_2)),
  );
  pushIfDefined(
    BITRIX_FIELDS.COMMISSION_MEMBER_3,
    "text",
    preferredTextValue(cert?.commission_member_3, getSmartFieldValue(currentItem, BITRIX_FIELDS.COMMISSION_MEMBER_3)),
  );
  pushIfDefined(
    BITRIX_FIELDS.COMMISSION_MEMBER_4,
    "text",
    preferredTextValue(cert?.commission_member_4, getSmartFieldValue(currentItem, BITRIX_FIELDS.COMMISSION_MEMBER_4)),
  );
  pushIfDefined(
    BITRIX_FIELDS.COMMISSION_MEMBERS,
    "text",
    preferredTextValue(cert?.commission_members, getSmartFieldValue(currentItem, BITRIX_FIELDS.COMMISSION_MEMBERS)),
  );
  pushIfDefined(
    BITRIX_FIELDS.QUALIFICATION,
    "text",
    preferredTextValue(cert?.qualification, getSmartFieldValue(currentItem, BITRIX_FIELDS.QUALIFICATION)),
  );
  pushIfDefined(
    BITRIX_FIELDS.LEVEL,
    "text",
    preferredTextValue(cert?.level, getSmartFieldValue(currentItem, BITRIX_FIELDS.LEVEL)),
  );
  pushIfDefined(
    BITRIX_FIELDS.MARKER_PASS,
    "text",
    preferredEnumValue(cert?.marker_pass, getSmartFieldValue(currentItem, BITRIX_FIELDS.MARKER_PASS), params.enumMaps.markerPassMap, value => normalizeMarkerPassValue(value).toLowerCase()),
  );
  pushIfDefined(
    BITRIX_FIELDS.TYPE_LEARN,
    "text",
    preferredEnumValue(cert?.type_learn, getSmartFieldValue(currentItem, BITRIX_FIELDS.TYPE_LEARN), params.enumMaps.typeLearnMap, value => normalizeTypeLearnValue(value).toLowerCase()),
  );
  pushIfDefined(
    BITRIX_FIELDS.COMMIS_CONCL,
    "text",
    preferredEnumValue(cert?.commis_concl, getSmartFieldValue(currentItem, BITRIX_FIELDS.COMMIS_CONCL), params.enumMaps.commisConclMap, value => toBitrixCommisConclValue(value).toLowerCase()),
  );
  pushIfDefined(
    BITRIX_FIELDS.GRADE,
    "text",
    preferredEnumValue(cert?.grade, getSmartFieldValue(currentItem, BITRIX_FIELDS.GRADE), params.enumMaps.gradeMap, value => normalizeGradeValue(value).toLowerCase()),
  );
  pushIfDefined(
    BITRIX_FIELDS.MANAGER,
    "text",
    preferredTextValue(cert?.manager, getSmartFieldValue(currentItem, BITRIX_FIELDS.MANAGER)),
  );
  pushIfDefined(
    BITRIX_FIELDS.IS_PRINTED,
    "boolean",
    preferredBooleanValue(cert?.is_printed, getSmartFieldValue(currentItem, BITRIX_FIELDS.IS_PRINTED)),
  );
  pushIfDefined(
    BITRIX_FIELDS.EMPLOYEE_STATUS,
    "text",
    preferredEnumValue(cert?.employee_status, getSmartFieldValue(currentItem, BITRIX_FIELDS.EMPLOYEE_STATUS), params.enumMaps.employeeStatusMap, value => normalizeEmployeeStatusValue(value).toLowerCase()),
  );
  const preferredPrice = preferredNumberValue(cert?.price, getSmartFieldValue(currentItem, BITRIX_FIELDS.PRICE));
  if (preferredPrice !== undefined) {
    entries.push({ code: BITRIX_FIELDS.PRICE, kind: "number", value: preferredPrice });
  }

  return entries;
}

async function findExistingCompanyIdByBin(binIin: string, companyName: string): Promise<string | null> {
  const searchValues = Array.from(new Set([plain(binIin), digits(binIin), digits(binIin).replace(/^0+/, "")].filter(Boolean)));
  const candidates = new Map<string, Record<string, unknown>>();
  const normalizedName = plain(companyName).toLowerCase();

  for (const fieldCode of COMPANY_BIN_FIELD_CANDIDATES) {
    for (const value of searchValues) {
      try {
        const result = await callBitrix("crm.company.list", {
          filter: { [fieldCode]: value },
          order: { ID: "ASC" },
          select: ["ID", "TITLE", "UF_*"],
        });
        const rows = Array.isArray(result) ? result : Array.isArray(result?.items) ? result.items : [];
        for (const row of rows as Array<Record<string, unknown>>) {
          const id = plain(row.ID || row.id);
          if (id) candidates.set(id, row);
        }
      } catch {
        // keep trying next candidate
      }
    }
  }

  const best = Array.from(candidates.values()).sort((left, right) => {
    const leftTitle = plain(left.TITLE || left.title).toLowerCase();
    const rightTitle = plain(right.TITLE || right.title).toLowerCase();
    const leftExact = Number(normalizedName !== "" && leftTitle === normalizedName);
    const rightExact = Number(normalizedName !== "" && rightTitle === normalizedName);
    if (leftExact !== rightExact) return rightExact - leftExact;
    return Number(plain(left.ID || left.id) || "0") - Number(plain(right.ID || right.id) || "0");
  })[0];

  return best ? plain(best.ID || best.id) : null;
}

async function fetchCompanyFields(bitrixCompanyId: string): Promise<Record<string, unknown>> {
  const raw = await callBitrix("crm.company.get", { id: bitrixCompanyId });
  return (raw || {}) as Record<string, unknown>;
}

function crmMultiPrimaryValue(value: unknown): string {
  if (!Array.isArray(value)) return plain(value);
  for (const item of value as Array<Record<string, unknown>>) {
    const current = plain(item?.VALUE || item?.value);
    if (current) return current;
  }
  return "";
}

async function upsertCompany(company: CompanyRow, deal: DealRow | null): Promise<string> {
  const fields: Record<string, unknown> = {
    TITLE: company.name,
    PHONE: company.phone ? [{ VALUE: company.phone, VALUE_TYPE: "WORK" }] : [],
    EMAIL: company.email ? [{ VALUE: company.email, VALUE_TYPE: "WORK" }] : [],
    INDUSTRY: "",
  };
  const binValue = digits(company.bin_iin) || plain(company.bin_iin);
  for (const code of COMPANY_BIN_FIELD_CANDIDATES) {
    fields[code] = binValue;
    const camel = companyCamel(code);
    if (camel) fields[camel] = binValue;
  }

  const currentId = plain(deal?.bitrix_company_id || company.bitrix_company_id || "");
  if (currentId) {
    const currentCompany = await fetchCompanyFields(currentId);
    const fieldsToUpdate: Record<string, unknown> = {};

    if (plain(currentCompany.TITLE || currentCompany.title) !== plain(company.name)) {
      fieldsToUpdate.TITLE = fields.TITLE;
    }
    if (crmMultiPrimaryValue(currentCompany.PHONE) !== plain(company.phone)) {
      fieldsToUpdate.PHONE = fields.PHONE;
    }
    if (crmMultiPrimaryValue(currentCompany.EMAIL) !== plain(company.email)) {
      fieldsToUpdate.EMAIL = fields.EMAIL;
    }
    if (plain(currentCompany.INDUSTRY) !== "") {
      fieldsToUpdate.INDUSTRY = "";
    }
    for (const code of COMPANY_BIN_FIELD_CANDIDATES) {
      if (plain(getFieldValue(currentCompany, code)) !== binValue) {
        fieldsToUpdate[code] = fields[code];
        const camel = companyCamel(code);
        if (camel) fieldsToUpdate[camel] = fields[camel];
      }
    }

    if (Object.keys(fieldsToUpdate).length > 0) {
      await callBitrix("crm.company.update", { id: currentId, fields: fieldsToUpdate });
    }
    return currentId;
  }

  const existingId = await findExistingCompanyIdByBin(company.bin_iin, company.name);
  if (existingId) {
    const currentCompany = await fetchCompanyFields(existingId);
    const fieldsToUpdate: Record<string, unknown> = {};

    if (plain(currentCompany.TITLE || currentCompany.title) !== plain(company.name)) {
      fieldsToUpdate.TITLE = fields.TITLE;
    }
    if (crmMultiPrimaryValue(currentCompany.PHONE) !== plain(company.phone)) {
      fieldsToUpdate.PHONE = fields.PHONE;
    }
    if (crmMultiPrimaryValue(currentCompany.EMAIL) !== plain(company.email)) {
      fieldsToUpdate.EMAIL = fields.EMAIL;
    }
    if (plain(currentCompany.INDUSTRY) !== "") {
      fieldsToUpdate.INDUSTRY = "";
    }
    for (const code of COMPANY_BIN_FIELD_CANDIDATES) {
      if (plain(getFieldValue(currentCompany, code)) !== binValue) {
        fieldsToUpdate[code] = fields[code];
        const camel = companyCamel(code);
        if (camel) fieldsToUpdate[camel] = fields[camel];
      }
    }

    if (Object.keys(fieldsToUpdate).length > 0) {
      await callBitrix("crm.company.update", { id: existingId, fields: fieldsToUpdate });
    }
    return existingId;
  }

  const result = await callBitrix("crm.company.add", { fields });
  return plain(result?.ID || result?.id || result);
}

async function prepareBinaryFileFromUrl(fileUrl: string, preferredName: string): Promise<PreparedFile> {
  const response = await fetch(fileUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to fetch file: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const base64 = bytesToBase64(bytes);
  const ext = extensionFromContentType(response.headers.get("content-type") || "");
  let fileName = sanitizeFileName(preferredName);
  if (!fileName) fileName = sanitizeFileName(decodeURIComponent(new URL(fileUrl).pathname.split("/").pop() || ""));
  if (!fileName) fileName = `file${ext ? `.${ext}` : ""}`;
  return { fileName, base64 };
}

async function prepareBinaryFileFromStorage(bucket: string, path: string, preferredName: string): Promise<PreparedFile> {
  const { data, error } = await adminClient().storage.from(bucket).download(path);
  if (error) throw new Error(error.message || "Failed to download payment file from storage");

  const bytes = new Uint8Array(await data.arrayBuffer());
  const base64 = bytesToBase64(bytes);
  const ext = extensionFromContentType(data.type || "");
  let fileName = sanitizeFileName(preferredName);
  if (!fileName) fileName = sanitizeFileName(path.split("/").pop() || "");
  if (!fileName) fileName = `payment_order${ext ? `.${ext}` : ""}`;
  if (!/\.[a-z0-9]{2,6}$/i.test(fileName) && ext) fileName = `${fileName}.${ext}`;
  return { fileName, base64 };
}

async function preparePaymentFile(company: CompanyRow): Promise<PreparedFile> {
  const storageBucket = plain(company.payment_order_storage_bucket);
  const storagePath = plain(company.payment_order_storage_path);
  const preferredName = plain(company.payment_order_name);

  if (storageBucket && storagePath) {
    return await prepareBinaryFileFromStorage(storageBucket, storagePath, preferredName);
  }

  const paymentOrderUrl = plain(company.payment_order_url);
  if (!paymentOrderUrl) throw new Error("Payment order URL is empty");
  return await prepareBinaryFileFromUrl(paymentOrderUrl, preferredName);
}

async function attachPaymentFileToDeal(bitrixDealId: string, paymentFieldCode: string, company: CompanyRow) {
  const prepared = await preparePaymentFile(company);
  const fileData: [string, string] = [prepared.fileName, prepared.base64];
  const beforeSignature = await readDealFileFieldSignature(bitrixDealId, paymentFieldCode);
  const variants: Array<{ label: string; value: unknown }> = [
    { label: "tuple", value: fileData },
    { label: "tupleArray", value: [fileData] },
    { label: "wrapped", value: { fileData } },
    { label: "wrappedArray", value: [{ fileData }] },
    { label: "n0Tuple", value: { n0: fileData } },
    { label: "n0Wrapped", value: { n0: { fileData } } },
    { label: "wrappedWithId", value: [{ id: "", fileData }] },
  ];
  const errors: string[] = [];

  for (const variant of variants) {
    try {
      await callBitrix("crm.deal.update", {
        id: bitrixDealId,
        fields: { [paymentFieldCode]: variant.value },
      });

      const attached = await verifyDealFileAttached({
        bitrixDealId,
        paymentFieldCode,
        expectedFileName: prepared.fileName,
        beforeSignature,
      });
      if (attached) return;

      errors.push(`${variant.label}: accepted but not persisted`);
    } catch (error) {
      errors.push(`${variant.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Failed to attach payment file to Bitrix deal field ${paymentFieldCode}: ${errors.join(" | ")}`);
}

async function upsertDeal(params: {
  deal: DealRow | null;
  company: CompanyRow;
  bitrixCompanyId: string;
  dealTitle: string;
  paymentFieldCode: string;
  paymentStatusFieldCode: string;
  paymentFileFieldCode: string;
}) {
  let bitrixDealId = plain(params.deal?.bitrix_deal_id || "");
  const paymentStatusValue = params.company.payment_is_paid ? "Y" : "N";
  const paymentOrderUrl = plain(params.company.payment_order_url);
  const localPaymentFileSyncKey = getPaymentFileSourceKey(params.company);
  let paymentFileSyncKey = plain(params.deal?.payment_file_sync_key);
  let paymentUrlChanged = false;
  let shouldSyncPaymentFile = false;

  if (bitrixDealId) {
    const currentDeal = await fetchDealFields(bitrixDealId);
    const fieldsToUpdate: Record<string, unknown> = {};

    if (plain(currentDeal.TITLE) !== params.dealTitle) {
      fieldsToUpdate.TITLE = params.dealTitle;
    }
    if (plain(currentDeal.COMPANY_ID || currentDeal.companyId) !== params.bitrixCompanyId) {
      fieldsToUpdate.COMPANY_ID = params.bitrixCompanyId;
    }

    const currentCity = plain(currentDeal.UF_CRM_1772560175 || currentDeal.UF_CRM_CITY);
    if (plain(params.company.city) !== currentCity) {
      fieldsToUpdate["UF_CRM_1772560175"] = params.company.city || "";
      fieldsToUpdate["UF_CRM_CITY"] = params.company.city || "";
    }

    if (params.paymentFieldCode) {
      const currentPaymentUrl = plain(getDealFieldValue(currentDeal, params.paymentFieldCode));
      paymentUrlChanged = currentPaymentUrl !== paymentOrderUrl;
      if (paymentUrlChanged) {
        fieldsToUpdate[params.paymentFieldCode] = paymentOrderUrl;
      }
    }

    if (params.paymentStatusFieldCode) {
      const currentPaymentStatus = plain(getDealFieldValue(currentDeal, params.paymentStatusFieldCode));
      if (currentPaymentStatus !== paymentStatusValue) {
        fieldsToUpdate[params.paymentStatusFieldCode] = paymentStatusValue;
      }
    }

    if (Object.keys(fieldsToUpdate).length > 0) {
      await callBitrix("crm.deal.update", { id: bitrixDealId, fields: fieldsToUpdate });
    }

    if (params.paymentFileFieldCode && localPaymentFileSyncKey) {
      const currentDealFileValue = getDealFieldValue(currentDeal, params.paymentFileFieldCode);
      const hasCurrentDealFile = hasPersistedFileValue(currentDealFileValue);

      if (paymentFileSyncKey && paymentFileSyncKey === localPaymentFileSyncKey) {
        shouldSyncPaymentFile = false;
      } else if (!paymentFileSyncKey && hasCurrentDealFile) {
        paymentFileSyncKey = localPaymentFileSyncKey;
      } else {
        shouldSyncPaymentFile = true;
      }
    }
  } else {
    const fields: Record<string, unknown> = {
      TITLE: params.dealTitle,
      COMPANY_ID: params.bitrixCompanyId,
    };
    if (params.company.city) {
      fields["UF_CRM_1772560175"] = params.company.city;
      fields["UF_CRM_CITY"] = params.company.city;
    }
    if (params.paymentFieldCode && paymentOrderUrl) {
      fields[params.paymentFieldCode] = paymentOrderUrl;
    }
    if (params.paymentStatusFieldCode) {
      fields[params.paymentStatusFieldCode] = paymentStatusValue;
    }

    const result = await callBitrix("crm.deal.add", {
      fields: { ...fields, STAGE_ID: "NEW" },
    });
    bitrixDealId = plain(result?.ID || result?.id || result);
    shouldSyncPaymentFile = Boolean(params.paymentFileFieldCode && localPaymentFileSyncKey);
  }

  if (
    shouldSyncPaymentFile &&
    params.paymentFileFieldCode &&
    localPaymentFileSyncKey
  ) {
    await attachPaymentFileToDeal(
      bitrixDealId,
      params.paymentFileFieldCode,
      params.company,
    );
    paymentFileSyncKey = localPaymentFileSyncKey;
  }

  return {
    bitrixDealId,
    paymentFileSyncKey,
  };
}

async function createSmartProcessItem(params: {
  dealId: string;
  companyId: string;
  fields: Record<string, unknown>;
}): Promise<string> {
  const relationVariants: Array<Record<string, unknown>> = [
    { PARENT_ID_2: params.dealId, COMPANY_ID: params.companyId },
    { parentId2: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
    { PARENT_ID_1: params.dealId, COMPANY_ID: params.companyId },
    { parentId1: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
    { COMPANY_ID: params.companyId },
  ];

  let lastError: Error | null = null;

  for (const relation of relationVariants) {
    try {
      const result = await callBitrix("crm.item.add", {
        entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
        fields: {
          ...params.fields,
          ...relation,
        },
      });
      return plain((result as Record<string, unknown>)?.item?.id || (result as Record<string, unknown>)?.id || result);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error("Failed to create smart-process item");
}

async function updateSmartProcessItem(itemId: string, fields: Record<string, unknown>): Promise<void> {
  await callBitrix("crm.item.update", {
    entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
    id: itemId,
    fields,
  });
}

async function fetchSmartProcessItem(itemId: string): Promise<Record<string, unknown>> {
  const raw = await callBitrix("crm.item.get", {
    entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
    id: itemId,
  });
  const item = ((raw as Record<string, unknown>)?.item || raw || {}) as Record<string, unknown>;
  const itemFields = item.fields && typeof item.fields === "object" ? item.fields as Record<string, unknown> : null;
  return itemFields ? { ...item, ...itemFields } : item;
}

function buildCloudinaryJpgCandidates(photoUrl: string): string[] {
  const base = plain(photoUrl);
  if (!base) return [];
  const candidates = new Set<string>([base]);
  if (/res\.cloudinary\.com/i.test(base) && /\/upload\//i.test(base)) {
    candidates.add(base.replace("/upload/", "/upload/f_jpg,q_auto:good,w_1600,h_1600,c_limit/"));
    candidates.add(base.replace("/upload/", "/upload/f_jpg,q_auto:good/"));
    candidates.add(base.replace("/upload/", "/upload/f_jpg/"));
  }
  return Array.from(candidates);
}

async function preparePhotoForBitrix(photoUrl: string, participantName: string): Promise<PreparedFile> {
  let response: Response | null = null;
  for (const candidate of buildCloudinaryJpgCandidates(photoUrl)) {
    try {
      const current = await fetch(candidate, { cache: "no-store" });
      if (!current.ok) continue;
      response = current;
      break;
    } catch {
      // try next url variant
    }
  }
  if (!response) throw new Error("Failed to fetch photo");

  const bytes = new Uint8Array(await response.arrayBuffer());
  const base64 = bytesToBase64(bytes);
  const fileNameBase = sanitizeFileName(participantName).replace(/\.+$/, "") || `photo_${Date.now().toString(36)}`;
  return { fileName: `${fileNameBase}.jpg`, base64 };
}

async function getPreparedPhoto(photoUrl: string, participantName: string): Promise<PreparedFile> {
  const cacheKey = `${plain(photoUrl)}::${plain(participantName)}`;
  const cached = preparedPhotoCache.get(cacheKey);
  if (cached) return await cached;
  const pending = preparePhotoForBitrix(photoUrl, participantName).catch(error => {
    preparedPhotoCache.delete(cacheKey);
    throw error;
  });
  preparedPhotoCache.set(cacheKey, pending);
  return await pending;
}

function buildPhotoPayload(fieldKey: string, variant: PhotoContract["variant"], prepared: PreparedFile): Record<string, unknown> {
  const fileData: [string, string] = [prepared.fileName, prepared.base64];
  switch (variant) {
    case "tuple":
      return { [fieldKey]: fileData };
    case "wrapped":
      return { [fieldKey]: { fileData } };
    case "wrappedWithId":
      return { [fieldKey]: { id: "", fileData } };
    case "tupleArray":
      return { [fieldKey]: [fileData] };
  }
}

async function verifyPhotoAttached(itemId: string, fieldKey: string): Promise<boolean> {
  const raw = await callBitrix("crm.item.get", { entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID, id: itemId });
  const item = ((raw as Record<string, unknown>)?.item || raw || {}) as Record<string, unknown>;
  const itemFields = item.fields && typeof item.fields === "object" ? item.fields as Record<string, unknown> : null;
  return hasPersistedFileValue(getFieldValue(item, fieldKey)) ||
    Boolean(itemFields && hasPersistedFileValue(getFieldValue(itemFields, fieldKey)));
}

async function attachPhotoToSmartItem(itemId: string, photoUrl: string, participantName: string) {
  const prepared = await getPreparedPhoto(photoUrl, participantName);
  if (photoContractCache) {
    await callBitrix("crm.item.update", {
      entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
      id: itemId,
      fields: buildPhotoPayload(photoContractCache.fieldKey, photoContractCache.variant, prepared),
    });
    return;
  }

  for (const fieldKey of [PHOTO_FIELD_KEY, BITRIX_FIELDS_RAW.PHOTO]) {
    for (const variant of ["tuple", "wrapped", "wrappedWithId", "tupleArray"] as const) {
      try {
        await callBitrix("crm.item.update", {
          entityTypeId: SMART_PROCESS_ENTITY_TYPE_ID,
          id: itemId,
          fields: buildPhotoPayload(fieldKey, variant, prepared),
        });
        if (await verifyPhotoAttached(itemId, fieldKey)) {
          photoContractCache = { fieldKey, variant };
          return;
        }
      } catch {
        // try next field/payload variant
      }
    }
  }

  throw new Error("Failed to attach photo to Bitrix smart-process item");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflightResponse(req);

  const corsError = validateCorsRequest(req);
  if (corsError) return corsError;

  if (req.method !== "POST") {
    return jsonResponse(req, 405, { error: "Method not allowed" });
  }

  try {
    const body = await req.json();
    const questionnaireId = plain(body?.questionnaireId);
    const paymentFieldCode = plain(body?.paymentFieldCode || Deno.env.get("BITRIX_DEAL_PAYMENT_FIELD") || "");
    const paymentStatusFieldCode = plain(body?.paymentStatusFieldCode || Deno.env.get("BITRIX_DEAL_PAYMENT_STATUS_FIELD") || "");
    const paymentFileFieldCode = plain(body?.paymentFileFieldCode || Deno.env.get("BITRIX_DEAL_PAYMENT_FILE_FIELD") || "");

    if (!questionnaireId) {
      return jsonResponse(req, 400, { error: "questionnaireId is required" });
    }

    const supabase = adminClient();
    const [companyResult, dealResult, participantsResult] = await Promise.all([
      supabase
        .from("companies")
        .select("id, name, phone, email, bin_iin, city, bitrix_company_id, payment_order_url, payment_order_name, payment_order_storage_bucket, payment_order_storage_path, payment_is_paid")
        .eq("questionnaire_id", questionnaireId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("deals")
        .select("id, bitrix_deal_id, bitrix_company_id, payment_file_sync_key")
        .eq("questionnaire_id", questionnaireId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("participants")
        .select("id, last_name, first_name, patronymic, position, category, photo_url")
        .eq("questionnaire_id", questionnaireId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (companyResult.error) throw companyResult.error;
    if (dealResult.error) throw dealResult.error;
    if (participantsResult.error) throw participantsResult.error;

    const company = companyResult.data as CompanyRow | null;
    const deal = dealResult.data as DealRow | null;
    const participants = (participantsResult.data || []) as ParticipantRow[];

    if (!company) throw new Error("Компания для анкеты не найдена");
    if (participants.length === 0) throw new Error("В анкете нет сотрудников для синхронизации");

    const coursesResult = await supabase
      .from("participant_courses")
      .select("participant_id, course_name")
      .in("participant_id", participants.map(item => item.id));
    if (coursesResult.error) throw coursesResult.error;

    const coursesByParticipant = new Map<string, string[]>();
    for (const row of (coursesResult.data || []) as Array<{ participant_id: string; course_name: string }>) {
      const bucket = coursesByParticipant.get(row.participant_id) || [];
      bucket.push(plain(row.course_name));
      coursesByParticipant.set(row.participant_id, bucket);
    }

    const syncTasks: SyncTask[] = participants.flatMap(participant => {
      const courses = coursesByParticipant.get(participant.id) || [""];
      return courses.map(courseName => ({ participant, courseName }));
    });

    const allCourses = Array.from(new Set(syncTasks.map(task => task.courseName).filter(Boolean)));
    const dealTitle = [
      [company.name, company.city].filter(Boolean).join(" - "),
      `${participants.length} сотрудников, ${allCourses.length} курсов, ${syncTasks.length} заявок на курсы`,
    ].filter(Boolean).join(" - ");

    const bitrixCompanyId = await upsertCompany(company, deal);
    await supabase.from("companies").update({ bitrix_company_id: bitrixCompanyId }).eq("id", company.id);

    const { bitrixDealId, paymentFileSyncKey } = await upsertDeal({
      deal,
      company,
      bitrixCompanyId,
      dealTitle,
      paymentFieldCode,
      paymentStatusFieldCode,
      paymentFileFieldCode,
    });

    const dealPayload = {
      questionnaire_id: questionnaireId,
      company_id: company.id,
      bitrix_deal_id: bitrixDealId,
      bitrix_company_id: bitrixCompanyId,
      payment_file_sync_key: paymentFileSyncKey,
      deal_title: dealTitle,
      deal_url: buildDealUrl(bitrixDealId),
      sync_status: "in_progress",
      updated_at: new Date().toISOString(),
    };
    if (deal?.id) {
      await supabase.from("deals").update(dealPayload).eq("id", deal.id);
    } else {
      await supabase.from("deals").insert(dealPayload);
    }

    const existingCertsResult = await supabase
      .from("certificates")
      .select("id, participant_id, bitrix_item_id, photo_sync_key, last_name, first_name, middle_name, position, category, course_name, start_date, expiry_date, commission_chair, protocol_number, document_number, commission_member_1, commission_member_2, commission_member_3, commission_member_4, commission_members, qualification, level, marker_pass, type_learn, commis_concl, grade, manager, is_printed, employee_status, price")
      .eq("questionnaire_id", questionnaireId);
    if (existingCertsResult.error) throw existingCertsResult.error;

    const existingCertificates = (existingCertsResult.data || []) as ExistingCertificateRow[];
    const existingCertificateByKey = new Map<string, ExistingCertificateRow>();
    for (const cert of existingCertificates) {
      const key = taskKey(cert.participant_id, cert.course_name);
      if (!key.startsWith("::") && !existingCertificateByKey.has(key)) {
        existingCertificateByKey.set(key, cert);
      }
    }

    const enumMaps = await loadEnumMaps();
    const certificateInserts: Array<Record<string, unknown>> = [];
    const certificateUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];
    let photoFailures = 0;
    const photoFailureSamples: string[] = [];

    await runInChunks(syncTasks, BITRIX_SYNC_CONCURRENCY, async task => {
      const existingCertificate = existingCertificateByKey.get(taskKey(task.participant.id, task.courseName)) || null;
      const expectedTitle = `${task.participant.last_name} ${task.participant.first_name} - ${task.courseName}`;
      const itemIdRaw = plain(existingCertificate?.bitrix_item_id);
      let itemId = itemIdRaw;
      let currentBitrixItem: Record<string, unknown> | null = null;
      let restorePatch: Record<string, unknown> = {};
      let shouldAttachPhoto = false;
      let resolvedPhotoSyncKey = plain(existingCertificate?.photo_sync_key);

      if (/^\d+$/.test(itemIdRaw)) {
        try {
          currentBitrixItem = await fetchSmartProcessItem(itemIdRaw);
        } catch (error) {
          if (isBitrixItemMissingError(error)) {
            itemId = "";
            currentBitrixItem = null;
          } else {
            throw error;
          }
        }
      } else {
        itemId = "";
      }

      const desiredFieldEntries = buildDesiredSmartProcessFieldEntries({
        participant: task.participant,
        courseName: task.courseName,
        expectedTitle,
        existingCertificate,
        currentItem: currentBitrixItem,
        enumMaps,
      });
      const desiredFields = buildSmartProcessFieldRecord(desiredFieldEntries);

      if (itemId && currentBitrixItem) {
        const changedFields = buildSmartProcessUpdatePatch(currentBitrixItem, desiredFieldEntries);
        if (Object.keys(changedFields).length > 0) {
          await updateSmartProcessItem(itemId, changedFields);
          currentBitrixItem = { ...currentBitrixItem, ...changedFields };
        }

        if (existingCertificate && needsCertificateRestore(existingCertificate)) {
          restorePatch = buildCertificateRestorePatch(existingCertificate, currentBitrixItem);
        }
      }

      if (!itemId) {
        itemId = await createSmartProcessItem({
          dealId: bitrixDealId,
          companyId: bitrixCompanyId,
          fields: desiredFields,
        });
        shouldAttachPhoto = Boolean(task.participant.photo_url);
      }

      const photoSourceKey = getPhotoSourceKey(task.participant.photo_url);
      const hasCurrentPhoto = currentBitrixItem ? smartItemHasPhoto(currentBitrixItem) : false;
      const shouldSyncPhoto = Boolean(photoSourceKey) && (
        shouldAttachPhoto ||
        (resolvedPhotoSyncKey && resolvedPhotoSyncKey !== photoSourceKey) ||
        (!resolvedPhotoSyncKey && !hasCurrentPhoto)
      );

      if (photoSourceKey && shouldSyncPhoto) {
        const fullName = [task.participant.last_name, task.participant.first_name, task.participant.patronymic].filter(Boolean).join(" ");
        try {
          await attachPhotoToSmartItem(itemId, task.participant.photo_url, fullName);
          resolvedPhotoSyncKey = photoSourceKey;
        } catch (error) {
          photoFailures++;
          if (photoFailureSamples.length < 3) {
            photoFailureSamples.push(`${fullName || task.participant.id}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } else if (photoSourceKey && !resolvedPhotoSyncKey && hasCurrentPhoto) {
        resolvedPhotoSyncKey = photoSourceKey;
      }

      const baseCertificatePatch: Record<string, unknown> = {
        ...restorePatch,
        questionnaire_id: questionnaireId,
        company_id: company.id,
        participant_id: task.participant.id,
        bitrix_item_id: itemId,
        last_name: task.participant.last_name,
        first_name: task.participant.first_name,
        middle_name: task.participant.patronymic,
        position: task.participant.position,
        category: task.participant.category,
        course_name: task.courseName,
        sync_status: "synced",
        sync_error: "",
        updated_at: new Date().toISOString(),
      };
      if (resolvedPhotoSyncKey) {
        baseCertificatePatch.photo_sync_key = resolvedPhotoSyncKey;
      }

      if (existingCertificate?.id) {
        certificateUpdates.push({
          id: existingCertificate.id,
          patch: baseCertificatePatch,
        });
      } else {
        certificateInserts.push(baseCertificatePatch);
      }
    });

    if (certificateUpdates.length > 0) {
      await runInChunks(certificateUpdates, BITRIX_SYNC_CONCURRENCY, async item => {
        const { error } = await supabase
          .from("certificates")
          .update(item.patch)
          .eq("id", item.id);
        if (error) throw error;
      });
    }

    if (certificateInserts.length > 0) {
      const { error } = await supabase.from("certificates").insert(certificateInserts);
      if (error) throw error;
    }

    await supabase
      .from("deals")
      .update({
        sync_status: "success",
        synced_at: new Date().toISOString(),
        deal_url: buildDealUrl(bitrixDealId),
        bitrix_deal_id: bitrixDealId,
        bitrix_company_id: bitrixCompanyId,
        payment_file_sync_key: paymentFileSyncKey,
      })
      .eq("questionnaire_id", questionnaireId);

    return jsonResponse(req, 200, {
      ok: true,
      isUpdate: Boolean(plain(deal?.bitrix_deal_id)),
      dealTitle,
      dealUrl: buildDealUrl(bitrixDealId),
      certificateCount: certificateUpdates.length + certificateInserts.length,
      photoFailures,
      photoFailureSamples,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    try {
      const body = await req.clone().json();
      const questionnaireId = plain(body?.questionnaireId);
      if (questionnaireId) {
        await adminClient()
          .from("deals")
          .update({ sync_status: "error", error_message: message })
          .eq("questionnaire_id", questionnaireId);
      }
    } catch {
      // ignore error persistence failure
    }
    return jsonResponse(req, 500, { error: message });
  }
});
