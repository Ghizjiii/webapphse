import { logger } from '../logger';
import { WEBHOOK } from './config';

export interface BitrixListDefinition {
  iblockId: number;
  name: string;
}

export interface BitrixDocumentValidityDetails {
  course_name: string;
  category: string;
  document_type: string;
  duration_value: number | null;
  duration_unit: 'year';
}

export interface BitrixListElement {
  id: string;
  iblockId: number;
  name: string;
  code: string;
  sortOrder: number;
  details: BitrixDocumentValidityDetails | null;
}

export const BITRIX_REFERENCE_LISTS = {
  COURSES: { iblockId: 64, name: 'Наименование курсов' },
  DOCUMENT_VALIDITY: { iblockId: 66, name: 'Сроки документов' },
  CATEGORIES: { iblockId: 68, name: 'Категория' },
  DOCUMENT_TYPE: { iblockId: 70, name: 'Тип документа' },
  GRADE: { iblockId: 72, name: 'Оценка за квалиф. экзамен' },
  EMPLOYEE_STATUS: { iblockId: 74, name: 'Статус сотрудника' },
  MARKER_PASS: { iblockId: 76, name: 'Отметка о проверке знаний' },
  TYPE_LEARN: { iblockId: 78, name: 'Вид проверки знаний / тип обучения' },
  COMMIS_CONCL: { iblockId: 80, name: 'Заключение комиссии' },
} as const satisfies Record<string, BitrixListDefinition>;

export const BITRIX_REFERENCE_LIST_ORDER = [
  'CATEGORIES',
  'COURSES',
  'DOCUMENT_VALIDITY',
  'DOCUMENT_TYPE',
  'GRADE',
  'EMPLOYEE_STATUS',
  'MARKER_PASS',
  'TYPE_LEARN',
  'COMMIS_CONCL',
] as const satisfies ReadonlyArray<keyof typeof BITRIX_REFERENCE_LISTS>;

interface BitrixListFieldDefinition {
  fieldId: string;
  code: string;
  name: string;
  propertyType: string;
  displayValues: Record<string, string>;
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstScalarValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstScalarValue(item);
      if (candidate) return candidate;
    }
    return '';
  }

  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const candidate = firstScalarValue(nestedValue);
      if (candidate) return candidate;
    }
  }

  return '';
}

function normalizeListField(entry: [string, unknown]): BitrixListFieldDefinition {
  const [fieldId, raw] = entry;
  const field = toPlainRecord(raw);
  const displayValuesRaw = toPlainRecord(field.DISPLAY_VALUES_FORM);
  const displayValues = Object.fromEntries(
    Object.entries(displayValuesRaw).map(([key, value]) => [key, String(value || '').trim()])
  );

  return {
    fieldId: String(field.FIELD_ID || fieldId || '').trim(),
    code: String(field.CODE || '').trim(),
    name: String(field.NAME || '').trim(),
    propertyType: String(field.PROPERTY_TYPE || '').trim(),
    displayValues,
  };
}

async function callBitrixListMethod(method: string, params: Record<string, string | number>): Promise<unknown> {
  const url = `${WEBHOOK}/${method}.json`;
  const maxAttempts = 4;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        body.append(key, String(value));
      }

      const response = await fetch(url, {
        method: 'POST',
        body,
      });

      const bodyText = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const err = new Error(`Bitrix HTTP ${response.status} at ${method}: ${bodyText || 'empty response'}`);
        lastError = err;
        if (attempt < maxAttempts && (response.status === 429 || response.status >= 500)) {
          logger.warn('bitrix.list', `Retry ${attempt}/${maxAttempts} for ${method} after HTTP ${response.status}`);
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
        if (attempt < maxAttempts && (code === 'QUERY_LIMIT_EXCEEDED' || code === 'TOO_MANY_REQUESTS' || code === 'TIMEOUT')) {
          logger.warn('bitrix.list', `Retry ${attempt}/${maxAttempts} for ${method} after ${code}`);
          await new Promise(resolve => setTimeout(resolve, 350 * attempt));
          continue;
        }
        throw err;
      }

      return data.result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      lastError = error instanceof Error ? error : new Error(message);
      const networkLike = /failed to fetch|networkerror|network request failed|load failed/i.test(message);
      if (attempt < maxAttempts && networkLike) {
        logger.warn('bitrix.list', `Retry ${attempt}/${maxAttempts} for ${method} after network error: ${message}`);
        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`Bitrix list call failed: ${method}`);
}

function findField(
  fields: BitrixListFieldDefinition[],
  params: { code?: string; name?: string; fieldId?: string }
): BitrixListFieldDefinition | null {
  const targetCode = String(params.code || '').trim().toLowerCase();
  const targetName = String(params.name || '').trim().toLowerCase();
  const targetFieldId = String(params.fieldId || '').trim().toLowerCase();

  return fields.find(field => {
    const fieldCode = field.code.toLowerCase();
    const fieldName = field.name.toLowerCase();
    const fieldId = field.fieldId.toLowerCase();
    return (
      (targetCode && fieldCode === targetCode) ||
      (targetName && fieldName === targetName) ||
      (targetFieldId && fieldId === targetFieldId)
    );
  }) || null;
}

function resolveFieldDisplayValue(field: BitrixListFieldDefinition | null, rawValue: unknown): string {
  const scalar = firstScalarValue(rawValue);
  if (!scalar) return '';
  return field?.displayValues[scalar] || scalar;
}

function resolveFieldNumberValue(rawValue: unknown): number | null {
  const scalar = firstScalarValue(rawValue).replace(',', '.');
  if (!scalar) return null;
  const parsed = Number(scalar);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDocumentValidityDetails(
  raw: Record<string, unknown>,
  fields: BitrixListFieldDefinition[]
): BitrixDocumentValidityDetails {
  const courseField = findField(fields, { code: 'UKE', name: 'Наименование курсов', fieldId: 'PROPERTY_874' });
  const categoryField = findField(fields, { code: 'KATEGORIYA', name: 'Категория', fieldId: 'PROPERTY_876' });
  const documentTypeField = findField(fields, { code: 'TIP_DOKUMENTA', name: 'Тип документа', fieldId: 'PROPERTY_878' });
  const durationField = findField(fields, { code: 'SROK_GOD', name: 'Срок (год)', fieldId: 'PROPERTY_880' });

  return {
    course_name: resolveFieldDisplayValue(courseField, courseField ? raw[courseField.fieldId] : raw.NAME) || String(raw.NAME || '').trim(),
    category: resolveFieldDisplayValue(categoryField, categoryField ? raw[categoryField.fieldId] : ''),
    document_type: resolveFieldDisplayValue(documentTypeField, documentTypeField ? raw[documentTypeField.fieldId] : ''),
    duration_value: resolveFieldNumberValue(durationField ? raw[durationField.fieldId] : ''),
    duration_unit: 'year',
  };
}

function normalizeListElement(
  raw: Record<string, unknown>,
  index: number,
  iblockId: number,
  fields: BitrixListFieldDefinition[]
): BitrixListElement | null {
  const id = String(raw.ID || raw.id || '').trim();
  const name = String(raw.NAME || raw.name || '').trim();
  if (!id || !name) return null;

  const sortRaw = Number(raw.SORT || raw.sort || 0);

  return {
    id,
    iblockId,
    name,
    code: String(raw.CODE || raw.code || '').trim(),
    sortOrder: Number.isFinite(sortRaw) && sortRaw > 0 ? sortRaw : index + 1,
    details: iblockId === BITRIX_REFERENCE_LISTS.DOCUMENT_VALIDITY.iblockId
      ? buildDocumentValidityDetails(raw, fields)
      : null,
  };
}

async function fetchBitrixListFields(iblockId: number): Promise<BitrixListFieldDefinition[]> {
  const result = await callBitrixListMethod('lists.field.get', {
    IBLOCK_TYPE_ID: 'lists',
    IBLOCK_ID: iblockId,
  });
  const fieldsRecord = toPlainRecord(result);
  return Object.entries(fieldsRecord).map(normalizeListField);
}

export async function fetchBitrixListElements(iblockId: number): Promise<BitrixListElement[]> {
  const [result, fields] = await Promise.all([
    callBitrixListMethod('lists.element.get', {
      IBLOCK_TYPE_ID: 'lists',
      IBLOCK_ID: iblockId,
    }),
    iblockId === BITRIX_REFERENCE_LISTS.DOCUMENT_VALIDITY.iblockId
      ? fetchBitrixListFields(iblockId)
      : Promise.resolve([] as BitrixListFieldDefinition[]),
  ]);

  const rows = Array.isArray(result) ? result : [];

  return rows
    .map((row, index) => normalizeListElement(row as Record<string, unknown>, index, iblockId, fields))
    .filter((row): row is BitrixListElement => Boolean(row));
}

export async function fetchCourseListElements(): Promise<BitrixListElement[]> {
  return fetchBitrixListElements(BITRIX_REFERENCE_LISTS.COURSES.iblockId);
}

export async function fetchCategoryListElements(): Promise<BitrixListElement[]> {
  return fetchBitrixListElements(BITRIX_REFERENCE_LISTS.CATEGORIES.iblockId);
}

export async function fetchAllReferenceListElements(): Promise<Array<{
  listKey: keyof typeof BITRIX_REFERENCE_LISTS;
  definition: BitrixListDefinition;
  items: BitrixListElement[];
}>> {
  const results = await Promise.all(
    BITRIX_REFERENCE_LIST_ORDER.map(async listKey => {
      const definition = BITRIX_REFERENCE_LISTS[listKey];
      const items = await fetchBitrixListElements(definition.iblockId);
      return { listKey, definition, items };
    })
  );

  return results;
}
