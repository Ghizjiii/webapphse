import { callBitrix } from './client';
import { extractListRows } from './utils';
import { SMART_PROCESS_ENTITY_TYPE_ID } from './config';
import {
  BITRIX_FIELDS_RAW,
  BITRIX_FIELDS,
  COMPANY_FIELD_TITLE_ALIASES,
  findFieldByName,
  extractEnumFromField,
  smartUfCamelFromUpper,
} from './fields';

export interface SmartProcessFieldDescriptor {
  key: string;
  upperName: string;
  title: string;
  type: string;
  isMultiple: boolean;
  items: Array<{ id: string; value: string }>;
}

type SmartProcessFieldCacheHost = typeof globalThis & {
  __smartProcessFieldCache__?: Map<number, Record<string, SmartProcessFieldDescriptor>>;
};

function normalizeFieldLookup(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getSmartProcessFieldCache(): Map<number, Record<string, SmartProcessFieldDescriptor>> {
  const cacheHost = globalThis as SmartProcessFieldCacheHost;
  const cache = cacheHost.__smartProcessFieldCache__ || new Map<number, Record<string, SmartProcessFieldDescriptor>>();
  cacheHost.__smartProcessFieldCache__ = cache;
  return cache;
}

function parseSmartProcessFieldDescriptors(fields: Record<string, unknown>): Record<string, SmartProcessFieldDescriptor> {
  const result: Record<string, SmartProcessFieldDescriptor> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (!value || typeof value !== 'object') continue;
    const field = value as Record<string, unknown>;
    const upperName = String(field.upperName || field.UPPER_NAME || key || '').trim();
    const title = String(field.title || field.formLabel || field.listLabel || '').trim();
    const itemsRaw = Array.isArray(field.items)
      ? (field.items as Array<Record<string, unknown>>)
      : [];

    result[key] = {
      key,
      upperName,
      title,
      type: String(field.type || field.USER_TYPE_ID || '').trim().toLowerCase(),
      isMultiple: Boolean(field.isMultiple || field.MULTIPLE),
      items: itemsRaw
        .map(item => ({
          id: String(item.ID || item.id || '').trim(),
          value: String(item.VALUE || item.value || '').trim(),
        }))
        .filter(item => item.id && item.value),
    };
  }

  return result;
}

function findSmartProcessFieldDescriptor(
  descriptors: Record<string, SmartProcessFieldDescriptor>,
  options: {
    titles?: string[];
    rawCode?: string;
    camelCode?: string;
  },
): SmartProcessFieldDescriptor | undefined {
  const list = Object.values(descriptors);
  const rawCode = normalizeFieldLookup(options.rawCode);
  const camelCode = normalizeFieldLookup(options.camelCode);

  if (rawCode || camelCode) {
    const byCode = list.find(field => {
      const key = normalizeFieldLookup(field.key);
      const upperName = normalizeFieldLookup(field.upperName);
      return key === rawCode || key === camelCode || upperName === rawCode || upperName === camelCode;
    });
    if (byCode) return byCode;
  }

  const titles = (options.titles || []).map(normalizeFieldLookup).filter(Boolean);
  if (titles.length === 0) return undefined;

  const exact = list.find(field => titles.includes(normalizeFieldLookup(field.title)));
  if (exact) return exact;

  return list.find(field => {
    const title = normalizeFieldLookup(field.title);
    return titles.some(expected => title.includes(expected) || expected.includes(title));
  });
}

function buildEnumLookup(descriptor?: SmartProcessFieldDescriptor): Map<string, string> {
  const result = new Map<string, string>();
  if (!descriptor) return result;

  for (const item of descriptor.items) {
    result.set(normalizeFieldLookup(item.value), item.id);
  }

  return result;
}

export async function fetchSmartProcessFieldDescriptors(entityTypeId: number): Promise<Record<string, SmartProcessFieldDescriptor>> {
  const cache = getSmartProcessFieldCache();
  const cached = cache.get(entityTypeId);
  if (cached) return cached;

  const raw = await callBitrix('crm.item.fields', { entityTypeId });
  const fields: Record<string, unknown> = raw?.fields || raw || {};
  const descriptors = parseSmartProcessFieldDescriptors(fields);
  cache.set(entityTypeId, descriptors);
  return descriptors;
}

export async function resolveProtocolSmartProcessFieldMap(entityTypeId: number): Promise<{
  title?: SmartProcessFieldDescriptor;
  number?: SmartProcessFieldDescriptor;
  date?: SmartProcessFieldDescriptor;
  course?: SmartProcessFieldDescriptor;
  file?: SmartProcessFieldDescriptor;
  isPrinted?: SmartProcessFieldDescriptor;
}> {
  const descriptors = await fetchSmartProcessFieldDescriptors(entityTypeId);

  return {
    title: findSmartProcessFieldDescriptor(descriptors, { titles: ['Название'], rawCode: 'TITLE', camelCode: 'title' }),
    number: findSmartProcessFieldDescriptor(descriptors, { titles: ['Номер протокола'] }),
    date: findSmartProcessFieldDescriptor(descriptors, { titles: ['Дата протокола'] }),
    course: findSmartProcessFieldDescriptor(descriptors, { titles: ['Курс'] }),
    file: findSmartProcessFieldDescriptor(descriptors, { titles: ['Файл протокола'] }),
    isPrinted: findSmartProcessFieldDescriptor(descriptors, { titles: ['Распечатан', 'Печатать', 'Печать'] }),
  };
}

export async function findSmartProcessEntityTypeId(): Promise<number> {
  try {
    const result = await callBitrix('crm.type.list', {});
    const types = result?.types || [];
    const found = types.find((t: { title?: string; entityTypeId?: number }) => {
      const title = (t.title || '').toLowerCase();
      return title.includes('удостоверения и сертификаты') || title.includes('удостоверения') || title.includes('сертификаты');
    });
    if (found) return found.entityTypeId;
    return SMART_PROCESS_ENTITY_TYPE_ID;
  } catch {
    return SMART_PROCESS_ENTITY_TYPE_ID;
  }
}

function parseEntityTypeIds(entityId?: string): number[] {
  const result = new Set<number>([SMART_PROCESS_ENTITY_TYPE_ID]);
  const raw = String(entityId || '').trim().toUpperCase();

  const smartMatch = raw.match(/^CRM_SPA_\d+_(\d+)$/);
  if (smartMatch) {
    const value = Number(smartMatch[1]);
    if (Number.isInteger(value) && value > 0) result.add(value);
  }

  const crmMatch = raw.match(/^CRM_(\d+)$/);
  if (crmMatch) {
    const value = Number(crmMatch[1]);
    if (Number.isInteger(value) && value >= 100) result.add(value);
  }

  return Array.from(result);
}

async function fetchEnumValuesFromField(entityTypeId: number, fieldName: string): Promise<string[]> {
  const camelName = smartUfCamelFromUpper(fieldName) || fieldName;
  const methods = ['crm.item.fields', 'crm.type.fields'] as const;

  for (const method of methods) {
    try {
      const raw = await callBitrix(method, { entityTypeId });
      const fields: Record<string, unknown> = raw?.fields || raw || {};
      const fieldDef = findFieldByName(fields, fieldName, camelName);
      if (!fieldDef) continue;

      const values = extractEnumFromField(fieldDef);
      if (values.length > 0) return values;
    } catch {
      // best effort
    }
  }

  return [];
}

export async function fetchUserFieldEnumValues(fieldName: string, entityId?: string): Promise<string[]> {
  const entityTypeIds = parseEntityTypeIds(entityId);

  for (const entityTypeId of entityTypeIds) {
    const values = await fetchEnumValuesFromField(entityTypeId, fieldName);
    if (values.length > 0) return values;
  }

  return [];
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
  aliases?: string[];
  forceRefresh?: boolean;
}): Promise<string | undefined> {
  type EnumCacheHost = typeof globalThis & {
    __enumFieldOptionsCache__?: Map<string, Map<string, string>>;
  };

  const lookupValues = Array.from(new Set([
    String(params.value || '').trim(),
    ...(params.aliases || []).map(value => String(value || '').trim()),
  ]))
    .map(value => value.toLowerCase())
    .filter(Boolean);
  if (lookupValues.length === 0) return undefined;

  const cacheKey = `${params.entityTypeId}:${params.fieldRawName}`;
  const cacheHost = globalThis as EnumCacheHost;
  const cache = cacheHost.__enumFieldOptionsCache__ || new Map<string, Map<string, string>>();
  cacheHost.__enumFieldOptionsCache__ = cache;

  let options = params.forceRefresh ? undefined : cache.get(cacheKey);

  if (!options) {
    options = new Map<string, string>();
    try {
      const descriptors = await fetchSmartProcessFieldDescriptors(params.entityTypeId);
      const descriptor = findSmartProcessFieldDescriptor(descriptors, {
        rawCode: params.fieldRawName,
        camelCode: params.fieldCamelName,
      });

      for (const [value, id] of buildEnumLookup(descriptor)) {
        options.set(value, id);
      }

      if (options.size === 0) {
        const raw = await callBitrix('crm.type.fields', { entityTypeId: params.entityTypeId });
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
      }
    } catch {
      // best effort
    }
    cache.set(cacheKey, options);
  }

  for (const lookupValue of lookupValues) {
    const directMatch = options.get(lookupValue);
    if (directMatch) return directMatch;
  }

  const normalizedEntries = Array.from(options.entries()).map(([label, id]) => ({
    id,
    label,
    compact: label.replace(/[().,\-_/]/g, ' ').replace(/\s+/g, ' ').trim(),
  }));

  for (const lookupValue of lookupValues) {
    const compactLookup = lookupValue.replace(/[().,\-_/]/g, ' ').replace(/\s+/g, ' ').trim();
    const compactMatch = normalizedEntries.find(entry => entry.compact === compactLookup);
    if (compactMatch) return compactMatch.id;
  }

  return undefined;
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

export async function listAllBitrixSmartItems(entityTypeId: number): Promise<Array<Record<string, unknown>>> {
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
