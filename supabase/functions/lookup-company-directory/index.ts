import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BITRIX_WEBHOOK_URL = (Deno.env.get("BITRIX_WEBHOOK_URL") || "").replace(/\/+$/, "");
const CONTRACT_ENTITY_TYPE_ID = Number(Deno.env.get("BITRIX_CONTRACT_ENTITY_TYPE_ID") || "1060");
const DEFAULT_ALLOWED_HEADERS = "Content-Type, Authorization, X-Client-Info, Apikey";
const DEFAULT_ALLOWED_METHODS = "POST, OPTIONS";
const COMPANY_BIN_FIELD_CANDIDATES = [
  "UF_CRM_BIN_IIN",
  "UF_CRM_1772589149",
  "UF_CRM_1772598092",
  "UF_CRM_1772598149",
];

type DirectoryRow = {
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

function extractListRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  const wrapped = (payload || {}) as Record<string, unknown>;
  if (Array.isArray(wrapped.items)) return wrapped.items as Array<Record<string, unknown>>;
  if (Array.isArray(wrapped.result)) return wrapped.result as Array<Record<string, unknown>>;
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
  const smartCamel = smartUfCamelFromUpper(base);
  if (smartCamel) variants.add(smartCamel);
  const companyCamel = companyUfCamelFromUpper(base);
  if (companyCamel) variants.add(companyCamel);
  return Array.from(variants);
}

function getFieldValue(item: Record<string, unknown>, code: string): unknown {
  for (const key of fieldKeyVariants(code)) {
    if (Object.prototype.hasOwnProperty.call(item, key)) return item[key];
  }
  return undefined;
}

function pickFirstNonEmpty(item: Record<string, unknown>, codes: string[]): string {
  for (const code of codes) {
    const value = plain(getFieldValue(item, code) ?? item[code]);
    if (value) return value;
  }
  return "";
}

function extractPhone(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as Record<string, unknown>;
    return plain(first.VALUE || first.value || first.VALUE_NUMBER);
  }
  return plain(value);
}

function extractEmail(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as Record<string, unknown>;
    return plain(first.VALUE || first.value);
  }
  return plain(value);
}

function isContractStatusActive(status: string): boolean {
  const value = plain(status).toLowerCase();
  if (!value) return false;
  return /(действ|актив|active|valid|в работе)/i.test(value);
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

async function resolveCompanyBinFieldCodes(): Promise<string[]> {
  const result = new Set<string>(COMPANY_BIN_FIELD_CANDIDATES);

  try {
    const raw = await callBitrix("crm.company.fields", {});
    const fields = ((raw as Record<string, unknown>)?.fields || raw || {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(fields)) {
      const field = (value || {}) as Record<string, unknown>;
      const title = decodeUnicodeEscapes(plain(field.title || field.formLabel || field.LIST_LABEL)).toLowerCase();
      const code = plain(field.name || field.fieldName || field.FIELD_NAME || key).toUpperCase();
      const byCode = /\bBIN\b|\bIIN\b/.test(code);
      const byTitle = /(?:бин|иин|bin|iin)/i.test(title);
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

function rowHasBinDigits(row: Record<string, unknown>, expectedDigits: string, fieldCodes: string[]): boolean {
  const expectedNoZero = expectedDigits.replace(/^0+/, "");
  const keys = new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...fieldCodes]);
  for (const key of Array.from(keys)) {
    const upper = plain(key).toUpperCase();
    if (upper.startsWith("UF_CRM_")) {
      keys.add(upper);
      keys.add(upper.toLowerCase());
      const camel = companyUfCamelFromUpper(upper);
      if (camel) keys.add(camel);
    }
  }

  const extractValues = (value: unknown): string[] => {
    if (value == null) return [];
    if (typeof value === "string" || typeof value === "number") return [String(value)];
    if (Array.isArray(value)) return value.flatMap(item => extractValues(item));
    if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(item => extractValues(item));
    return [];
  };

  for (const key of keys) {
    for (const raw of extractValues(getFieldValue(row, key) ?? row[key])) {
      const valueDigits = digits(raw);
      if (!valueDigits) continue;
      const noZero = valueDigits.replace(/^0+/, "");
      if (valueDigits === expectedDigits || noZero === expectedNoZero) return true;
    }
  }

  return false;
}

async function listAllBitrixCompanies(): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const batchSize = 50;
  const maxPages = 120;

  for (let page = 0; page < maxPages; page++) {
    const start = page * batchSize;
    const chunk = await callBitrix("crm.company.list", {
      order: { ID: "ASC" },
      start,
      select: ["ID", "TITLE", "PHONE", "EMAIL", "UF_*"],
    });
    const rows = extractListRows(chunk);
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < batchSize) break;
  }

  return out;
}

async function findCompanyByBin(bin: string): Promise<Record<string, unknown> | null> {
  const binDigits = digits(bin);
  if (!binDigits) return null;

  const fieldCodes = await resolveCompanyBinFieldCodes();
  const searchValues = Array.from(new Set([plain(bin), binDigits, binDigits.replace(/^0+/, "")].filter(Boolean)));
  const candidates = new Map<string, Record<string, unknown>>();

  for (const code of fieldCodes) {
    for (const value of searchValues) {
      try {
        const raw = await callBitrix("crm.company.list", {
          filter: { [code]: value },
          order: { ID: "ASC" },
          select: ["ID", "TITLE", "PHONE", "EMAIL", "UF_*"],
        });
        for (const row of extractListRows(raw)) {
          const id = plain(row.ID || row.id);
          if (id) candidates.set(id, row);
        }
      } catch {
        // try next
      }
    }
  }

  let rows = Array.from(candidates.values()).filter(row => rowHasBinDigits(row, binDigits, fieldCodes));
  if (rows.length === 0) {
    try {
      rows = (await listAllBitrixCompanies()).filter(row => rowHasBinDigits(row, binDigits, fieldCodes));
    } catch {
      rows = [];
    }
  }

  rows.sort((left, right) => Number(plain(left.ID || left.id) || "0") - Number(plain(right.ID || right.id) || "0"));
  return rows[0] || null;
}

async function resolveContractFieldMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const raw = await callBitrix("crm.item.fields", { entityTypeId: CONTRACT_ENTITY_TYPE_ID });
    const fields: Record<string, unknown> = ((raw as Record<string, unknown>)?.fields || raw || {}) as Record<string, unknown>;

    const entries = Object.entries(fields).map(([key, value]) => {
      const field = (value || {}) as Record<string, unknown>;
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
      opts?: { preferUserFields?: boolean; disallowSystemFallback?: boolean },
    ) => {
      const userEntries = entries.filter(entry => entry.isUserField);
      const prioritized = opts?.preferUserFields
        ? [...userEntries, ...entries.filter(entry => !entry.isUserField)]
        : entries;
      const source = opts?.disallowSystemFallback ? userEntries : prioritized;
      const byTitle = source.find(entry => titlePatterns.some(pattern => pattern.test(entry.title)));
      if (byTitle) return byTitle.upperName || byTitle.key || "";
      const byKey = source.find(entry => keyPatterns.some(pattern => pattern.test(entry.keyProbe)));
      return byKey ? (byKey.upperName || byKey.key || "") : "";
    };

    map.company = findByTitleOrKey(
      [/компан/, /клиент/, /client/, /company/],
      [/(^|_)company(_id)?($|_)/, /client/],
    );
    map.number = findByTitleOrKey(
      [/номер.*договор/, /^договор\s*№?/, /contract.*number/],
      [/(contract|dogovor).*(number|num|nomer)/, /(number|num|nomer).*(contract|dogovor)/],
    );
    map.contractDate = findByTitleOrKey(
      [/дата.*договор/, /contract.*date/],
      [/(contract|dogovor).*(date|data)/],
      { preferUserFields: true, disallowSystemFallback: true },
    );
    map.startDate = findByTitleOrKey(
      [/дата.*нач/, /действ.*с/, /date.*start/, /start.*date/],
      [/(start|begin|from|date_start|date_begin)/],
      { preferUserFields: true, disallowSystemFallback: true },
    );
    map.endDate = findByTitleOrKey(
      [/дата.*оконч/, /действ.*по/, /date.*end/, /end.*date/],
      [/(end|finish|to|expire|close|date_end|date_close)/],
      { preferUserFields: true, disallowSystemFallback: true },
    );
    map.status = findByTitleOrKey(
      [/^статус$/, /contract.*status/, /состояние/],
      [/(^|_)(status|stage)(_|$)/],
    );

    if (!map.company) map.company = "companyId";
    if (!map.status) map.status = "stageId";
  } catch {
    // best effort
  }

  return map;
}

async function listContractsForCompany(companyId: string, fieldMap: Record<string, string>): Promise<Record<string, unknown>[]> {
  const filters: Array<Record<string, unknown>> = [
    { companyId },
    { COMPANY_ID: companyId },
    ...(fieldMap.company ? [{ [fieldMap.company]: companyId }] : []),
  ];

  for (const filter of filters) {
    try {
      const raw = await callBitrix("crm.item.list", {
        entityTypeId: CONTRACT_ENTITY_TYPE_ID,
        filter,
        select: ["id", "title", "companyId", "COMPANY_ID", "*", "uf*"],
      });
      const rows = extractListRows(raw);
      if (rows.length > 0) return rows;
    } catch {
      // try next filter
    }
  }

  try {
    const out: Record<string, unknown>[] = [];
    const batchSize = 50;
    for (let page = 0; page < 80; page++) {
      const start = page * batchSize;
      const raw = await callBitrix("crm.item.list", {
        entityTypeId: CONTRACT_ENTITY_TYPE_ID,
        order: { id: "ASC" },
        start,
        select: ["id", "title", "companyId", "COMPANY_ID", "*", "uf*"],
      });
      const rows = extractListRows(raw);
      if (rows.length === 0) break;
      out.push(...rows.filter(row => plain(row.companyId || row.COMPANY_ID || getFieldValue(row, fieldMap.company)) === companyId));
      if (rows.length < batchSize) break;
    }
    return out;
  } catch {
    return [];
  }
}

function buildDirectoryRow(company: Record<string, unknown>, contracts: ContractSnapshot[], binFieldCodes: string[]): DirectoryRow {
  const bitrixCompanyId = plain(company.ID || company.id);
  const binValue = pickFirstNonEmpty(company, binFieldCodes);
  const primary = choosePrimaryContract(contracts);

  return {
    bitrix_company_id: bitrixCompanyId,
    name: plain(company.TITLE || company.title),
    bin_iin: plain(binValue),
    bin_iin_digits: digits(binValue),
    phone: extractPhone(company.PHONE || company.phone),
    email: extractEmail(company.EMAIL || company.email),
    city: plain(company.CITY || company.UF_CRM_CITY || company.UF_CRM_1772560175),
    has_contract: contracts.length > 0,
    contract_count: contracts.length,
    contract_bitrix_id: primary?.id || "",
    contract_title: primary?.title || "",
    contract_number: primary?.number || "",
    contract_date: primary?.contractDate || null,
    contract_start: primary?.startDate || null,
    contract_end: primary?.endDate || null,
    contract_status: primary?.status || "",
    contract_is_active: Boolean(primary?.isActive),
  };
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
    const bin = digits(body?.bin);
    if (!bin) {
      return jsonResponse(req, 400, { error: "bin is required" });
    }

    const company = await findCompanyByBin(bin);
    if (!company) {
      return jsonResponse(req, 200, { found: false });
    }

    const [binFieldCodes, contractFieldMap] = await Promise.all([
      resolveCompanyBinFieldCodes(),
      resolveContractFieldMap(),
    ]);

    const contractItems = await listContractsForCompany(plain(company.ID || company.id), contractFieldMap);
    const today = new Date().toISOString().slice(0, 10);
    const contracts = contractItems.map(item => {
      const title = plain(item.title || item.TITLE);
      const status = plain(getFieldValue(item, contractFieldMap.status) || getFieldValue(item, "status") || getFieldValue(item, "stageId"));
      const contractDate = normalizeDateValue(contractFieldMap.contractDate ? getFieldValue(item, contractFieldMap.contractDate) : null);
      const startDate = normalizeDateValue(contractFieldMap.startDate ? getFieldValue(item, contractFieldMap.startDate) : null);
      const endDate = normalizeDateValue(contractFieldMap.endDate ? getFieldValue(item, contractFieldMap.endDate) : null);
      const isActiveByDate = Boolean(startDate && endDate && startDate <= endDate && startDate <= today && endDate >= today);

      return {
        id: plain(item.id || item.ID),
        title,
        number: plain(getFieldValue(item, contractFieldMap.number) || getFieldValue(item, "number") || getFieldValue(item, "contractNumber") || title),
        contractDate,
        startDate,
        endDate,
        status,
        isActive: isContractStatusActive(status) || isActiveByDate,
      } satisfies ContractSnapshot;
    });

    const row = buildDirectoryRow(company, contracts, binFieldCodes);
    const now = new Date().toISOString();
    const payload = { ...row, updated_at: now };
    const { data, error } = await adminClient()
      .from("ref_company_directory")
      .upsert(payload, { onConflict: "bitrix_company_id" })
      .select("*")
      .maybeSingle();

    if (error) throw error;

    return jsonResponse(req, 200, {
      found: true,
      row: data || payload,
      contractsCount: contracts.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown lookup error";
    return jsonResponse(req, 500, { error: message });
  }
});
