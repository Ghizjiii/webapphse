import { callBitrix } from './client';
import { extractListRows } from './utils';
import { SMART_PROCESS_ENTITY_TYPE_ID } from './config';
import {
  BITRIX_FIELDS_RAW,
  BITRIX_FIELDS,
  COMPANY_FIELD_TITLE_ALIASES,
  findFieldByName,
  extractEnumFromField,
} from './fields';

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
}): Promise<string | undefined> {
  type EnumCacheHost = typeof globalThis & {
    __enumFieldOptionsCache__?: Map<string, Map<string, string>>;
  };

  const normalizedValue = (params.value || '').trim().toLowerCase();
  if (!normalizedValue) return undefined;

  const cacheKey = `${params.entityTypeId}:${params.fieldRawName}`;
  const cacheHost = globalThis as EnumCacheHost;
  const cache = cacheHost.__enumFieldOptionsCache__ || new Map<string, Map<string, string>>();
  cacheHost.__enumFieldOptionsCache__ = cache;

  let options = cache.get(cacheKey);

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
    cache.set(cacheKey, options);
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
