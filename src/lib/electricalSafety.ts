export const NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP = '__none__';

export const DEFAULT_ELECTRICAL_SAFETY_GROUPS = [
  'группа допуска II',
  'группа допуска III',
  'группа допуска IV',
  'группа допуска V',
];

export function normalizeElectricalSafetyText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

export function isElectricalSafetyCourse(courseName: string | null | undefined): boolean {
  return normalizeElectricalSafetyText(courseName).includes('электробезопас');
}

export function normalizePreviousElectricalSafetyGroup(value: string | null | undefined): string {
  const text = String(value || '').trim();
  if (!text || text === NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP) return '';
  return text;
}

export function electricalSafetyGroupShort(value: string | null | undefined): string {
  const normalized = normalizeElectricalSafetyText(value);
  if (!normalized) return '';

  const romanMatch = normalized.match(/\b(ii|iii|iv|v)\b/i);
  if (romanMatch) return `${romanMatch[1].toUpperCase()} гр.`;

  const digitMatch = normalized.match(/\b([2-5])\b/);
  const romanByDigit: Record<string, string> = {
    '2': 'II',
    '3': 'III',
    '4': 'IV',
    '5': 'V',
  };
  if (digitMatch && romanByDigit[digitMatch[1]]) return `${romanByDigit[digitMatch[1]]} гр.`;

  return String(value || '').trim();
}

export function gradeShort(value: string | null | undefined): string {
  const normalized = normalizeElectricalSafetyText(value);
  if (!normalized) return '';
  if (normalized.includes('отлич')) return 'Отл.';
  if (normalized.includes('хорош')) return 'Хор.';
  if (normalized.includes('удов')) return 'Удов.';
  if (normalized.includes('плох') || normalized.includes('неуд')) return 'Плох.';
  return String(value || '').trim();
}

