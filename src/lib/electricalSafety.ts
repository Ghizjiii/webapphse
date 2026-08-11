export const NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP = '\u041d\u0435\u0442 \u0434\u043e\u043f\u0443\u0441\u043a\u0430';

export const DEFAULT_ELECTRICAL_SAFETY_GROUPS = [
  '\u0433\u0440\u0443\u043f\u043f\u0430 \u0434\u043e\u043f\u0443\u0441\u043a\u0430 II',
  '\u0433\u0440\u0443\u043f\u043f\u0430 \u0434\u043e\u043f\u0443\u0441\u043a\u0430 III',
  '\u0433\u0440\u0443\u043f\u043f\u0430 \u0434\u043e\u043f\u0443\u0441\u043a\u0430 IV',
  '\u0433\u0440\u0443\u043f\u043f\u0430 \u0434\u043e\u043f\u0443\u0441\u043a\u0430 V',
];

export const PREVIOUS_ELECTRICAL_SAFETY_GROUP_OPTIONS = [
  NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP,
  ...DEFAULT_ELECTRICAL_SAFETY_GROUPS,
];

const ELECTRICAL_SAFETY_ADMISSION_PREFIX = '\u0414\u043e\u043f\u0443\u0449\u0435\u043d \u043a \u0440\u0430\u0431\u043e\u0442\u0435 \u0432 \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0435';

export function normalizeElectricalSafetyText(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/\u0451/g, '\u0435')
    .replace(/\s+/g, ' ');
}

export function isElectricalSafetyCourse(courseName: string | null | undefined): boolean {
  return normalizeElectricalSafetyText(courseName).includes('\u044d\u043b\u0435\u043a\u0442\u0440\u043e\u0431\u0435\u0437\u043e\u043f\u0430\u0441');
}

export function normalizePreviousElectricalSafetyGroup(value: string | null | undefined): string {
  const text = String(value || '').trim();
  const normalized = normalizeElectricalSafetyText(text);
  if (!normalized || text === '__none__') return NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP;
  if (normalized.includes('\u043d\u0435\u0442') || normalized.includes('\u0431\u0435\u0437 \u0434\u043e\u043f\u0443\u0441\u043a')) {
    return NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP;
  }

  const romanMatch = normalized.match(/\b(ii|iii|iv|v)\b/i);
  const digitMatch = normalized.match(/\b([2-5])\b/);
  const romanByDigit: Record<string, string> = {
    '2': 'II',
    '3': 'III',
    '4': 'IV',
    '5': 'V',
  };
  const roman = romanMatch?.[1]?.toUpperCase() || (digitMatch ? romanByDigit[digitMatch[1]] : '');
  const canonical = DEFAULT_ELECTRICAL_SAFETY_GROUPS.find(group => group.endsWith(String(roman || '')));
  return canonical || NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP;
}

export function buildPreviousElectricalSafetyGroupOptions(referenceGroups: string[]): string[] {
  const byNormalized = new Map(DEFAULT_ELECTRICAL_SAFETY_GROUPS.map(group => [
    normalizeElectricalSafetyText(group),
    group,
  ]));
  const result = new Set<string>([NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP]);

  for (const group of referenceGroups) {
    const canonical = normalizePreviousElectricalSafetyGroup(group);
    if (canonical !== NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP && byNormalized.has(normalizeElectricalSafetyText(canonical))) {
      result.add(canonical);
    }
  }

  for (const group of DEFAULT_ELECTRICAL_SAFETY_GROUPS) result.add(group);
  return PREVIOUS_ELECTRICAL_SAFETY_GROUP_OPTIONS.filter(option => result.has(option));
}

export function electricalSafetyAdmissionDocumentText(value: string | null | undefined): string {
  const text = String(value || '').trim();
  if (!text) return '';

  const normalizedText = normalizeElectricalSafetyText(text);
  const normalizedPrefix = normalizeElectricalSafetyText(ELECTRICAL_SAFETY_ADMISSION_PREFIX);
  if (!normalizedText.startsWith(normalizedPrefix)) return text;

  return text
    .slice(ELECTRICAL_SAFETY_ADMISSION_PREFIX.length)
    .replace(/^[:\s-]+/, '')
    .trim();
}

export function electricalSafetyGroupShort(value: string | null | undefined): string {
  const normalized = normalizeElectricalSafetyText(value);
  if (!normalized) return '';

  const romanMatch = normalized.match(/\b(ii|iii|iv|v)\b/i);
  if (romanMatch) return `${romanMatch[1].toUpperCase()} \u0433\u0440.`;

  const digitMatch = normalized.match(/\b([2-5])\b/);
  const romanByDigit: Record<string, string> = {
    '2': 'II',
    '3': 'III',
    '4': 'IV',
    '5': 'V',
  };
  if (digitMatch && romanByDigit[digitMatch[1]]) return `${romanByDigit[digitMatch[1]]} \u0433\u0440.`;

  return String(value || '').trim();
}

export function gradeShort(value: string | null | undefined): string {
  const normalized = normalizeElectricalSafetyText(value);
  if (!normalized) return '';
  if (normalized.includes('\u043e\u0442\u043b\u0438\u0447')) return '\u041e\u0442\u043b.';
  if (normalized.includes('\u0445\u043e\u0440\u043e\u0448')) return '\u0425\u043e\u0440.';
  if (normalized.includes('\u0443\u0434\u043e\u0432')) return '\u0423\u0434\u043e\u0432.';
  if (normalized.includes('\u043f\u043b\u043e\u0445') || normalized.includes('\u043d\u0435\u0443\u0434')) return '\u041f\u043b\u043e\u0445.';
  return String(value || '').trim();
}
