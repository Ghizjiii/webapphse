import type { Certificate, SortConfig } from '../../types';

export function getCertificateDisplayName(cert: Certificate): string {
  const fullName = String(cert.full_name || '').trim();
  if (fullName) return fullName;
  return [cert.last_name, cert.first_name, cert.middle_name]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

export const TEXT_FIELDS: { key: keyof Certificate; label: string }[] = [
  { key: 'full_name', label: '\u0424\u0418\u041e' },
  { key: 'position', label: '\u0414\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c' },
  { key: 'category', label: 'Категория' },
  { key: 'course_name', label: 'Наим. курса' },
  { key: 'qualification', label: 'Квалификация' },
  { key: 'level', label: 'Разряд' },
  { key: 'electrical_safety_group', label: 'Группа электробезопасности' },
  { key: 'document_number', label: 'Номер документа' },
  { key: 'protocol_number', label: 'Протокол' },
  { key: 'issuer_company', label: 'Компания, которая выдает документ' },
  { key: 'commission_chair', label: 'Председатель' },
  { key: 'manager', label: 'Руководитель' },
  { key: 'commission_member_1', label: 'Член комис. 1' },
  { key: 'commission_member_2', label: 'Член комис. 2' },
  { key: 'commission_member_3', label: 'Член комис. 3' },
  { key: 'commission_member_4', label: 'Член комис. 4' },
  { key: 'commission_members', label: 'Все члены' },
  { key: 'commission_members_protocol', label: 'Члены комиссии протокол' },
  { key: 'electrical_safety_admission_protocol', label: 'Допуск электробезопасности протокол' },
  { key: 'marker_pass', label: 'Отметка о проверке знаний' },
  { key: 'type_learn', label: 'Вид проверки / тип / причина' },
  { key: 'commis_concl', label: 'Заключение комиссии' },
  { key: 'grade', label: 'Оценка за квалиф. экзамен' },
  { key: 'employee_status', label: 'Статус сотр.' },
  { key: 'price', label: 'Цена' },
];

export const BULK_TEXT_FILL_FIELDS: Array<{ key: keyof Certificate; label: string }> = [
  { key: 'commission_member_1', label: 'Член комиссии 1' },
  { key: 'commission_member_2', label: 'Член комиссии 2' },
  { key: 'commission_member_3', label: 'Член комиссии 3' },
  { key: 'commission_member_4', label: 'Член комиссии 4' },
  { key: 'commission_members', label: 'Все члены комиссии' },
  { key: 'level', label: 'Разряд' },
  { key: 'marker_pass', label: 'Отметка о проверке знаний' },
  { key: 'type_learn', label: 'Вид проверки / тип / причина' },
  { key: 'commis_concl', label: 'Заключение комиссии' },
  { key: 'grade', label: 'Оценка за квалиф. экзамен' },
  { key: 'manager', label: 'Руководитель' },
  { key: 'price', label: 'Цена' },
];

export const AUX_COLUMN_LABELS: Record<string, string> = {
  start_date: 'Нач. курса',
  expiry_date: 'Срок документа',
  is_printed: 'Напечатан',
};

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  full_name: 260,
  position: 130,
  category: 120,
  course_name: 240,
  qualification: 150,
  level: 110,
  electrical_safety_group: 180,
  document_number: 125,
  protocol_number: 110,
  issuer_company: 220,
  commission_chair: 140,
  manager: 130,
  commission_member_1: 120,
  commission_member_2: 120,
  commission_member_3: 120,
  commission_member_4: 120,
  commission_members: 130,
  commission_members_protocol: 230,
  electrical_safety_admission_protocol: 250,
  marker_pass: 170,
  type_learn: 220,
  commis_concl: 170,
  grade: 170,
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
    const leftValue = config.key === 'full_name'
      ? getCertificateDisplayName(left)
      : String((left as unknown as Record<string, unknown>)[config.key] ?? '');
    const rightValue = config.key === 'full_name'
      ? getCertificateDisplayName(right)
      : String((right as unknown as Record<string, unknown>)[config.key] ?? '');
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
