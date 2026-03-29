import { callBitrix } from './client';

export interface BitrixListDefinition {
  iblockId: number;
  name: string;
}

export interface BitrixListElement {
  id: string;
  iblockId: number;
  name: string;
  code: string;
  sortOrder: number;
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

function normalizeListElement(raw: Record<string, unknown>, index: number, iblockId: number): BitrixListElement | null {
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
  };
}

export async function fetchBitrixListElements(iblockId: number): Promise<BitrixListElement[]> {
  const result = await callBitrix('lists.element.get', {
    IBLOCK_TYPE_ID: 'lists',
    IBLOCK_ID: iblockId,
  });

  const rows = Array.isArray(result) ? result : [];

  return rows
    .map((row, index) => normalizeListElement(row as Record<string, unknown>, index, iblockId))
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
