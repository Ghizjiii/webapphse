import { supabase } from './supabase';
import type { Certificate, GeneratedDocumentType } from '../types';
import { electricalSafetyGroupShort, gradeShort } from './electricalSafety';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface TemplateConfig {
  key: string;
  name: string;
  docType: GeneratedDocumentType;
}

export interface GenerateDocumentItem {
  placeholders: Record<string, string>;
  photoUrl?: string;
}

const PHOTOLESS_TEMPLATE_KEYS = new Set([
  'tpl_02_bot_worker_id',
]);

const TEMPLATE_BOT_CERT: TemplateConfig = {
  key: 'tpl_01_bot_itr_certificate',
  name: '01. BOT safety certificate (ITR)',
  docType: 'certificate',
};

const TEMPLATE_BOT_ID: TemplateConfig = {
  key: 'tpl_02_bot_worker_id',
  name: '02. BOT worker ID',
  docType: 'id_card',
};

const TEMPLATE_ELECTRICAL_SAFETY_ID: TemplateConfig = {
  key: 'tpl_10_electrical_safety_id',
  name: '10. Electrical safety ID',
  docType: 'id_card',
};

const TEMPLATE_RULES: Array<{ matcher: RegExp; template: TemplateConfig }> = [
  {
    matcher: /(?:\u044d\u043b\u0435\u043a\u0442\u0440\u043e\u0431\u0435\u0437\u043e\u043f\u0430\u0441)/i,
    template: TEMPLATE_ELECTRICAL_SAFETY_ID,
  },
  {
    matcher: /(?:\u043f\u043e\u0436\u0430\u0440\u043d\u043e)[-\s]?(?:\u0442\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a(?:\u0438\u0439|\u043e\u0433\u043e))\s+(?:\u043c\u0438\u043d\u0438\u043c\u0443\u043c)/i,
    template: { key: 'tpl_03_fire_tech_minimum', name: '03. Fire technical minimum', docType: 'id_card' },
  },
  {
    matcher: /(?:\u0441\u043e\u0441\u0443\u0434(?:\u044b|\u0430)?).*?(?:\u043f\u043e\u0434)\s+(?:\u0434\u0430\u0432\u043b\u0435\u043d)/i,
    template: { key: 'tpl_06_pressure_vessels', name: '06. Pressure vessels', docType: 'id_card' },
  },
  {
    matcher: /(?:\u043d\u0430)\s+(?:\u0432\u044b\u0441\u043e\u0442\u0435)|(?:\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0435)\s+(?:\u0432\u0435\u0434\u0435\u043d\u0438\u0435)\s+(?:\u0440\u0430\u0431\u043e\u0442)\s+(?:\u043d\u0430)\s+(?:\u0432\u044b\u0441\u043e\u0442\u0435)/i,
    template: { key: 'tpl_07_work_at_height', name: '07. Work at height', docType: 'id_card' },
  },
  {
    matcher: /(?:\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d).*?(?:\u0433\u0440\u0443\u0437\u043e\u043f\u043e\u0434\u044a\u0435\u043c\u043d)/i,
    template: { key: 'tpl_08_responsible_lifting', name: '08. Responsible lifting persons', docType: 'id_card' },
  },
  {
    matcher: /(?:\u0433\u0440\u0443\u0437\u043e\u043f\u043e\u0434\u044a\u0435\u043c\u043d)|(?:\u0433\u043f\u043c)/i,
    template: { key: 'tpl_09_lifting_mechanisms', name: '09. Lifting mechanisms', docType: 'id_card' },
  },
  {
    matcher: /(?:\u043f\u0440\u043e\u043c\u044b\u0448\u043b\u0435\u043d\u043d(?:\u0430\u044f|\u043e\u0439))\s+(?:\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442)/i,
    template: { key: 'tpl_04_industrial_safety', name: '04. Industrial safety', docType: 'id_card' },
  },
  {
    matcher: /(?:\u043a\u0432\u0430\u043b\u0438\u0444\u0438\u043a\u0430\u0446)/i,
    template: { key: 'tpl_05_qualification_id', name: '05. Qualification ID', docType: 'id_card' },
  },
];

const MONTHS_RUS_GENITIVE = [
  '\u044f\u043d\u0432\u0430\u0440\u044f',
  '\u0444\u0435\u0432\u0440\u0430\u043b\u044f',
  '\u043c\u0430\u0440\u0442\u0430',
  '\u0430\u043f\u0440\u0435\u043b\u044f',
  '\u043c\u0430\u044f',
  '\u0438\u044e\u043d\u044f',
  '\u0438\u044e\u043b\u044f',
  '\u0430\u0432\u0433\u0443\u0441\u0442\u0430',
  '\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f',
  '\u043e\u043a\u0442\u044f\u0431\u0440\u044f',
  '\u043d\u043e\u044f\u0431\u0440\u044f',
  '\u0434\u0435\u043a\u0430\u0431\u0440\u044f',
];

const MONTHS_KAZ = [
  '\u049b\u0430\u04a3\u0442\u0430\u0440',
  '\u0430\u049b\u043f\u0430\u043d',
  '\u043d\u0430\u0443\u0440\u044b\u0437',
  '\u0441\u04d9\u0443\u0456\u0440',
  '\u043c\u0430\u043c\u044b\u0440',
  '\u043c\u0430\u0443\u0441\u044b\u043c',
  '\u0448\u0456\u043b\u0434\u0435',
  '\u0442\u0430\u043c\u044b\u0437',
  '\u049b\u044b\u0440\u049b\u04af\u0439\u0435\u043a',
  '\u049b\u0430\u0437\u0430\u043d',
  '\u049b\u0430\u0440\u0430\u0448\u0430',
  '\u0436\u0435\u043b\u0442\u043e\u049b\u0441\u0430\u043d',
];

const MONTHS_KAZ_RUS_GENITIVE = [
  '\u049b\u0430\u04a3\u0442\u0430\u0440 / \u044f\u043d\u0432\u0430\u0440\u044f',
  '\u0430\u049b\u043f\u0430\u043d / \u0444\u0435\u0432\u0440\u0430\u043b\u044f',
  '\u043d\u0430\u0443\u0440\u044b\u0437 / \u043c\u0430\u0440\u0442\u0430',
  '\u0441\u04d9\u0443\u0456\u0440 / \u0430\u043f\u0440\u0435\u043b\u044f',
  '\u043c\u0430\u043c\u044b\u0440 / \u043c\u0430\u044f',
  '\u043c\u0430\u0443\u0441\u044b\u043c / \u0438\u044e\u043d\u044f',
  '\u0448\u0456\u043b\u0434\u0435 / \u0438\u044e\u043b\u044f',
  '\u0442\u0430\u043c\u044b\u0437 / \u0430\u0432\u0433\u0443\u0441\u0442\u0430',
  '\u049b\u044b\u0440\u049b\u04af\u0439\u0435\u043a / \u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f',
  '\u049b\u0430\u0437\u0430\u043d / \u043e\u043a\u0442\u044f\u0431\u0440\u044f',
  '\u049b\u0430\u0440\u0430\u0448\u0430 / \u043d\u043e\u044f\u0431\u0440\u044f',
  '\u0436\u0435\u043b\u0442\u043e\u049b\u0441\u0430\u043d / \u0434\u0435\u043a\u0430\u0431\u0440\u044f',
];

const INDUSTRIAL_SAFETY_TEMPLATE_KEYS = new Set([
  'tpl_04_industrial_safety',
  'tpl_06_pressure_vessels',
  'tpl_08_responsible_lifting',
  'tpl_09_lifting_mechanisms',
]);
function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function parseDateParts(value: string | null | undefined): { year: string; monthIndex: number; day: number } | null {
  if (!value) return null;
  const [datePart] = String(value).split('T');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const [year, month, day] = datePart.split('-');
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) return null;
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) return null;

  return { year, monthIndex, day: dayNumber };
}

function normalizeDate(value: string | null | undefined): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  const day = String(parts.day).padStart(2, '0');
  const month = String(parts.monthIndex + 1).padStart(2, '0');
  return `${day}.${month}.${parts.year}`;
}

function formatDateRuWords(value: string | null | undefined, includeYearSuffix = false): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.day} ${MONTHS_RUS_GENITIVE[parts.monthIndex]} ${parts.year}${includeYearSuffix ? ' года' : ''}`;
}

function formatDateKazRusWords(value: string | null | undefined): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.day} ${MONTHS_KAZ_RUS_GENITIVE[parts.monthIndex]} ${parts.year}`;
}

function formatIndustrialSafetyDay(value: string | null | undefined): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return String(parts.day).padStart(2, '0');
}

function formatIndustrialSafetyIssueDateFront(value: string | null | undefined): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.year} \u0436./ \u0433. \u00ab${formatIndustrialSafetyDay(value)}\u00bb ${MONTHS_KAZ_RUS_GENITIVE[parts.monthIndex]}`;
}

function formatIndustrialSafetyIssueDateBack(value: string | null | undefined): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `\u00ab${formatIndustrialSafetyDay(value)}\u00bb ${MONTHS_KAZ_RUS_GENITIVE[parts.monthIndex]} ${parts.year} \u0436. (\u0433.)`;
}

function formatIndustrialSafetyValidUntil(value: string | null | undefined): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.year} \u0433. (\u0436.) \u00ab${formatIndustrialSafetyDay(value)}\u00bb ${MONTHS_KAZ_RUS_GENITIVE[parts.monthIndex]}`;
}

function formatElectricalSafetyIssueDate(value: string | null | undefined): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  const day = String(parts.day).padStart(2, '0');
  return `\u00ab${day}\u00bb ${MONTHS_RUS_GENITIVE[parts.monthIndex]}/${MONTHS_KAZ[parts.monthIndex]} ${parts.year} \u0433. \u0436.`;
}

function formatCourseStartKaz(value: string | null | undefined): string {
  const parts = parseDateParts(value);
  if (!parts) return '';
  return `${parts.year} \u0436\u044b\u043b\u0493\u044b ${parts.day} ${MONTHS_KAZ[parts.monthIndex]}`;
}

function formatCourseStartRus(value: string | null | undefined): string {
  return formatDateRuWords(value, true);
}

function firstNotEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function certificateFullName(cert: Certificate): string {
  const separateFullName = [
    String(cert.last_name || '').trim(),
    String(cert.first_name || '').trim(),
    String(cert.middle_name || '').trim(),
  ].filter(Boolean).join(' ');
  return firstNotEmpty(cert.full_name, separateFullName);
}

export function resolveTemplateForCertificate(cert: Certificate): TemplateConfig | null {
  const course = normalizeText(cert.course_name);
  const category = normalizeText(cert.category);

  const hasBot = course.includes('\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u043e\u0441\u0442\u044c') && course.includes('\u043e\u0445\u0440\u0430\u043d\u0430 \u0442\u0440\u0443\u0434\u0430');
  if (hasBot) {
    if (category.includes('\u0438\u0442\u0440')) return TEMPLATE_BOT_CERT;
    return TEMPLATE_BOT_ID;
  }

  const responsibleLifting =
    course.includes('\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d') &&
    course.includes('\u0433\u0440\u0443\u0437\u043e\u043f\u043e\u0434');
  if (responsibleLifting) {
    return { key: 'tpl_08_responsible_lifting', name: '08. Responsible lifting persons', docType: 'id_card' };
  }

  const liftingMechanisms =
    course.includes('\u043f\u0440\u0438 \u0440\u0430\u0431\u043e\u0442\u0435') &&
    (course.includes('\u0433\u0440\u0443\u0437\u043e\u043f\u043e\u0434') || course.includes('\u0433\u043f\u043c'));
  if (liftingMechanisms) {
    return { key: 'tpl_09_lifting_mechanisms', name: '09. Lifting mechanisms', docType: 'id_card' };
  }

  for (const rule of TEMPLATE_RULES) {
    if (rule.matcher.test(course)) return rule.template;
  }

  return null;
}

export function templateSupportsPhoto(template: TemplateConfig | null | undefined): boolean {
  return !PHOTOLESS_TEMPLATE_KEYS.has(String(template?.key || ''));
}

export function buildPlaceholders(cert: Certificate, companyName: string, template?: TemplateConfig | null): Record<string, string> {
  const lastName = String(cert.last_name || '').trim();
  const firstName = String(cert.first_name || '').trim();
  const middleName = String(cert.middle_name || '').trim();
  const fullName = certificateFullName(cert);
  const chairman = String(cert.commission_chair || '').trim();
  const courseName = String(cert.course_name || '').trim();
  const usesLongRussianDates = template?.key === 'tpl_03_fire_tech_minimum';
  const usesIndustrialSafetyBilingualDates = INDUSTRIAL_SAFETY_TEMPLATE_KEYS.has(String(template?.key || ''));
  const usesElectricalSafetyTemplate = template?.key === TEMPLATE_ELECTRICAL_SAFETY_ID.key;
  const startDate = usesLongRussianDates ? formatDateKazRusWords(cert.start_date) : normalizeDate(cert.start_date);
  const expiryDate = usesLongRussianDates ? formatDateKazRusWords(cert.expiry_date) : normalizeDate(cert.expiry_date);
  const frontSideStartDate = usesIndustrialSafetyBilingualDates
    ? formatIndustrialSafetyIssueDateFront(cert.start_date)
    : startDate;
  const backSideStartDate = usesIndustrialSafetyBilingualDates
    ? formatIndustrialSafetyIssueDateBack(cert.start_date)
    : startDate;
  const documentValidDate = usesIndustrialSafetyBilingualDates
    ? formatIndustrialSafetyValidUntil(cert.expiry_date)
    : expiryDate;
  const electricalSafetyIssueDate = usesElectricalSafetyTemplate
    ? formatElectricalSafetyIssueDate(cert.start_date)
    : frontSideStartDate;

  const values: Record<string, string> = {
    WORK_PLACE: firstNotEmpty(companyName, cert.employee_status),
    WORKPLACE: firstNotEmpty(companyName, cert.employee_status),
    LAST_NAME: lastName,
    NAME: firstName,
    SEC_NAME: middleName,
    FIO: fullName,
    FULLNAME: fullName,
    FULL_NAME: fullName,
    POSITION: String(cert.position || '').trim(),
    POS: String(cert.position || '').trim(),
    CATEGORY: String(cert.category || '').trim(),
    COURSE_NAME: courseName,
    COURSE: courseName,
    DOC_NUM: String(cert.document_number || '').trim(),
    CERT_NUM: String(cert.document_number || '').trim(),
    PROTOCOL_NUM: String(cert.protocol_number || '').trim(),
    PROTOCOL: String(cert.protocol_number || '').trim(),
    CHAIRMAN: chairman,
    COMMISSION_CHAIR: chairman,
    COMMISSION_ALL: firstNotEmpty(cert.commission_members, chairman),
    COMMISSION: firstNotEmpty(cert.commission_members, chairman),
    COMMISSION_MEMB_1: String(cert.commission_member_1 || '').trim(),
    COMMISSION_MEMB_2: String(cert.commission_member_2 || '').trim(),
    COMMISSION_MEMB_3: String(cert.commission_member_3 || '').trim(),
    COMMISSION_MEMB_4: String(cert.commission_member_4 || '').trim(),
    COMMISSION_MEMBER_1: String(cert.commission_member_1 || '').trim(),
    COMMISSION_MEMBER_2: String(cert.commission_member_2 || '').trim(),
    COMMISSION_MEMBER_3: String(cert.commission_member_3 || '').trim(),
    COMMISSION_MEMBER_4: String(cert.commission_member_4 || '').trim(),
    QUALIFICATION: String(cert.qualification || '').trim(),
    EL_SAFE_GROUP: String(cert.electrical_safety_group || '').trim(),
    EL_SAFE_GROUP_SHRT: electricalSafetyGroupShort(cert.electrical_safety_group),
    EL_SAFE_GROUP_OLD: String(cert.previous_electrical_safety_group || '').trim(),
    EL_SAFE_APPROV: String(cert.electrical_safety_admission_protocol || '').trim(),
    LEVEL: String(cert.level || '').trim(),
    MARKER_PASS: String(cert.marker_pass || '').trim(),
    TYPE_LEARN: String(cert.type_learn || '').trim(),
    COMMIS_CONCL: String(cert.commis_concl || '').trim(),
    GRADE: String(cert.grade || '').trim(),
    GRADE_SHORT: gradeShort(cert.grade),
    MANAGER: String(cert.manager || '').trim(),
    HEAD: String(cert.manager || '').trim(),
    DATE: frontSideStartDate,
    DATE_ISSUE: frontSideStartDate,
    DATE_END: documentValidDate,
    DOC_VALID: documentValidDate,
    COURSE_START: frontSideStartDate,
    COURSE_START_MODIF: electricalSafetyIssueDate,
    COURSE_START_DIFFER: backSideStartDate,
    COURSE_START_KAZ: formatCourseStartKaz(cert.start_date),
    COURSE_START_RUS: formatCourseStartRus(cert.start_date),
  };

  const output: Record<string, string> = {};
  for (const [key, val] of Object.entries(values)) output[`{{${key}}}`] = val;
  return output;
}

export async function callGenerateDocumentFunction(input: {
  template: TemplateConfig;
  fileName: string;
  placeholders?: Record<string, string>;
  photoUrl?: string;
  items?: GenerateDocumentItem[];
}): Promise<{
  fileUrl: string;
  fileName: string;
  fileId: string;
  unresolvedCount: number;
  unresolvedTokens: string[];
  photoIssueCount: number;
  photoIssues: string[];
}> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await callGenerateDocumentFunctionOnce(input);
    } catch (error) {
      lastError = error;
      if (attempt >= 3) break;
      await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to invoke generate-document');
}

async function callGenerateDocumentFunctionOnce(input: {
  template: TemplateConfig;
  fileName: string;
  placeholders?: Record<string, string>;
  photoUrl?: string;
  items?: GenerateDocumentItem[];
}): Promise<{
  fileUrl: string;
  fileName: string;
  fileId: string;
  unresolvedCount: number;
  unresolvedTokens: string[];
  photoIssueCount: number;
  photoIssues: string[];
}> {
  const { data, error } = await supabase.functions.invoke('generate-document', {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: {
      templateKey: input.template.key,
      templateName: input.template.name,
      docType: input.template.docType,
      fileName: input.fileName,
      placeholders: input.placeholders || {},
      photoUrl: input.photoUrl || '',
      items: input.items || [],
    },
  });

  if (error) throw new Error(error.message || 'Failed to invoke generate-document');

  const fileUrl = String(data?.fileUrl || '');
  const fileName = String(data?.fileName || input.fileName);
  const fileId = String(data?.fileId || '');
  const unresolvedCount = Number(data?.unresolvedCount || 0);
  const unresolvedTokens = Array.isArray(data?.unresolvedTokens)
    ? data.unresolvedTokens.map((v: unknown) => String(v))
    : [];
  const photoIssueCount = Number(data?.photoIssueCount || 0);
  const photoIssues = Array.isArray(data?.photoIssues)
    ? data.photoIssues.map((v: unknown) => String(v))
    : [];
  if (!fileUrl) throw new Error('Google Apps Script did not return fileUrl');

  return { fileUrl, fileName, fileId, unresolvedCount, unresolvedTokens, photoIssueCount, photoIssues };
}
