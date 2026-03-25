import { callBitrix } from './client';
import { decodeUnicodeEscapes, normalizePlain } from './utils';
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
export const COMPANY_BIN_FIELD_CANDIDATES = [
  'UF_CRM_BIN_IIN',
  'UF_CRM_1772589149',
  'UF_CRM_1772598092',
  'UF_CRM_1772598149',
];
export const PHOTO_FIELD_CANDIDATES = [
  'UF_CRM_12_1772578817',
  'ufCrm12_1772578817',
];
export const COMPANY_FIELD_TITLE_ALIASES: Record<string, string[]> = {
  COMPANY_BITRIX_ID: ['id компании', 'id компании в битрикс', 'компания id'],
  COMPANY_NAME: ['название компании', 'компания название'],
  COMPANY_PHONE: ['номер телефона компании', 'телефон компании'],
  COMPANY_EMAIL: ['электронная почта компании', 'email компании', 'e-mail компании'],
  COMPANY_BIN_IIN: ['бин/иин компании', 'бин компании', 'иин компании'],
};
export const photoFieldKeyCache = new Map<number, string[]>();
export function ufCamelFromUpper(code: string): string | null {
  const normalized = String(code || '').trim().toUpperCase();
  const smart = normalized.match(/^UF_CRM_(\d+)_(\d+)$/);
  if (smart) return `ufCrm${smart[1]}_${smart[2]}`;
  const company = normalized.match(/^UF_CRM_(\d+)$/);
  if (company) return `ufCrm${company[1]}`;
  return null;
}
export function companyUfCamelFromUpper(code: string): string | null {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^UF_CRM_\d+$/.test(normalized)) return null;
  return ufCamelFromUpper(normalized);
}
export function smartUfCamelFromUpper(code: string): string | null {
  const normalized = String(code || '').trim().toUpperCase();
  if (!/^UF_CRM_\d+_\d+$/.test(normalized)) return null;
  return ufCamelFromUpper(normalized);
}
export function buildCompanyBinFields(binIin: string, fieldCodes: string[]): Record<string, string> {
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
export function extractEnumFromField(fieldDef: Record<string, unknown>): string[] {
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
export async function resolvePhotoFieldKeys(entityTypeId: number): Promise<string[]> {
  const cached = photoFieldKeyCache.get(entityTypeId);
  if (cached && cached.length > 0) return cached;
  const found = new Set<string>([BITRIX_FIELDS_RAW.PHOTO, PHOTO_FIELD_KEY, ...PHOTO_FIELD_CANDIDATES]);
  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};
    for (const [key, val] of Object.entries(fields)) {
      if (!val || typeof val !== 'object') continue;
      const f = val as Record<string, unknown>;
      const title = decodeUnicodeEscapes(String(f.title || f.formLabel || f.LIST_LABEL || '')).toLowerCase();
      const isPhotoByTitle = /(?:\u0444\u043e\u0442\u043e|photo)/i.test(title);
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

      const isKnownPhotoCandidate = codes.some(code => {
        const normalized = String(code || '').trim().toUpperCase();
        if (!normalized) return false;
        if (normalized === BITRIX_FIELDS_RAW.PHOTO.toUpperCase()) return true;
        return PHOTO_FIELD_CANDIDATES.some(candidate => String(candidate).toUpperCase() === normalized);
      });

      // Avoid writing into unrelated "file" fields. We only accept explicit photo
      // candidates or fields whose title/label clearly indicates photo.
      if (!isPhotoByTitle && !isKnownPhotoCandidate) continue;

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
export async function resolveCompanyBinFieldCodes(): Promise<string[]> {
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
export function fieldKeyVariants(code: string): string[] {
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
export function getBitrixFieldValue(item: Record<string, unknown>, code: string): unknown {
  for (const key of fieldKeyVariants(code)) {
    if (Object.prototype.hasOwnProperty.call(item, key)) return item[key];
  }
  return undefined;
}
export function firstNonEmptyBitrixFieldValue(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = getBitrixFieldValue(item, key);
    const plain = normalizePlain(value);
    if (plain) return value;
  }
  return undefined;
}
export function pickFirstNonEmpty(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const val = normalizePlain(obj[key]);
    if (val) return val;
  }
  return '';
}
export function dealFieldKeyVariants(code: string): string[] {
  return fieldKeyVariants(code);
}
export function findFieldByName(fields: Record<string, unknown>, rawName: string, camelName: string): Record<string, unknown> | null {
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
