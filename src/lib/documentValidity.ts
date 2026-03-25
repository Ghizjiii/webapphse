import type { RefDocumentValidityRule } from '../types';

export type DocumentDurationUnit = 'day' | 'month' | 'year';

const DEFAULT_DURATION_VALUE = 1;
const DEFAULT_DURATION_UNIT: DocumentDurationUnit = 'year';

const PRESET_RULES: Array<{
  courseName: string;
  categoryKey: string;
  documentType: string;
  durationValue: number;
  durationUnit: DocumentDurationUnit;
}> = [
  { courseName: 'Безопасность и охрана труда', categoryKey: 'итр', documentType: 'Сертификат', durationValue: 3, durationUnit: 'year' },
  { courseName: 'Безопасность и охрана труда', categoryKey: 'обычный', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
  { courseName: 'Пожарно-технический минимум', categoryKey: 'итр', documentType: 'Удостоверение', durationValue: 3, durationUnit: 'year' },
  { courseName: 'Пожарно-технический минимум', categoryKey: 'обычный', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
  { courseName: 'Промышленной безопасности на опасном производственном объекте', categoryKey: 'итр', documentType: 'Удостоверение', durationValue: 3, durationUnit: 'year' },
  { courseName: 'Промышленной безопасности на опасном производственном объекте', categoryKey: 'обычный', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
  { courseName: 'Безопасное ведение работ на высоте', categoryKey: 'итр', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
  { courseName: 'Безопасное ведение работ на высоте', categoryKey: 'обычный', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
  { courseName: 'Промышленная безопасность сосуды под давлением', categoryKey: 'итр', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
  { courseName: 'Промышленная безопасность сосуды под давлением', categoryKey: 'обычный', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
  { courseName: 'Промышленная безопасность для ответственных лиц по грузоподъемным механизмам', categoryKey: 'итр', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
  { courseName: 'Промышленная безопасность при работе с грузоподъемными механизмами (ГПМ)', categoryKey: 'итр', documentType: 'Удостоверение', durationValue: 3, durationUnit: 'year' },
  { courseName: 'Промышленная безопасность при работе с грузоподъемными механизмами (ГПМ)', categoryKey: 'обычный', documentType: 'Удостоверение', durationValue: 1, durationUnit: 'year' },
];

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function normalizeCategory(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  if (normalized.includes('итр')) return 'итр';
  if (normalized.includes('обыч')) return 'обычный';
  return normalized;
}

function normalizeCourse(value: string | null | undefined): string {
  return normalizeText(value);
}

function defaultDocumentType(category: string | null | undefined, courseName: string | null | undefined): string {
  const categoryKey = normalizeCategory(category);
  const courseKey = normalizeCourse(courseName);
  const preset = PRESET_RULES.find(rule => (
    normalizeCourse(rule.courseName) === courseKey &&
    rule.categoryKey === categoryKey
  ));
  if (preset) return preset.documentType;
  if (courseKey === normalizeCourse('Безопасность и охрана труда') && categoryKey === 'итр') {
    return 'Сертификат';
  }
  return 'Удостоверение';
}

function pluralizeYears(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'год';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'года';
  return 'лет';
}

function pluralizeMonths(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'месяц';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'месяца';
  return 'месяцев';
}

function pluralizeDays(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonths(base: Date, months: number): Date {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedTargetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, normalizedTargetMonth));
  return new Date(Date.UTC(targetYear, normalizedTargetMonth, targetDay));
}

export function formatDurationLabel(value: number, unit: DocumentDurationUnit): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (unit === 'day') return `${value} ${pluralizeDays(value)}`;
  if (unit === 'month') return `${value} ${pluralizeMonths(value)}`;
  return `${value} ${pluralizeYears(value)}`;
}

export function buildDocumentValidityDefaults(params: {
  courseNames: string[];
  categoryNames: string[];
  existingRules: RefDocumentValidityRule[];
}): Array<{
  course_name: string;
  category: string;
  document_type: string;
  duration_value: number;
  duration_unit: DocumentDurationUnit;
  sort_order: number;
}> {
  const { courseNames, categoryNames, existingRules } = params;
  const rows: Array<{
    course_name: string;
    category: string;
    document_type: string;
    duration_value: number;
    duration_unit: DocumentDurationUnit;
    sort_order: number;
  }> = [];

  let sortOrder = existingRules.length + 1;
  for (const courseName of courseNames) {
    for (const categoryName of categoryNames) {
      if (findDocumentValidityRule(existingRules, courseName, categoryName)) continue;

      const categoryKey = normalizeCategory(categoryName);
      const preset = PRESET_RULES.find(rule => (
        normalizeCourse(rule.courseName) === normalizeCourse(courseName) &&
        rule.categoryKey === categoryKey
      ));

      rows.push({
        course_name: courseName,
        category: categoryName,
        document_type: preset?.documentType || defaultDocumentType(categoryName, courseName),
        duration_value: preset?.durationValue || DEFAULT_DURATION_VALUE,
        duration_unit: preset?.durationUnit || DEFAULT_DURATION_UNIT,
        sort_order: sortOrder++,
      });
    }
  }

  return rows;
}

export function calculateExpiryDate(startDate: string, durationValue: number, durationUnit: DocumentDurationUnit): string | null {
  const datePart = String(startDate || '').split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const [year, month, day] = datePart.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(base.getTime())) return null;

  let result = base;
  if (durationUnit === 'day') {
    result = new Date(Date.UTC(year, month - 1, day + durationValue));
  } else if (durationUnit === 'month') {
    result = addMonths(base, durationValue);
  } else {
    result = addMonths(base, durationValue * 12);
  }

  return result.toISOString().split('T')[0];
}

export function findDocumentValidityRule(
  rules: RefDocumentValidityRule[],
  courseName: string | null | undefined,
  category: string | null | undefined
): RefDocumentValidityRule | null {
  const normalizedCourse = normalizeCourse(courseName);
  const normalizedCategoryValue = normalizeCategory(category);

  if (!normalizedCourse || !normalizedCategoryValue) return null;

  return rules.find(rule => (
    normalizeCourse(rule.course_name) === normalizedCourse &&
    normalizeCategory(rule.category) === normalizedCategoryValue
  )) || null;
}

export function resolveDocumentExpiryFromRule(params: {
  rules: RefDocumentValidityRule[];
  courseName: string | null | undefined;
  category: string | null | undefined;
  startDate: string | null | undefined;
}): { rule: RefDocumentValidityRule | null; expiryDate: string | null; usedDefault: boolean } {
  const { rules, courseName, category, startDate } = params;
  const rule = findDocumentValidityRule(rules, courseName, category);
  if (!startDate) {
    return { rule, expiryDate: null, usedDefault: false };
  }

  if (!rule) {
    return {
      rule: null,
      expiryDate: calculateExpiryDate(startDate, DEFAULT_DURATION_VALUE, DEFAULT_DURATION_UNIT),
      usedDefault: true,
    };
  }

  return {
    rule,
    expiryDate: calculateExpiryDate(startDate, rule.duration_value, rule.duration_unit),
    usedDefault: false,
  };
}
