import type { Certificate, SortConfig } from '../../types';

export const TEXT_FIELDS: { key: keyof Certificate; label: string }[] = [
  { key: 'last_name', label: 'Фамилия' },
  { key: 'first_name', label: 'Имя' },
  { key: 'middle_name', label: 'Отчество' },
  { key: 'position', label: 'Должность' },
  { key: 'category', label: 'Категория' },
  { key: 'course_name', label: 'Наим. курса' },
  { key: 'document_number', label: 'Номер документа' },
  { key: 'protocol_number', label: 'Протокол' },
  { key: 'commission_chair', label: 'Председатель' },
  { key: 'commission_member_1', label: 'Член комис. 1' },
  { key: 'commission_member_2', label: 'Член комис. 2' },
  { key: 'commission_member_3', label: 'Член комис. 3' },
  { key: 'commission_member_4', label: 'Член комис. 4' },
  { key: 'commission_members', label: 'Все члены' },
  { key: 'qualification', label: 'Квалификация' },
  { key: 'manager', label: 'Руководитель' },
  { key: 'employee_status', label: 'Статус сотр.' },
  { key: 'price', label: 'Цена' },
];

export const BULK_TEXT_FILL_FIELDS: Array<{ key: keyof Certificate; label: string }> = [
  { key: 'commission_chair', label: 'Председатель' },
  { key: 'commission_member_1', label: 'Член комиссии 1' },
  { key: 'commission_member_2', label: 'Член комиссии 2' },
  { key: 'commission_member_3', label: 'Член комиссии 3' },
  { key: 'commission_member_4', label: 'Член комиссии 4' },
  { key: 'commission_members', label: 'Все члены комиссии' },
  { key: 'qualification', label: 'Квалификация' },
  { key: 'manager', label: 'Руководитель' },
  { key: 'price', label: 'Цена' },
];

export const AUX_COLUMN_LABELS: Record<string, string> = {
  start_date: 'Нач. курса',
  expiry_date: 'Срок документа',
  is_printed: 'Напечатан',
};

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  last_name: 130,
  first_name: 120,
  middle_name: 130,
  position: 130,
  category: 95,
  course_name: 240,
  document_number: 125,
  protocol_number: 110,
  commission_chair: 140,
  commission_member_1: 120,
  commission_member_2: 120,
  commission_member_3: 120,
  commission_member_4: 120,
  commission_members: 130,
  qualification: 130,
  manager: 130,
  employee_status: 90,
  price: 110,
  start_date: 125,
  expiry_date: 145,
  is_printed: 105,
  actions: 56,
};

export const AUX_COLUMN_KEYS = ['start_date', 'expiry_date', 'is_printed'] as const;
export type AuxColumnKey = typeof AUX_COLUMN_KEYS[number];
export type ColumnKey = keyof Certificate | AuxColumnKey;
export const ALL_COLUMN_KEYS: ColumnKey[] = [
  ...TEXT_FIELDS.map(field => field.key),
  ...AUX_COLUMN_KEYS,
];

export interface EditCell {
  certId: string;
  field: string;
}

export function sortCerts(list: Certificate[], config: SortConfig | null): Certificate[] {
  if (!config) return list;

  return [...list].sort((left, right) => {
    const leftValue = String((left as unknown as Record<string, unknown>)[config.key] ?? '');
    const rightValue = String((right as unknown as Record<string, unknown>)[config.key] ?? '');
    const result = leftValue.localeCompare(rightValue, 'ru');
    return config.direction === 'asc' ? result : -result;
  });
}

export function toBitrixDate(value: string | null): string {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : value;
}

export function makeGeneratedFileName(courseName: string): string {
  const safeCourseName = String(courseName || '').trim() || 'Курс';
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${safeCourseName} - ${yyyy}-${mm}-${dd} ${hh}-${mi}`;
}
