import { logger } from './logger';

const WEBHOOK = import.meta.env.VITE_BITRIX_WEBHOOK as string;
const ENTITY_TYPE_ID = 1;

export const BITRIX_FIELDS = {
  LAST_NAME: 'ufCrm12_1772560668',
  FIRST_NAME: 'ufCrm12_1772560711',
  MIDDLE_NAME: 'ufCrm12_1772560721',
  POSITION: 'ufCrm12_1772560767',
  CATEGORY: 'ufCrm12_1772560781',
  COURSE_NAME: 'ufCrm12_1772560835',
  COURSE_START_DATE: 'ufCrm12_1772561081',
  DOCUMENT_EXPIRY_DATE: 'ufCrm12_1772561142',
  COMMISSION_CHAIR: 'ufCrm12_1772561169',
  PROTOCOL: 'ufCrm12_1772561202',
  DOCUMENT_NUMBER: 'ufCrm12_1772561299',
  COMMISSION_MEMBER_1: 'ufCrm12_1772561371',
  COMMISSION_MEMBER_2: 'ufCrm12_1772561385',
  COMMISSION_MEMBER_3: 'ufCrm12_1772561392',
  COMMISSION_MEMBER_4: 'ufCrm12_1772561401',
  COMMISSION_MEMBERS: 'ufCrm12_1772561415',
  QUALIFICATION: 'ufCrm12_1772561427',
  MANAGER: 'ufCrm12_1772561434',
  IS_PRINTED: 'ufCrm12_1772561447',
  EMPLOYEE_STATUS: 'ufCrm12_1772561489',
  PRICE: 'ufCrm12_1773257578',
};

export const BITRIX_FIELDS_RAW = {
  LAST_NAME: 'UF_CRM_12_1772560668',
  FIRST_NAME: 'UF_CRM_12_1772560711',
  MIDDLE_NAME: 'UF_CRM_12_1772560721',
  POSITION: 'UF_CRM_12_1772560767',
  CATEGORY: 'UF_CRM_12_1772560781',
  COURSE_NAME: 'UF_CRM_12_1772560835',
  PHOTO: 'UF_CRM_12_1772578817',
  PRICE: 'UF_CRM_12_1773257578',
};

export const PHOTO_FIELD_KEY = 'ufCrm12_1772578817';

const photoFieldKeyCache = new Map<number, string[]>();
const enumFieldOptionsCache = new Map<string, Map<string, string>>();

function decodeUnicodeEscapes(value: string): string {
  return String(value || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

const SMART_PROCESS_ENTITY_TYPE_ID = 1056;

const COMPANY_BIN_FIELD_CANDIDATES = [
  'UF_CRM_BIN_IIN',
  'UF_CRM_1772589149',
  'UF_CRM_1772598092',
  'UF_CRM_1772598149',
];

const PHOTO_FIELD_CANDIDATES = [
  'UF_CRM_12_1772578817',
  'ufCrm12_1772578817',
];

function ufCamelFromUpper(code: string): string | null {
  const normalized = String(code || '').trim().toUpperCase();
  const smart = normalized.match(/^UF_CRM_(\d+)_(\d+)$/);
  if (smart) return `ufCrm${smart[1]}_${smart[2]}`;

  const company = normalized.match(/^UF_CRM_(\d+)$/);
  if (company) return `ufCrm${company[1]}`;

  return null;
}

function companyUfCamelFromUpper(code: string): string | null {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^UF_CRM_\d+$/.test(normalized)) return null;
  return ufCamelFromUpper(normalized);
}

function smartUfCamelFromUpper(code: string): string | null {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^UF_CRM_\d+_\d+$/.test(normalized)) return null;
  return ufCamelFromUpper(normalized);
}

function buildCompanyBinFields(binIin: string, fieldCodes: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  const digits = String(binIin || '').replace(/\D/g, '');
  const value = digits || String(binIin || '').trim();
  const allCodes = new Set<string>(fieldCodes.filter(Boolean));

  for (const codeRaw of Array.from(allCodes)) {
    const code = String(codeRaw || '').trim();
    if (!code) continue;

    fields[code] = value;

    if (/^UF_CRM_/i.test(code)) {
      const upper = code.toUpperCase();
      fields[upper] = value;
      const camel = companyUfCamelFromUpper(upper);
      if (camel) fields[camel] = value;
    }
  }

  return fields;
}

// Bitrix REST schema is method-specific and dynamic, so a strict shared type is not practical here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callBitrix(method: string, params: Record<string, unknown>): Promise<any> {
  const url = `${WEBHOOK}/${method}.json`;
  const maxAttempts = 4;
  let lastError: Error | null = null;

  const shouldRetryHttp = (status: number) => status === 429 || status >= 500;
  const shouldRetryBitrix = (code: string) =>
    code === 'QUERY_LIMIT_EXCEEDED' ||
    code === 'TOO_MANY_REQUESTS' ||
    code === 'TIMEOUT';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const bodyText = await response.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};
      try {
        data = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const err = new Error(`Bitrix HTTP ${response.status} at ${method}: ${bodyText || 'empty response'}`);
        lastError = err;
        if (attempt < maxAttempts && shouldRetryHttp(response.status)) {
          logger.warn('bitrix.call', `Retry ${attempt}/${maxAttempts} for ${method} after HTTP ${response.status}`);
          await new Promise(resolve => setTimeout(resolve, 350 * attempt));
          continue;
        }
        throw err;
      }

      if (data.error) {
        const code = String(data.error || '').trim().toUpperCase();
        const desc = String(data.error_description || data.error || 'Unknown Bitrix error');
        const err = new Error(`Bitrix ${method} error ${code}: ${desc}`);
        lastError = err;
        if (attempt < maxAttempts && shouldRetryBitrix(code)) {
          logger.warn('bitrix.call', `Retry ${attempt}/${maxAttempts} for ${method} after ${code}`);
          await new Promise(resolve => setTimeout(resolve, 350 * attempt));
          continue;
        }
        throw err;
      }

      return data.result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const networkLike = /failed to fetch|networkerror|network request failed|load failed/i.test(message);
      lastError = e instanceof Error ? e : new Error(message);

      if (attempt < maxAttempts && networkLike) {
        logger.warn('bitrix.call', `Retry ${attempt}/${maxAttempts} for ${method} after network error: ${message}`);
        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`Bitrix call failed: ${method}`);
}

export async function findSmartProcessEntityTypeId(): Promise<number> {
  try {
    const result = await callBitrix('crm.type.list', {});
    const types = result?.types || [];
    const found = types.find((t: { title?: string; entityTypeId?: number }) => {
      const title = (t.title || '').toLowerCase();
      return title.includes('удостоверения и сертификаты') || title.includes('сертификаты');
    });
    if (found) return found.entityTypeId;
    return SMART_PROCESS_ENTITY_TYPE_ID;
  } catch {
    return SMART_PROCESS_ENTITY_TYPE_ID;
  }
}

export async function fetchUserFieldEnumValues(fieldName: string, entityId?: string): Promise<string[]> {
  const tryFetch = async (f: Record<string, string>) => {
    try {
      const result = await callBitrix('crm.userfield.list', {
        order: { SORT: 'ASC' },
        filter: f,
      });
      const fields = Array.isArray(result) ? result : (result?.result || result?.fields || []);
      for (const field of fields) {
        const items = field.LIST || field.list || field.ENUM || field.enum || [];
        if (items.length > 0) {
          return items
            .map((item: { VALUE?: string; value?: string; DISPLAY_VALUE?: string }) =>
              item.VALUE || item.value || item.DISPLAY_VALUE || '')
            .filter(Boolean) as string[];
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const entitiesToTry = [
    ...(entityId ? [entityId] : []),
    'CRM_SPA_12_1056',
    'CRM_1056',
    'CRM_12',
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  for (const eid of entitiesToTry) {
    const result = await tryFetch({ FIELD_NAME: fieldName, ENTITY_ID: eid });
    if (result && result.length > 0) return result;
  }

  const withoutEntity = await tryFetch({ FIELD_NAME: fieldName });
  if (withoutEntity && withoutEntity.length > 0) return withoutEntity;

  return [];
}

function extractEnumFromField(fieldDef: Record<string, unknown>): string[] {
  const tryArr = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item: Record<string, unknown>) =>
        String(item.VALUE || item.value || item.DISPLAY_VALUE || item.label || ''))
      .filter(v => v && v !== 'undefined' && v !== 'null');
  };

  const settings = fieldDef.settings as Record<string, unknown> | undefined;
  const sources = [
    fieldDef.LIST,
    fieldDef.list,
    fieldDef.items,
    fieldDef.ENUM,
    settings?.LIST,
    settings?.list,
    settings?.DISPLAY_VALUES,
  ];

  for (const src of sources) {
    const vals = tryArr(src);
    if (vals.length > 0) return vals;
  }
  return [];
}

async function resolvePhotoFieldKeys(entityTypeId: number): Promise<string[]> {
  const cached = photoFieldKeyCache.get(entityTypeId);
  if (cached && cached.length > 0) return cached;

  const found = new Set<string>([BITRIX_FIELDS_RAW.PHOTO, PHOTO_FIELD_KEY, ...PHOTO_FIELD_CANDIDATES]);

  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    for (const [key, val] of Object.entries(fields)) {
      if (!val || typeof val !== 'object') continue;
      const f = val as Record<string, unknown>;

      const userType = String(f.userType || f.USER_TYPE || f.type || f.TYPE || '').toLowerCase();
      const title = decodeUnicodeEscapes(String(f.title || f.formLabel || f.LIST_LABEL || '')).toLowerCase();
      const isPhotoByTitle = /(?:\u0444\u043e\u0442\u043e|photo)/i.test(title);
      const isFileType = /file/.test(userType);

      if (!isPhotoByTitle && !isFileType) continue;

      const codes = [
        key,
        String(f.name || ''),
        String(f.fieldName || ''),
        String(f.FIELD_NAME || ''),
        String(f.upperName || ''),
        String(f.UPPER_NAME || ''),
      ]
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .filter(v => /^UF_CRM_/i.test(v) || /^ufcrm/i.test(v));

      for (const code of codes) {
        found.add(code);
        const upper = String(code).toUpperCase();
        const camel = smartUfCamelFromUpper(upper);
        if (camel) found.add(camel);
      }
    }
  } catch {
    // fallback to known keys
  }

  const keys = Array.from(found);
  photoFieldKeyCache.set(entityTypeId, keys);
  return keys;
}

const COMPANY_FIELD_TITLE_ALIASES: Record<string, string[]> = {
  COMPANY_BITRIX_ID: ['id компании', 'id компании в битрикс', 'компания id'],
  COMPANY_NAME: ['название компании', 'компания название'],
  COMPANY_PHONE: ['номер телефона компании', 'телефон компании'],
  COMPANY_EMAIL: ['электронная почта компании', 'email компании', 'e-mail компании'],
  COMPANY_BIN_IIN: ['бин/иин компании', 'бин компании', 'иин компании'],
};

export async function resolveSmartProcessCompanyFieldMap(entityTypeId: number): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};
    const normalizedEntries = Object.entries(fields).map(([key, val]) => {
      const field = (val || {}) as Record<string, unknown>;
      const title = String(field.title || field.formLabel || '').trim().toLowerCase();
      return {
        key,
        upperName: String(field.upperName || '').trim(),
        title,
      };
    });

    for (const [alias, names] of Object.entries(COMPANY_FIELD_TITLE_ALIASES)) {
      const match = normalizedEntries.find(entry => names.some(name => entry.title === name));
      if (match) {
        result[alias] = match.upperName || match.key;
      }
    }
  } catch {
    // optional fields are resolved on best-effort basis
  }

  return result;
}

function extractItemIdsFromList(result: unknown): string[] {
  const rows = Array.isArray(result)
    ? result
    : Array.isArray((result as Record<string, unknown>)?.items)
      ? (result as Record<string, unknown>).items as Array<Record<string, unknown>>
      : [];

  return rows
    .map((row: Record<string, unknown>) => String(row.id || row.ID || row.itemId || row.ITEM_ID || ''))
    .filter(Boolean);
}
function findFieldByName(fields: Record<string, unknown>, rawName: string, camelName: string): Record<string, unknown> | null {
  const lowerRaw = rawName.toLowerCase();
  const lowerCamel = camelName.toLowerCase();

  for (const [key, val] of Object.entries(fields)) {
    if (!val || typeof val !== 'object') continue;
    const lowerKey = key.toLowerCase();
    if (lowerKey === lowerRaw || lowerKey === lowerCamel) {
      return val as Record<string, unknown>;
    }
    const fieldObj = val as Record<string, unknown>;
    const upperName = String(fieldObj.upperName || fieldObj.UPPER_NAME || fieldObj.fieldName || fieldObj.FIELD_NAME || '').toUpperCase();
    if (upperName === rawName.toUpperCase()) {
      return fieldObj;
    }
  }
  return null;
}

export async function fetchCoursesFromFields(entityTypeId: number): Promise<string[]> {
  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.COURSE_NAME, BITRIX_FIELDS.COURSE_NAME);
    if (fieldDef) {
      const vals = extractEnumFromField(fieldDef);
      if (vals.length > 0) return vals.sort();
    }

    const values = await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.COURSE_NAME, `CRM_SPA_12_${entityTypeId}`);
    if (values.length > 0) return values;

    return [];
  } catch {
    return [];
  }
}

export async function fetchCoursesViaTypeFields(entityTypeId: number): Promise<string[]> {
  try {
    const raw = await callBitrix('crm.type.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.COURSE_NAME, BITRIX_FIELDS.COURSE_NAME);
    if (fieldDef) {
      const vals = extractEnumFromField(fieldDef);
      if (vals.length > 0) return vals.sort();
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchCategoryFromFields(entityTypeId: number): Promise<string[]> {
  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.CATEGORY, BITRIX_FIELDS.CATEGORY);
    if (fieldDef) {
      const vals = extractEnumFromField(fieldDef);
      if (vals.length > 0) return vals;
    }

    const values = await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.CATEGORY, `CRM_SPA_12_${entityTypeId}`);
    if (values.length > 0) return values;

    return ['ИТР', 'Обычный'];
  } catch {
    return ['ИТР', 'Обычный'];
  }
}

export async function fetchCategoryValues(): Promise<string[]> {
  try {
    const entityTypeId = await findSmartProcessEntityTypeId();
    return await fetchCategoryFromFields(entityTypeId);
  } catch {
    return ['ИТР', 'Обычный'];
  }
}

export async function fetchCoursesList(): Promise<string[]> {
  try {
    const entityTypeId = await findSmartProcessEntityTypeId();

    const fromItemFields = await fetchCoursesFromFields(entityTypeId);
    if (fromItemFields.length > 0) return fromItemFields;

    const fromTypeFields = await fetchCoursesViaTypeFields(entityTypeId);
    if (fromTypeFields.length > 0) return fromTypeFields;

    const fromUserFields = await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.COURSE_NAME, `CRM_SPA_12_${entityTypeId}`);
    if (fromUserFields.length > 0) return fromUserFields;

    return [];
  } catch {
    return [];
  }
}

export async function fetchCategoryList(): Promise<string[]> {
  return fetchCategoryValues();
}


async function resolveCompanyBinFieldCodes(): Promise<string[]> {
  const result = new Set<string>(COMPANY_BIN_FIELD_CANDIDATES);

  try {
    const raw = await callBitrix('crm.company.fields', {});
    const fields = (raw?.fields || raw || {}) as Record<string, unknown>;

    for (const [key, val] of Object.entries(fields)) {
      const f = (val || {}) as Record<string, unknown>;
      const titleRaw = String(f.title || f.formLabel || f.LIST_LABEL || '');
      const title = decodeUnicodeEscapes(titleRaw).toLowerCase();
      const code = String(f.name || f.fieldName || f.FIELD_NAME || key || '').toUpperCase();

      const byCode = /\bBIN\b|\bIIN\b/.test(code);
      const byTitle = /(?:\u0431\u0438\u043d|\u0438\u0438\u043d|bin|iin)/i.test(title);

      if ((byCode || byTitle) && code.startsWith('UF_CRM_')) {
        result.add(code);
        const camel = companyUfCamelFromUpper(code);
        if (camel) result.add(camel);
      }
    }
  } catch {
    // best effort
  }

  try {
    const rawUf = await callBitrix('crm.company.userfield.list', {
      order: { SORT: 'ASC' },
      filter: {},
    });
    const list = Array.isArray(rawUf) ? rawUf : (rawUf?.result || []);

    for (const uf of list as Array<Record<string, unknown>>) {
      const code = String(uf.FIELD_NAME || uf.fieldName || '').toUpperCase();
      const titleRaw = String(uf.LIST_COLUMN_LABEL || uf.EDIT_FORM_LABEL || uf.FIELD_NAME || '');
      const title = decodeUnicodeEscapes(titleRaw).toLowerCase();
      if (!code.startsWith('UF_CRM_')) continue;

      const byCode = /\bBIN\b|\bIIN\b/.test(code);
      const byTitle = /(?:\u0431\u0438\u043d|\u0438\u0438\u043d|bin|iin)/i.test(title);
      if (byCode || byTitle) {
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

async function fillCompanyBinWithRetries(params: {
  companyId: string;
  binIin: string;
  fieldCodes: string[];
}): Promise<void> {
  const binValue = String(params.binIin || '').trim();
  if (!binValue) return;

  const allCodes = Array.from(new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...params.fieldCodes]));
  const mergedFields = buildCompanyBinFields(binValue, allCodes);

  await callBitrix('crm.company.update', {
    id: params.companyId,
    fields: mergedFields,
  });

  for (let i = 0; i < 6; i++) {
    if (await verifyCompanyBinFilled(params.companyId, binValue, allCodes)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const digitOnly = String(binValue).replace(/\D/g, '');
  const numericValue = Number.isFinite(Number(digitOnly)) ? Number(digitOnly) : null;

  for (const code of allCodes) {
    const perCodeFields = buildCompanyBinFields(binValue, [code]);

    try {
      await callBitrix('crm.company.update', { id: params.companyId, fields: perCodeFields });
    } catch {
      // continue
    }

    if (digitOnly && digitOnly !== binValue) {
      const digitsFields = buildCompanyBinFields(digitOnly, [code]);
      try {
        await callBitrix('crm.company.update', { id: params.companyId, fields: digitsFields });
      } catch {
        // continue
      }
    }

    if (numericValue !== null) {
      const asNumber: Record<string, unknown> = {};
      for (const k of Object.keys(perCodeFields)) asNumber[k] = numericValue;
      try {
        await callBitrix('crm.company.update', { id: params.companyId, fields: asNumber });
      } catch {
        // continue
      }
    }

    for (let i = 0; i < 4; i++) {
      if (await verifyCompanyBinFilled(params.companyId, binValue, allCodes)) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  // Do not block full sync if Bitrix does not return UF field back in read methods.
}
export async function createCompany(companyData: {
  name: string;
  phone: string;
  email: string;
  bin_iin: string;
}): Promise<string> {
  const dynamicBinFields = await resolveCompanyBinFieldCodes();
  const allBinFields = Array.from(new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...dynamicBinFields]));

  const existingCompanyId = await findExistingCompanyIdByBin({
    binIin: companyData.bin_iin,
    companyName: companyData.name,
    fieldCodes: allBinFields,
  });

  if (existingCompanyId) {
    await updateCompany(existingCompanyId, companyData);
    return existingCompanyId;
  }

  const fields: Record<string, unknown> = {
    TITLE: companyData.name,
    PHONE: [{ VALUE: companyData.phone, VALUE_TYPE: 'WORK' }],
    EMAIL: companyData.email ? [{ VALUE: companyData.email, VALUE_TYPE: 'WORK' }] : [],
    INDUSTRY: '',
    ...buildCompanyBinFields(companyData.bin_iin, allBinFields),
  };

  const result = await callBitrix('crm.company.add', { fields });
  const companyId = String(result);

  await fillCompanyBinWithRetries({
    companyId,
    binIin: companyData.bin_iin,
    fieldCodes: allBinFields,
  });

  return companyId;
}
export async function updateCompany(bitrixCompanyId: string, companyData: {
  name: string;
  phone: string;
  email: string;
  bin_iin: string;
}): Promise<string> {
  const dynamicBinFields = await resolveCompanyBinFieldCodes();
  const allBinFields = Array.from(new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...dynamicBinFields]));

  let targetCompanyId = String(bitrixCompanyId || '').trim();
  const matchedByBin = await findExistingCompanyIdByBin({
    binIin: companyData.bin_iin,
    companyName: companyData.name,
    fieldCodes: allBinFields,
  });
  if (matchedByBin) targetCompanyId = matchedByBin;

  const fields: Record<string, unknown> = {
    TITLE: companyData.name,
    PHONE: [{ VALUE: companyData.phone, VALUE_TYPE: 'WORK' }],
    EMAIL: companyData.email ? [{ VALUE: companyData.email, VALUE_TYPE: 'WORK' }] : [],
    INDUSTRY: '',
    ...buildCompanyBinFields(companyData.bin_iin, allBinFields),
  };

  await callBitrix('crm.company.update', {
    id: targetCompanyId,
    fields,
  });

  await fillCompanyBinWithRetries({
    companyId: targetCompanyId,
    binIin: companyData.bin_iin,
    fieldCodes: allBinFields,
  });

  return targetCompanyId;
}

async function findExistingCompanyIdByBin(params: {
  binIin: string;
  companyName?: string;
  fieldCodes: string[];
}): Promise<string | null> {
  const binDigits = normalizeDigits(params.binIin);
  if (!binDigits) return null;

  const fieldCodes = Array.from(new Set(params.fieldCodes.filter(Boolean)));
  const searchValues = Array.from(new Set<string>([
    String(params.binIin || '').trim(),
    binDigits,
    binDigits.replace(/^0+/, ''),
  ].filter(Boolean)));

  const candidates = new Map<string, Record<string, unknown>>();
  const collect = (row: Record<string, unknown>) => {
    const id = normalizePlain(row.ID || row.id);
    if (!id) return;
    candidates.set(id, row);
  };

  for (const code of fieldCodes) {
    for (const value of searchValues) {
      try {
        const raw = await callBitrix('crm.company.list', {
          filter: { [code]: value },
          order: { ID: 'ASC' },
          select: ['ID', 'TITLE', 'UF_*'],
        });
        const rows = Array.isArray(raw)
          ? raw as Array<Record<string, unknown>>
          : (Array.isArray(raw?.items) ? raw.items as Array<Record<string, unknown>> : []);
        for (const row of rows) collect(row);
      } catch {
        // try next field/value pair
      }
    }
  }

  if (candidates.size === 0) {
    try {
      const allCompanies = await listAllBitrixCompanies();
      for (const row of allCompanies) {
        if (rowHasBinDigits(row, binDigits, fieldCodes)) collect(row);
      }
    } catch {
      // best effort
    }
  }

  if (candidates.size === 0) return null;

  const companyNameNorm = normalizePlain(params.companyName).toLowerCase();
  const rows = Array.from(candidates.values()).filter(row => rowHasBinDigits(row, binDigits, fieldCodes));
  if (rows.length === 0) return null;

  rows.sort((a, b) => {
    const aTitle = normalizePlain(a.TITLE || a.title).toLowerCase();
    const bTitle = normalizePlain(b.TITLE || b.title).toLowerCase();

    const aExact = Number(companyNameNorm !== '' && aTitle === companyNameNorm);
    const bExact = Number(companyNameNorm !== '' && bTitle === companyNameNorm);
    if (aExact !== bExact) return bExact - aExact;

    const aContains = Number(companyNameNorm !== '' && aTitle.includes(companyNameNorm));
    const bContains = Number(companyNameNorm !== '' && bTitle.includes(companyNameNorm));
    if (aContains !== bContains) return bContains - aContains;

    const aId = Number(normalizePlain(a.ID || a.id) || '0');
    const bId = Number(normalizePlain(b.ID || b.id) || '0');
    return aId - bId;
  });

  const best = rows[0];
  return normalizePlain(best.ID || best.id) || null;
}

function rowHasBinDigits(row: Record<string, unknown>, expectedDigits: string, fieldCodes: string[]): boolean {
  const expectedNoZero = expectedDigits.replace(/^0+/, '');
  const keys = new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...fieldCodes]);
  for (const k of Array.from(keys)) {
    const upper = String(k).toUpperCase();
    if (upper.startsWith('UF_CRM_')) {
      keys.add(upper);
      keys.add(upper.toLowerCase());
      const camel = companyUfCamelFromUpper(upper);
      if (camel) keys.add(camel);
    }
  }

  const extractValues = (value: unknown): string[] => {
    if (value == null) return [];
    if (typeof value === 'string' || typeof value === 'number') return [String(value)];
    if (Array.isArray(value)) return value.flatMap(v => extractValues(v));
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(v => extractValues(v));
    return [];
  };

  for (const key of keys) {
    for (const raw of extractValues(row[key])) {
      const digits = String(raw || '').replace(/\D/g, '');
      if (!digits) continue;
      const noZero = digits.replace(/^0+/, '');
      if (digits === expectedDigits || noZero === expectedNoZero) return true;
    }
  }

  return false;
}
async function verifyCompanyBinFilled(bitrixCompanyId: string, expected: string, fieldCodes: string[] = []): Promise<boolean> {
  const expectedNorm = String(expected || '').replace(/\D/g, '');
  if (!expectedNorm) return true;

  const keys = new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...fieldCodes]);
  for (const k of Array.from(keys)) {
    const upper = String(k).toUpperCase();
    if (upper.startsWith('UF_CRM_')) {
      keys.add(upper);
      const camel = companyUfCamelFromUpper(upper);
      if (camel) keys.add(camel);
    }
  }

  const expectedNoZero = expectedNorm.replace(/^0+/, '');

  const extractValues = (value: unknown): string[] => {
    if (value == null) return [];
    if (typeof value === 'string' || typeof value === 'number') return [String(value)];
    if (Array.isArray(value)) return value.flatMap(v => extractValues(v));
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return Object.values(obj).flatMap(v => extractValues(v));
    }
    return [];
  };

  const matchesExpected = (data: Record<string, unknown>): boolean => {
    for (const key of keys) {
      const rawValues = extractValues(data[key]);
      for (const raw of rawValues) {
        const str = String(raw || '').trim();
        if (!str) continue;

        const norm = str.replace(/\D/g, '');
        if (!norm) return true;

        const normNoZero = norm.replace(/^0+/, '');
        if (norm === expectedNorm || normNoZero === expectedNoZero) return true;
      }
    }
    return false;
  };

  try {
    const select = ['ID', 'TITLE', 'UF_*', ...Array.from(keys)];
    const raw = await callBitrix('crm.company.get', { id: bitrixCompanyId, select });
    const data = (raw || {}) as Record<string, unknown>;
    if (matchesExpected(data)) return true;
  } catch {
    // try list fallback
  }

  try {
    const listRaw = await callBitrix('crm.company.list', {
      filter: { ID: bitrixCompanyId },
      select: ['ID', 'TITLE', 'UF_*', ...Array.from(keys)],
    });
    const row = Array.isArray(listRaw) ? listRaw[0] : Array.isArray(listRaw?.items) ? listRaw.items[0] : null;
    if (row && typeof row === 'object' && matchesExpected(row as Record<string, unknown>)) return true;
  } catch {
    // best effort
  }

  return false;
}
export async function createDeal(dealData: {
  title: string;
  companyId: string;
  city?: string;
  paymentOrderUrl?: string;
  paymentOrderName?: string;
  paymentIsPaid?: boolean;
}): Promise<string> {
  const fields: Record<string, unknown> = {
    TITLE: dealData.title,
    COMPANY_ID: dealData.companyId,
    STAGE_ID: 'NEW',
  };
  if (dealData.city) {
    fields['UF_CRM_1772560175'] = dealData.city;
    fields['UF_CRM_CITY'] = dealData.city;
  }
  const paymentFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FIELD || '').trim();
  if (paymentFieldCode && dealData.paymentOrderUrl) {
    fields[paymentFieldCode] = dealData.paymentOrderUrl;
  }
  const paymentStatusFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_STATUS_FIELD || '').trim();
  if (paymentStatusFieldCode && typeof dealData.paymentIsPaid === 'boolean') {
    fields[paymentStatusFieldCode] = dealData.paymentIsPaid ? 'Y' : 'N';
  }

  const result = await callBitrix('crm.deal.add', { fields });
  const dealId = String(result);

  const paymentFileFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FILE_FIELD || '').trim();
  if (paymentFileFieldCode && dealData.paymentOrderUrl) {
    await attachPaymentFileToDeal({
      bitrixDealId: dealId,
      paymentFieldCode: paymentFileFieldCode,
      paymentOrderUrl: dealData.paymentOrderUrl,
      paymentOrderName: dealData.paymentOrderName || '',
    });
  }

  return dealId;
}

export async function updateDeal(bitrixDealId: string, dealData: {
  title: string;
  companyId: string;
  city?: string;
  paymentOrderUrl?: string;
  paymentOrderName?: string;
  paymentIsPaid?: boolean;
}): Promise<void> {
  const fields: Record<string, unknown> = {
    TITLE: dealData.title,
    COMPANY_ID: dealData.companyId,
  };
  if (dealData.city) {
    fields['UF_CRM_1772560175'] = dealData.city;
    fields['UF_CRM_CITY'] = dealData.city;
  }
  const paymentFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FIELD || '').trim();
  if (paymentFieldCode && dealData.paymentOrderUrl) {
    fields[paymentFieldCode] = dealData.paymentOrderUrl;
  }
  const paymentStatusFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_STATUS_FIELD || '').trim();
  if (paymentStatusFieldCode && typeof dealData.paymentIsPaid === 'boolean') {
    fields[paymentStatusFieldCode] = dealData.paymentIsPaid ? 'Y' : 'N';
  }
  await callBitrix('crm.deal.update', { id: bitrixDealId, fields });

  const paymentFileFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FILE_FIELD || '').trim();
  if (paymentFileFieldCode && dealData.paymentOrderUrl) {
    await attachPaymentFileToDeal({
      bitrixDealId,
      paymentFieldCode: paymentFileFieldCode,
      paymentOrderUrl: dealData.paymentOrderUrl,
      paymentOrderName: dealData.paymentOrderName || '',
    });
  }
}

async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode JPEG'));
      },
      'image/jpeg',
      quality,
    );
  });
}

async function blobToDataUri(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image as base64'));
    reader.readAsDataURL(blob);
  });
}

function sanitizeFileName(name: string): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/[\\/:*?"<>|]+/g, '_');
}

function extensionFromContentType(contentType: string): string {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('pdf')) return 'pdf';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('excel') || ct.includes('spreadsheetml') || ct.includes('sheet')) return 'xlsx';
  if (ct.includes('csv')) return 'csv';
  return '';
}

function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const fromPath = decodeURIComponent(u.pathname.split('/').pop() || '').trim();
    return sanitizeFileName(fromPath);
  } catch {
    return '';
  }
}

async function preparePaymentFileForBitrix(params: {
  paymentOrderUrl: string;
  paymentOrderName?: string;
}): Promise<{ fileName: string; base64: string }> {
  const response = await fetch(params.paymentOrderUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch payment file: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const dataUri = await blobToDataUri(blob);
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] || '' : dataUri;

  let fileName = sanitizeFileName(params.paymentOrderName || '');
  if (!fileName) fileName = fileNameFromUrl(params.paymentOrderUrl);
  if (!fileName) {
    const ext = extensionFromContentType(response.headers.get('content-type') || '');
    fileName = `payment_order${ext ? `.${ext}` : ''}`;
  }
  if (!/\.[a-z0-9]{2,6}$/i.test(fileName)) {
    const ext = extensionFromContentType(response.headers.get('content-type') || '');
    if (ext) fileName = `${fileName}.${ext}`;
  }

  if (!base64) {
    throw new Error('Failed to encode payment file as base64');
  }

  return { fileName, base64 };
}

async function attachPaymentFileToDeal(params: {
  bitrixDealId: string;
  paymentFieldCode: string;
  paymentOrderUrl: string;
  paymentOrderName?: string;
}): Promise<void> {
  const prepared = await preparePaymentFileForBitrix({
    paymentOrderUrl: params.paymentOrderUrl,
    paymentOrderName: params.paymentOrderName,
  });

  const fileData: [string, string] = [prepared.fileName, prepared.base64];
  const beforeSignature = await readDealFileFieldSignature(params.bitrixDealId, params.paymentFieldCode);
  const variants: unknown[] = [
    fileData,
    [fileData],
    { fileData },
    [{ fileData }],
    { n0: fileData },
    { n0: { fileData } },
    [{ id: '', fileData }],
  ];

  const errors: string[] = [];
  for (const variant of variants) {
    try {
      await callBitrix('crm.deal.update', {
        id: params.bitrixDealId,
        fields: {
          [params.paymentFieldCode]: variant,
        },
      });

      const attached = await verifyDealFileAttached({
        bitrixDealId: params.bitrixDealId,
        paymentFieldCode: params.paymentFieldCode,
        expectedFileName: prepared.fileName,
        beforeSignature,
      });

      if (attached) return;
      errors.push(`accepted but not persisted: ${safeJson(variant)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || 'unknown error');
      errors.push(`${safeJson(variant)} -> ${msg}`);
    }
  }

  throw new Error(`Не удалось прикрепить платежное поручение в сделку Bitrix (поле ${params.paymentFieldCode}): ${errors.join(' | ')}`);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function dealFieldKeyVariants(code: string): string[] {
  const base = String(code || '').trim();
  if (!base) return [];

  const variants = new Set<string>([base]);
  const upper = base.toUpperCase();
  variants.add(upper);
  variants.add(base.toLowerCase());

  const camel = ufCamelFromUpper(upper);
  if (camel) variants.add(camel);

  return Array.from(variants);
}

function fileFieldSignature(value: unknown): string {
  if (value == null) return '';

  if (Array.isArray(value)) {
    return value.map(fileFieldSignature).filter(Boolean).join('|');
  }

  if (typeof value === 'object') {
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
      .map(v => String(v || '').trim())
      .filter(Boolean);

    if (atoms.length > 0) return atoms.join('|');

    return Object.keys(obj)
      .sort()
      .map(k => `${k}:${fileFieldSignature(obj[k])}`)
      .join('|');
  }

  return String(value || '').trim();
}

async function fetchDealFieldValue(bitrixDealId: string, paymentFieldCode: string): Promise<unknown> {
  const raw = await callBitrix('crm.deal.get', { id: bitrixDealId });
  const deal = (raw || {}) as Record<string, unknown>;

  for (const key of dealFieldKeyVariants(paymentFieldCode)) {
    if (Object.prototype.hasOwnProperty.call(deal, key)) return deal[key];
  }

  return undefined;
}

async function readDealFileFieldSignature(bitrixDealId: string, paymentFieldCode: string): Promise<string> {
  try {
    const value = await fetchDealFieldValue(bitrixDealId, paymentFieldCode);
    return fileFieldSignature(value);
  } catch {
    return '';
  }
}

async function verifyDealFileAttached(params: {
  bitrixDealId: string;
  paymentFieldCode: string;
  expectedFileName: string;
  beforeSignature?: string;
}): Promise<boolean> {
  const expectedFileNameNorm = String(params.expectedFileName || '').trim().toLowerCase();
  const tries = 3;

  for (let i = 0; i < tries; i++) {
    try {
      const value = await fetchDealFieldValue(params.bitrixDealId, params.paymentFieldCode);
      if (hasPersistedFileValue(value)) {
        const signature = fileFieldSignature(value);
        if (expectedFileNameNorm && signature.toLowerCase().includes(expectedFileNameNorm)) return true;

        const before = String(params.beforeSignature || '').trim();
        if (before && signature && signature !== before) return true;
        if (!before && signature) return true;
      }
    } catch {
      // best effort probe
    }

    if (i < tries - 1) {
      await new Promise(resolve => setTimeout(resolve, 220));
    }
  }

  return false;
}

async function preparePhotoForBitrix(photoUrl: string, participantName: string): Promise<{ fileName: string; dataUri: string; base64: string; }> {
  let response: Response | null = null;
  let fetchError: unknown = null;

  for (const url of buildCloudinaryJpgCandidates(photoUrl)) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        response = r;
        break;
      } catch (e) {
        fetchError = e;
        await new Promise(resolve => setTimeout(resolve, 280 * (i + 1)));
      }
    }
    if (response) break;
  }

  if (!response) {
    const msg = fetchError instanceof Error ? fetchError.message : String(fetchError || 'Failed to fetch');
    throw new Error('Failed to fetch: ' + msg);
  }

  const sourceBlob = await response.blob();
  const img = await loadImageFromBlob(sourceBlob);

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context is not available');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [0.9, 0.82, 0.74, 0.66];
  const maxBytes = 1_500_000;
  let jpegBlob: Blob | null = null;

  for (const quality of qualities) {
    const candidate = await canvasToJpegBlob(canvas, quality);
    jpegBlob = candidate;
    if (candidate.size <= maxBytes) break;
  }

  if (!jpegBlob) throw new Error('Failed to convert photo to JPG');

  const dataUri = await blobToDataUri(jpegBlob);
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

  const baseName = String(participantName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.+$/, '');
  const safeBase = baseName.length > 0 ? baseName : `Фото ${Date.now().toString(36)}`;
  const fileName = `${safeBase}.jpg`;

  return { fileName, dataUri, base64 };
}

function buildCloudinaryJpgCandidates(photoUrl: string): string[] {
  const base = String(photoUrl || '').trim();
  if (!base) return [];

  const out = new Set<string>([base]);

  if (/res\.cloudinary\.com/i.test(base) && /\/upload\//i.test(base)) {
    out.add(base.replace('/upload/', '/upload/f_jpg,q_auto:good/'));
    out.add(base.replace('/upload/', '/upload/f_jpg/'));
    out.add(base.replace('/upload/', '/upload/f_auto,q_auto/'));
  }

  return Array.from(out);
}

function hasPersistedFileValue(value: unknown): boolean {
  if (value == null) return false;

  if (typeof value === 'number') return value > 0;

  if (typeof value === 'string') {
    const v = value.trim();
    if (!v) return false;
    if (/^\d+$/.test(v)) return Number(v) > 0;
    return !/^(null|undefined|0)$/i.test(v);
  }

  if (Array.isArray(value)) {
    return value.some(v => hasPersistedFileValue(v));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return [
      obj.id,
      obj.ID,
      obj.fileId,
      obj.FILE_ID,
      obj.value,
      obj.VALUE,
      obj.url,
      obj.URL,
      obj.src,
      obj.SRC,
      obj.downloadUrl,
      obj.DOWNLOAD_URL,
    ].some(v => hasPersistedFileValue(v));
  }

  return false;
}

async function verifyPhotoAttached(params: {
  entityTypeId: number;
  itemId: string;
  fieldKeys: string[];
}): Promise<boolean> {
  const keys = Array.from(new Set(params.fieldKeys.filter(Boolean)));
  const tries = 2;

  for (let i = 0; i < tries; i++) {
    try {
      const raw = await callBitrix('crm.item.get', {
        entityTypeId: params.entityTypeId,
        id: params.itemId,
      });
      const item = ((raw as Record<string, unknown>)?.item || raw || {}) as Record<string, unknown>;

      for (const key of keys) {
        if (hasPersistedFileValue(item[key])) return true;
      }
    } catch {
      // best effort probe
    }

    if (i < tries - 1) {
      await new Promise(resolve => setTimeout(resolve, 220));
    }
  }

  return false;
}

export async function attachPhotoToSmartItem(params: {
  entityTypeId: number;
  itemId: string;
  photoUrl: string;
  participantName: string;
}): Promise<void> {
  const photoFieldKeys = await resolvePhotoFieldKeys(params.entityTypeId);

  let prepared: { fileName: string; dataUri: string; base64: string; } | null = null;
  let prepareError: unknown = null;
  try {
    prepared = await preparePhotoForBitrix(params.photoUrl, params.participantName);
  } catch (e) {
    prepareError = e;
  }

  let lastError: unknown = prepareError;

  for (const fieldKeyRaw of photoFieldKeys) {
    const variants = new Set<string>([fieldKeyRaw]);
    const upper = String(fieldKeyRaw).toUpperCase();
    variants.add(upper);
    const camel = smartUfCamelFromUpper(upper);
    if (camel) variants.add(camel);

    for (const fieldKey of variants) {
      const payloads: Array<Record<string, unknown>> = [];

      if (prepared) {
        payloads.push(
          // Same primary format as working GAS flow: UF_FILE_FIELD: [fileName, base64]
          { [fieldKey]: [prepared.fileName, prepared.base64] },
          { [fieldKey]: { fileData: [prepared.fileName, prepared.base64] } },
          { [fieldKey]: { id: '', fileData: [prepared.fileName, prepared.base64] } },
        );
      }

      for (const photoFieldPayload of payloads) {
        try {
          await callBitrix('crm.item.update', {
            entityTypeId: params.entityTypeId,
            id: params.itemId,
            fields: photoFieldPayload,
          });

          const probeKeys = [fieldKey];
          const upperProbe = String(fieldKey).toUpperCase();
          if (upperProbe !== fieldKey) probeKeys.push(upperProbe);
          const camelProbe = smartUfCamelFromUpper(upperProbe);
          if (camelProbe) probeKeys.push(camelProbe);

          if (await verifyPhotoAttached({
            entityTypeId: params.entityTypeId,
            itemId: params.itemId,
            fieldKeys: probeKeys,
          })) {
            return;
          }

          lastError = new Error(`Bitrix accepted update but photo field stayed empty (${fieldKey})`);
        } catch (e) {
          lastError = e;
        }
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError || 'photo attachment failed');
  throw new Error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0444\u043e\u0442\u043e \u0432 \u043f\u043e\u043b\u0435 "\u0424\u043e\u0442\u043e" \u0441\u043c\u0430\u0440\u0442-\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0430: ' + msg);
}
export async function createSmartProcessItem(params: {
  entityTypeId: number;
  dealId: string;
  companyId: string;
  fields: Record<string, unknown>;
}): Promise<string> {
  const variants: Array<Record<string, unknown>> = [
    { parentId2: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
    { PARENT_ID_2: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
    { parentId1: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
    { PARENT_ID_1: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
    { companyId: params.companyId, COMPANY_ID: params.companyId },
  ];

  let lastError: unknown = null;
  for (const relationFields of variants) {
    try {
      const result = await callBitrix('crm.item.add', {
        entityTypeId: params.entityTypeId,
        fields: {
          ...params.fields,
          ...relationFields,
        },
      });
      return String(result?.item?.id || result);
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error('Failed to create smart-process item');
}


export async function resolveSmartProcessEnumId(params: {
  entityTypeId: number;
  fieldRawName: string;
  fieldCamelName: string;
  value: string;
}): Promise<string | undefined> {
  const normalizedValue = (params.value || '').trim().toLowerCase();
  if (!normalizedValue) return undefined;

  const cacheKey = `${params.entityTypeId}:${params.fieldRawName}`;
  let options = enumFieldOptionsCache.get(cacheKey);

  if (!options) {
    options = new Map<string, string>();
    try {
      const raw = await callBitrix('crm.item.fields', { entityTypeId: params.entityTypeId });
      const fields: Record<string, unknown> = raw?.fields || raw || {};
      const fieldDef = findFieldByName(fields, params.fieldRawName, params.fieldCamelName);
      const items = Array.isArray((fieldDef as Record<string, unknown>)?.items)
        ? ((fieldDef as Record<string, unknown>).items as Array<Record<string, unknown>>)
        : [];

      for (const item of items) {
        const id = String(item.ID || item.id || '').trim();
        const value = String(item.VALUE || item.value || '').trim().toLowerCase();
        if (id && value) options.set(value, id);
      }
    } catch {
      // best effort
    }
    enumFieldOptionsCache.set(cacheKey, options);
  }

  return options.get(normalizedValue);
}
export async function updateSmartProcessItem(params: {
  entityTypeId: number;
  itemId: string;
  fields: Record<string, unknown>;
}): Promise<void> {
  await callBitrix('crm.item.update', {
    entityTypeId: params.entityTypeId,
    id: params.itemId,
    fields: params.fields,
  });
}

export async function deleteSmartProcessItem(params: {
  entityTypeId: number;
  itemId: string;
}): Promise<void> {
  await callBitrix('crm.item.delete', {
    entityTypeId: params.entityTypeId,
    id: params.itemId,
  });
}

export async function listSmartProcessItemIdsForDeal(params: {
  entityTypeId: number;
  dealId: string;
  companyId?: string;
}): Promise<string[]> {
  const filterVariants: Array<Record<string, unknown>> = [
    { parentId2: params.dealId },
    { PARENT_ID_2: params.dealId },
    { parentId1: params.dealId },
    { PARENT_ID_1: params.dealId },
    ...(params.companyId ? [{ companyId: params.companyId }, { COMPANY_ID: params.companyId }] : []),
  ];

  for (const filter of filterVariants) {
    try {
      const result = await callBitrix('crm.item.list', {
        entityTypeId: params.entityTypeId,
        filter,
        select: ['id'],
      });
      const ids = extractItemIdsFromList(result);
      if (ids.length > 0) return ids;
    } catch {
      // try next filter
    }
  }

  return [];
}

export interface CompanyDirectorySyncRow {
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
}

const CONTRACT_ENTITY_TYPE_ID = Number(import.meta.env.VITE_BITRIX_CONTRACT_ENTITY_TYPE_ID || '1060');

function normalizeDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizePlain(value: unknown): string {
  return String(value || '').trim();
}

function normalizeDateValue(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function fieldKeyVariants(code: string): string[] {
  const base = String(code || '').trim();
  if (!base) return [];

  const variants = new Set<string>([base]);
  const upper = base.toUpperCase();
  variants.add(upper);
  variants.add(base.toLowerCase());

  const camel = ufCamelFromUpper(upper);
  if (camel) variants.add(camel);

  return Array.from(variants);
}

function getBitrixFieldValue(item: Record<string, unknown>, code: string): unknown {
  for (const key of fieldKeyVariants(code)) {
    if (Object.prototype.hasOwnProperty.call(item, key)) return item[key];
  }
  return undefined;
}

function firstNonEmptyBitrixFieldValue(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = getBitrixFieldValue(item, key);
    const plain = normalizePlain(value);
    if (plain) return value;
  }
  return undefined;
}

function pickFirstNonEmpty(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = normalizePlain(obj[key]);
    if (val) return val;
  }
  return '';
}

function isContractStatusActive(status: string): boolean {
  const value = status.trim().toLowerCase();
  if (!value) return false;
  return /(действ|актив|active|valid|в работе)/i.test(value);
}

function extractListRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  const wrapped = payload as Record<string, unknown>;
  if (Array.isArray(wrapped?.items)) return wrapped.items as Array<Record<string, unknown>>;
  if (Array.isArray(wrapped?.result)) return wrapped.result as Array<Record<string, unknown>>;
  return [];
}

async function listAllBitrixCompanies(): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const batchSize = 50;
  const maxPages = 120;

  for (let page = 0; page < maxPages; page++) {
    const start = page * batchSize;
    const chunk = await callBitrix('crm.company.list', {
      order: { ID: 'ASC' },
      start,
      select: ['ID', 'TITLE', 'PHONE', 'EMAIL', 'UF_*'],
    });
    const rows = extractListRows(chunk);
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < batchSize) break;
  }
  return out;
}

async function listAllBitrixSmartItems(entityTypeId: number): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const batchSize = 50;
  const maxPages = 120;

  for (let page = 0; page < maxPages; page++) {
    const start = page * batchSize;
    const chunk = await callBitrix('crm.item.list', {
      entityTypeId,
      order: { id: 'ASC' },
      start,
      select: ['id', 'title', 'companyId', 'COMPANY_ID', '*', 'uf*'],
    });
    const rows = extractListRows(chunk);
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < batchSize) break;
  }
  return out;
}

async function resolveContractFieldMap(entityTypeId: number): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    const entries = Object.entries(fields).map(([key, val]) => {
      const field = (val || {}) as Record<string, unknown>;
      const rawTitle = String(field.title || field.formLabel || field.LIST_LABEL || '');
      const upperName = String(field.upperName || field.FIELD_NAME || key || '').trim();
      const keyProbe = `${key} ${upperName}`.toLowerCase();
      const isUserField = /^uf_/i.test(key) || /^uf_/i.test(upperName);
      return {
        key,
        upperName,
        title: decodeUnicodeEscapes(rawTitle).toLowerCase().trim(),
        keyProbe,
        isUserField,
      };
    });

    const findByTitleOrKey = (
      titlePatterns: RegExp[],
      keyPatterns: RegExp[],
      opts?: { preferUserFields?: boolean; disallowSystemFallback?: boolean }
    ): string => {
      const userEntries = entries.filter(e => e.isUserField);
      const allEntries = opts?.preferUserFields
        ? [...userEntries, ...entries.filter(e => !e.isUserField)]
        : entries;
      const source = opts?.disallowSystemFallback ? userEntries : allEntries;

      const byTitle = source.find(entry => titlePatterns.some(p => p.test(entry.title)));
      if (byTitle) return byTitle.upperName || byTitle.key || '';

      const byKey = source.find(entry => keyPatterns.some(p => p.test(entry.keyProbe)));
      if (byKey) return byKey.upperName || byKey.key || '';
      return '';
    };

    map.company = findByTitleOrKey(
      [/компан/, /клиент/, /client/, /company/],
      [/(^|_)company(_id)?($|_)/, /client/]
    );
    map.number = findByTitleOrKey(
      [/номер.*договор/, /^договор\s*№?/, /contract.*number/],
      [/(contract|dogovor).*(number|num|nomer)/, /(number|num|nomer).*(contract|dogovor)/]
    );
    map.contractDate = findByTitleOrKey(
      [/дата.*договор/, /contract.*date/],
      [/(contract|dogovor).*(date|data)/],
      { preferUserFields: true, disallowSystemFallback: true }
    );
    map.startDate = findByTitleOrKey(
      [/дата.*нач/, /действ.*с/, /date.*start/, /start.*date/],
      [/(start|begin|from|date_start|date_begin)/],
      { preferUserFields: true, disallowSystemFallback: true }
    );
    map.endDate = findByTitleOrKey(
      [/дата.*оконч/, /действ.*по/, /date.*end/, /end.*date/],
      [/(end|finish|to|expire|close|date_end|date_close)/],
      { preferUserFields: true, disallowSystemFallback: true }
    );
    map.status = findByTitleOrKey(
      [/^статус$/, /contract.*status/, /состояние/],
      [/(^|_)(status|stage)(_|$)/]
    );

    if (!map.company) map.company = 'companyId';
    if (!map.status) map.status = 'stageId';
  } catch {
    // best effort, caller handles empty map
  }
  return map;
}
function extractPhone(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as Record<string, unknown>;
    return normalizePlain(first?.VALUE || first?.value || first?.VALUE_NUMBER);
  }
  return normalizePlain(value);
}

function extractEmail(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as Record<string, unknown>;
    return normalizePlain(first?.VALUE || first?.value);
  }
  return normalizePlain(value);
}

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

function choosePrimaryContract(contracts: ContractSnapshot[]): ContractSnapshot | null {
  if (contracts.length === 0) return null;

  const sorted = [...contracts].sort((a, b) => {
    const activeCmp = Number(b.isActive) - Number(a.isActive);
    if (activeCmp !== 0) return activeCmp;
    const aDate = a.endDate || a.startDate || a.contractDate || '';
    const bDate = b.endDate || b.startDate || b.contractDate || '';
    return bDate.localeCompare(aDate);
  });
  return sorted[0];
}

export async function fetchCompanyDirectorySnapshotFromBitrix(): Promise<{
  rows: CompanyDirectorySyncRow[];
  companiesCount: number;
  contractsCount: number;
}> {
  const [companiesRaw, contractsRaw, binFieldCodes, contractFieldMap] = await Promise.all([
    listAllBitrixCompanies(),
    listAllBitrixSmartItems(CONTRACT_ENTITY_TYPE_ID),
    resolveCompanyBinFieldCodes(),
    resolveContractFieldMap(CONTRACT_ENTITY_TYPE_ID),
  ]);

  const companyById = new Map<string, CompanyDirectorySyncRow>();
  for (const row of companiesRaw) {
    const bitrixId = normalizePlain(row.ID || row.id);
    if (!bitrixId) continue;

    const binValue = pickFirstNonEmpty(row, binFieldCodes);
    const binDigits = normalizeDigits(binValue);

    companyById.set(bitrixId, {
      bitrix_company_id: bitrixId,
      name: normalizePlain(row.TITLE || row.title),
      bin_iin: normalizePlain(binValue),
      bin_iin_digits: binDigits,
      phone: extractPhone(row.PHONE || row.phone),
      email: extractEmail(row.EMAIL || row.email),
      city: normalizePlain(row.CITY || row.UF_CRM_CITY || row.UF_CRM_1772560175),
      has_contract: false,
      contract_count: 0,
      contract_bitrix_id: '',
      contract_title: '',
      contract_number: '',
      contract_date: null,
      contract_start: null,
      contract_end: null,
      contract_status: '',
      contract_is_active: false,
    });
  }

  const contractsByCompanyId = new Map<string, ContractSnapshot[]>();
  for (const item of contractsRaw) {
    const contractId = normalizePlain(item.id || item.ID);
    const title = normalizePlain(item.title || item.TITLE);
    const companyId = normalizePlain(
      item.companyId ||
      item.COMPANY_ID ||
      (contractFieldMap.company ? getBitrixFieldValue(item, contractFieldMap.company) : '')
    );
    if (!contractId || !companyId) continue;

    const number = normalizePlain(
      (contractFieldMap.number ? getBitrixFieldValue(item, contractFieldMap.number) : '') ||
      firstNonEmptyBitrixFieldValue(item, ['number', 'contractNumber', 'contract_number']) ||
      title
    );
    // Important: for smart-process contracts we should trust only mapped date fields.
    // Generic fallback keys may resolve to unrelated system fields and produce
    // identical fake date ranges for many companies.
    const contractDate = normalizeDateValue(
      contractFieldMap.contractDate ? getBitrixFieldValue(item, contractFieldMap.contractDate) : null
    );
    const startDate = normalizeDateValue(
      contractFieldMap.startDate ? getBitrixFieldValue(item, contractFieldMap.startDate) : null
    );
    const endDate = normalizeDateValue(
      contractFieldMap.endDate ? getBitrixFieldValue(item, contractFieldMap.endDate) : null
    );
    const status = normalizePlain(
      (contractFieldMap.status ? getBitrixFieldValue(item, contractFieldMap.status) : '') ||
      firstNonEmptyBitrixFieldValue(item, ['status', 'stageId'])
    ) || '';

    const isActiveByDate = Boolean(
      startDate &&
      endDate &&
      startDate <= endDate &&
      startDate <= new Date().toISOString().slice(0, 10) &&
      endDate >= new Date().toISOString().slice(0, 10)
    );
    const isActive = isContractStatusActive(status) || isActiveByDate;

    const contract: ContractSnapshot = {
      id: contractId,
      title,
      number,
      contractDate,
      startDate,
      endDate,
      status,
      isActive,
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

  const rows = Array.from(companyById.values());
  return {
    rows,
    companiesCount: companiesRaw.length,
    contractsCount: contractsRaw.length,
  };
}

export { SMART_PROCESS_ENTITY_TYPE_ID, ENTITY_TYPE_ID, callBitrix };
















