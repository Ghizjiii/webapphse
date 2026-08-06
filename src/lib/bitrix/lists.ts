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

export interface BitrixCoursePriceDetails {
  course_name: string;
  qualification: string;
  electrical_safety_group: string;
  category: string;
  price: number | null;
}

export interface BitrixElectricalSafetyAdmissionDetails {
  category: string;
}

export interface BitrixElectricalSafetyGroupDetails {
  text_in_document: string;
}

export interface BitrixCommissionMemberDetails {
  city: string;
  my_company: string;
  main_text: string;
}

export interface BitrixListElement {
  id: string;
  iblockId: number;
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
}

export const BITRIX_REFERENCE_LISTS = {
  MY_COMPANIES: { iblockId: 60, name: 'Справочник компаний (служебное)' },
  COURSES: { iblockId: 64, name: 'Наименование курсов' },
  DOCUMENT_VALIDITY: { iblockId: 66, name: 'Сроки документов' },
  CATEGORIES: { iblockId: 68, name: 'Категория' },
  DOCUMENT_TYPE: { iblockId: 70, name: 'Тип документа' },
  GRADE: { iblockId: 72, name: 'Оценка за квалиф. экзамен' },
  EMPLOYEE_STATUS: { iblockId: 74, name: 'Статус сотрудника' },
  MARKER_PASS: { iblockId: 76, name: 'Отметка о проверке знаний' },
  TYPE_LEARN: { iblockId: 78, name: 'Вид проверки / тип обучения' },
  COMMIS_CONCL: { iblockId: 80, name: 'Заключение комиссии' },
  COURSE_PRICES: { iblockId: 84, name: 'Course default prices' },
  REGIONS: { iblockId: Number(import.meta.env.VITE_BITRIX_REGION_LIST_IBLOCK_ID || '118'), name: 'Отделы и регионы' },
  QUALIFICATION: { iblockId: 86, name: 'Название курсов квалификации' },
  ELECTRICAL_SAFETY_ADMISSION: { iblockId: 88, name: 'Допуск электробезопасность' },
  ELECTRICAL_SAFETY_GROUP: { iblockId: 90, name: 'Группа электробезопасность' },
  CITIES: { iblockId: 92, name: 'Города' },
  COMMISSION_MEMBERS: { iblockId: 94, name: 'Члены комиссии (для протокола)' },
  COMMISSION_MY_COMPANIES: { iblockId: 96, name: 'Мои компании' },
} as const satisfies Record<string, BitrixListDefinition>;

export const BITRIX_REFERENCE_LIST_ORDER = [
  'MY_COMPANIES',
  'CATEGORIES',
  'COURSES',
  'DOCUMENT_VALIDITY',
  'DOCUMENT_TYPE',
  'GRADE',
  'EMPLOYEE_STATUS',
  'MARKER_PASS',
  'TYPE_LEARN',
  'COMMIS_CONCL',
  'COURSE_PRICES',
  'REGIONS',
  'QUALIFICATION',
  'ELECTRICAL_SAFETY_ADMISSION',
  'ELECTRICAL_SAFETY_GROUP',
  'CITIES',
  'COMMISSION_MEMBERS',
  'COMMISSION_MY_COMPANIES',
] as const satisfies ReadonlyArray<keyof typeof BITRIX_REFERENCE_LISTS>;

function resolveBitrixListTypeId(iblockId: number): string {
  return iblockId === 60 ? 'bitrix_processes' : 'lists';
}

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

async function callBitrixListPayload(method: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
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

      return data;
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

async function callBitrixListMethod(method: string, params: Record<string, string | number>): Promise<unknown> {
  const payload = await callBitrixListPayload(method, params);
  return payload.result;
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

function resolveFieldMoneyValue(rawValue: unknown): number | null {
  const visit = (value: unknown): number | null => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const normalized = value
        .split('|')[0]
        .replace(/\s+/g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');
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

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['VALUE', 'value', 'AMOUNT', 'amount', 'PRICE', 'price']) {
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

function buildCoursePriceDetails(
  raw: Record<string, unknown>,
  fields: BitrixListFieldDefinition[]
): BitrixCoursePriceDetails {
  const courseField = findField(fields, { code: 'NAIMENOVANIE_KURSOV', fieldId: 'PROPERTY_948' });
  const qualificationField = findField(fields, { code: 'KVALIFIKATSIYA', fieldId: 'PROPERTY_952' });
  const electricalSafetyGroupField = findField(fields, { code: 'GRUPPA_ELEKTROBEZOPASNOST_', fieldId: 'PROPERTY_960' });
  const categoryField = findField(fields, { code: 'KATEGORIYA', fieldId: 'PROPERTY_950' });
  const priceField = findField(fields, { code: 'TSENA', fieldId: 'PROPERTY_946' });

  return {
    course_name: resolveFieldDisplayValue(courseField, courseField ? raw[courseField.fieldId] : raw.NAME) || String(raw.NAME || '').trim(),
    qualification: resolveFieldDisplayValue(qualificationField, qualificationField ? raw[qualificationField.fieldId] : ''),
    electrical_safety_group: resolveFieldDisplayValue(
      electricalSafetyGroupField,
      electricalSafetyGroupField ? raw[electricalSafetyGroupField.fieldId] : ''
    ),
    category: resolveFieldDisplayValue(categoryField, categoryField ? raw[categoryField.fieldId] : ''),
    price: resolveFieldMoneyValue(priceField ? raw[priceField.fieldId] : ''),
  };
}

function buildElectricalSafetyAdmissionDetails(
  raw: Record<string, unknown>,
  fields: BitrixListFieldDefinition[]
): BitrixElectricalSafetyAdmissionDetails {
  const categoryField = findField(fields, { code: 'KATEGORIYA', fieldId: 'PROPERTY_954' });

  return {
    category: resolveFieldDisplayValue(categoryField, categoryField ? raw[categoryField.fieldId] : ''),
  };
}

function buildElectricalSafetyGroupDetails(
  raw: Record<string, unknown>,
  fields: BitrixListFieldDefinition[]
): BitrixElectricalSafetyGroupDetails {
  const textField = findField(fields, { code: 'TEKST_V_DOKUMENTE', fieldId: 'PROPERTY_956' });

  return {
    text_in_document: resolveFieldDisplayValue(textField, textField ? raw[textField.fieldId] : ''),
  };
}

function buildCommissionMemberDetails(
  raw: Record<string, unknown>,
  fields: BitrixListFieldDefinition[]
): BitrixCommissionMemberDetails {
  const cityField = findField(fields, { code: 'GOROD', fieldId: 'PROPERTY_962' });
  const myCompanyField = findField(fields, { code: 'MOYA_KOMPANIYA', fieldId: 'PROPERTY_964' });

  return {
    city: resolveFieldDisplayValue(cityField, cityField ? raw[cityField.fieldId] : ''),
    my_company: resolveFieldDisplayValue(myCompanyField, myCompanyField ? raw[myCompanyField.fieldId] : ''),
    main_text: String(raw.PREVIEW_TEXT || raw.previewText || '').trim(),
  };
}

function resolveMyCompanyShortName(
  raw: Record<string, unknown>,
  fields: BitrixListFieldDefinition[]
): string {
  const shortNameField = findField(fields, {
    code: 'KRATKOE_NAZVANIE',
    name: 'Краткое название',
    fieldId: 'PROPERTY_456',
  });

  return resolveFieldDisplayValue(
    shortNameField,
    shortNameField ? raw[shortNameField.fieldId] : raw.PROPERTY_456
  );
}

function resolveMyCompanyVisibleInApp(
  raw: Record<string, unknown>,
  fields: BitrixListFieldDefinition[]
): boolean {
  const displayField = findField(fields, {
    code: 'PRILOZHENIE_OTOBR',
    fieldId: 'PROPERTY_938',
  });
  const value = resolveFieldDisplayValue(
    displayField,
    displayField ? raw[displayField.fieldId] : raw.PROPERTY_938
  ).toLocaleLowerCase('ru');

  return value === 'да' || value === 'yes' || value === 'y' || value === 'true' || value === '1';
}

function resolveMyCompanyChairman(
  raw: Record<string, unknown>,
  fields: BitrixListFieldDefinition[]
): string {
  const chairmanField = findField(fields, {
    code: 'PREDSEDATEL_PRILOZH_',
    fieldId: 'PROPERTY_940',
  });

  return resolveFieldDisplayValue(
    chairmanField,
    chairmanField ? raw[chairmanField.fieldId] : raw.PROPERTY_940
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
  raw: Record<string, unknown>,
  index: number,
  iblockId: number,
  fields: BitrixListFieldDefinition[]
): BitrixListElement | null {
  const id = String(raw.ID || raw.id || '').trim();
  const baseName = String(raw.NAME || raw.name || '').trim();
  if (!id || !baseName) return null;

  const isMyCompaniesList = iblockId === BITRIX_REFERENCE_LISTS.MY_COMPANIES.iblockId;
  if (isMyCompaniesList && !resolveMyCompanyVisibleInApp(raw, fields)) return null;

  const sortRaw = Number(raw.SORT || raw.sort || 0);
  const resolvedName = isMyCompaniesList
    ? resolveMyCompanyShortName(raw, fields) || baseName
    : baseName;
  const resolvedChairman = isMyCompaniesList
    ? resolveMyCompanyChairman(raw, fields)
    : '';

  return {
    id,
    iblockId,
    name: resolvedName,
    code: resolvedChairman || String(raw.CODE || raw.code || '').trim(),
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

async function fetchBitrixListFields(iblockId: number): Promise<BitrixListFieldDefinition[]> {
  const result = await callBitrixListMethod('lists.field.get', {
    IBLOCK_TYPE_ID: resolveBitrixListTypeId(iblockId),
    IBLOCK_ID: iblockId,
  });
  const fieldsRecord = toPlainRecord(result);
  return Object.entries(fieldsRecord).map(normalizeListField);
}

async function fetchBitrixListElementRows(iblockId: number): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let start: string | number = 0;

  while (true) {
    const payload = await callBitrixListPayload('lists.element.get', {
      IBLOCK_TYPE_ID: resolveBitrixListTypeId(iblockId),
      IBLOCK_ID: iblockId,
      start,
    });
    const pageRows = Array.isArray(payload.result) ? payload.result : [];
    rows.push(...pageRows.map(row => toPlainRecord(row)));

    const next = payload.next;
    if (next === undefined || next === null || String(next).trim() === '') break;
    start = typeof next === 'number' ? next : String(next);
  }

  return rows;
}

export async function fetchBitrixListElements(iblockId: number): Promise<BitrixListElement[]> {
  const [rows, fields] = await Promise.all([
    fetchBitrixListElementRows(iblockId),
    listRequiresFieldMetadata(iblockId)
      ? fetchBitrixListFields(iblockId)
      : Promise.resolve([] as BitrixListFieldDefinition[]),
  ]);

  return rows
    .map((row, index) => normalizeListElement(row, index, iblockId, fields))
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
