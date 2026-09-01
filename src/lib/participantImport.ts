import { buildParticipantFullName, normalizeParticipantFullName } from './participantName';

export interface ParticipantImportRow {
  full_name: string;
  last_name: string;
  first_name: string;
  patronymic: string;
  email: string;
  position: string;
  category: string;
  courses: string[];
}

export interface ParticipantImportResult {
  rows: ParticipantImportRow[];
  warnings: string[];
}

type ParticipantImportField =
  | 'full_name'
  | 'last_name'
  | 'first_name'
  | 'patronymic'
  | 'email'
  | 'position'
  | 'category'
  | 'courses';

const HEADER_ALIASES: Record<ParticipantImportField, string[]> = {
  full_name: ['fio', 'full name', 'fullname', 'name', 'participant', 'participant name', 'sotrudnik', 'uchastnik', 'фио', 'ф и о', 'сотрудник', 'участник'],
  last_name: ['last name', 'lastname', 'surname', 'family name', 'фамилия'],
  first_name: ['first name', 'firstname', 'given name', 'имя'],
  patronymic: ['middle name', 'middlename', 'patronymic', 'отчество'],
  email: ['email', 'e-mail', 'mail', 'email участника', 'почта', 'электронная почта', 'эл почта'],
  position: ['position', 'job title', 'title', 'должность', 'позиция'],
  category: ['category', 'категория'],
  courses: ['course', 'courses', 'training', 'program', 'programs', 'курс', 'курсы', 'обучение', 'программа', 'программы'],
};

const FALLBACK_FIELDS: ParticipantImportField[] = ['full_name', 'email', 'position', 'category', 'courses'];

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: unknown): string {
  return normalizeText(value)
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/g, '');
}

function splitDelimitedLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index++;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === separator && !quoted) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);
  return result.map(value => value.trim());
}

function parseDelimited(text: string, separator: string): string[][] {
  return text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => splitDelimitedLine(line, separator));
}

function hasValue(row: unknown[]): boolean {
  return row.some(value => normalizeText(value));
}

function detectSeparator(text: string, fileName: string): string {
  if (/\.tsv$/i.test(fileName)) return '\t';
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  if (tabCount >= semicolonCount && tabCount >= commaCount && tabCount > 0) return '\t';
  return semicolonCount >= commaCount ? ';' : ',';
}

function fieldForHeader(value: unknown): ParticipantImportField | null {
  const normalized = normalizeKey(value);
  if (!normalized) return null;

  for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<[ParticipantImportField, string[]]>) {
    if (aliases.some(alias => normalizeKey(alias) === normalized)) return field;
  }

  return null;
}

function buildHeaderMap(rows: unknown[][]): { headerIndex: number; fields: Array<ParticipantImportField | null>; fallback: boolean } {
  const searchRows = rows.slice(0, Math.min(rows.length, 8));
  let best = { headerIndex: 0, fields: [] as Array<ParticipantImportField | null>, score: 0 };

  searchRows.forEach((row, index) => {
    const fields = row.map(fieldForHeader);
    const score = fields.filter(Boolean).length;
    if (score > best.score) {
      best = { headerIndex: index, fields, score };
    }
  });

  if (best.score > 0) {
    return { headerIndex: best.headerIndex, fields: best.fields, fallback: false };
  }

  return { headerIndex: -1, fields: FALLBACK_FIELDS, fallback: true };
}

function makeCourseResolver(availableCourses: string[]) {
  const byKey = new Map<string, string>();
  availableCourses.forEach(course => {
    const normalized = normalizeKey(course);
    if (normalized && !byKey.has(normalized)) byKey.set(normalized, course);
  });

  return (value: string): string => byKey.get(normalizeKey(value)) || value.trim();
}

function splitCourses(value: string, resolveCourse: (value: string) => string): string[] {
  const raw = normalizeText(value);
  if (!raw) return [];

  const parts = raw
    .split(/[;\n\r|]+/)
    .map(part => part.trim())
    .filter(Boolean);

  return [...new Set(parts.map(resolveCourse).filter(Boolean))];
}

async function rowsFromWorksheet(arrayBuffer: ArrayBuffer): Promise<unknown[][]> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
}

async function rowsFromFile(file: File): Promise<unknown[][]> {
  const fileName = file.name || '';
  if (/\.(xlsx|xls)$/i.test(fileName)) {
    return rowsFromWorksheet(await file.arrayBuffer());
  }

  const text = await file.text();
  const separator = detectSeparator(text, fileName);
  return parseDelimited(text, separator);
}

export async function parseParticipantImportFile(file: File, availableCourses: string[] = []): Promise<ParticipantImportResult> {
  const sourceRows = (await rowsFromFile(file)).filter(hasValue);
  const warnings: string[] = [];
  if (sourceRows.length === 0) return { rows: [], warnings: ['Файл пустой.'] };

  const header = buildHeaderMap(sourceRows);
  if (header.fallback) {
    warnings.push('Заголовки не распознаны, использован порядок колонок: ФИО, Email, Должность, Категория, Курсы.');
  }

  const resolveCourse = makeCourseResolver(availableCourses);
  const dataRows = sourceRows.slice(header.headerIndex + 1);
  const rows: ParticipantImportRow[] = [];

  dataRows.forEach((row, rowIndex) => {
    const values: Partial<Record<ParticipantImportField, string>> = {};

    header.fields.forEach((field, columnIndex) => {
      if (!field || values[field]) return;
      values[field] = normalizeText(row[columnIndex]);
    });

    const fullName = normalizeText(values.full_name);
    const separateName = {
      last_name: normalizeText(values.last_name),
      first_name: normalizeText(values.first_name),
      patronymic: normalizeText(values.patronymic),
    };
    const normalizedFullName = normalizeParticipantFullName(fullName || buildParticipantFullName(separateName));
    const courses = splitCourses(String(values.courses || ''), resolveCourse);

    const item: ParticipantImportRow = {
      full_name: normalizedFullName,
      last_name: normalizeParticipantFullName(separateName.last_name),
      first_name: normalizeParticipantFullName(separateName.first_name),
      patronymic: normalizeParticipantFullName(separateName.patronymic),
      email: normalizeText(values.email),
      position: normalizeText(values.position),
      category: normalizeText(values.category),
      courses,
    };

    const hasAnyValue = Boolean(
      item.full_name ||
      item.email ||
      item.position ||
      item.category ||
      item.courses.length > 0
    );

    if (!hasAnyValue) return;
    if (!item.full_name) warnings.push(`Строка ${rowIndex + header.headerIndex + 2}: не заполнено ФИО.`);
    rows.push(item);
  });

  return { rows, warnings };
}
