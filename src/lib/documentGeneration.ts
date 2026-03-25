import { supabase } from './supabase';
import type { Certificate, GeneratedDocumentType } from '../types';

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

const TEMPLATE_RULES: Array<{ matcher: RegExp; template: TemplateConfig }> = [
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
    matcher: /(?:\u043a\u0432\u0430\u043b\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u043e\u043d\u043d)/i,
    template: { key: 'tpl_05_qualification_id', name: '05. Qualification ID', docType: 'id_card' },
  },
];

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeDate(value: string | null | undefined): string {
  if (!value) return '';
  const [datePart] = String(value).split('T');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '';
  const [y, m, d] = datePart.split('-');
  return `${d}.${m}.${y}`;
}

function firstNotEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
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

export function buildPlaceholders(cert: Certificate, companyName: string): Record<string, string> {
  const lastName = String(cert.last_name || '').trim();
  const firstName = String(cert.first_name || '').trim();
  const middleName = String(cert.middle_name || '').trim();
  const fullName = [lastName, firstName, middleName].filter(Boolean).join(' ');
  const chairman = String(cert.commission_chair || '').trim();
  const courseName = String(cert.course_name || '').trim();

  const values: Record<string, string> = {
    WORK_PLACE: firstNotEmpty(companyName, cert.employee_status),
    WORKPLACE: firstNotEmpty(companyName, cert.employee_status),
    LAST_NAME: lastName,
    NAME: firstName,
    SEC_NAME: middleName,
    FIO: firstNotEmpty(fullName, `${firstName} ${middleName}`.trim()),
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
    LEVEL: String(cert.level || '').trim(),
    MARKER_PASS: String(cert.marker_pass || '').trim(),
    TYPE_LEARN: String(cert.type_learn || '').trim(),
    COMMIS_CONCL: String(cert.commis_concl || '').trim(),
    GRADE: String(cert.grade || '').trim(),
    MANAGER: String(cert.manager || '').trim(),
    HEAD: String(cert.manager || '').trim(),
    DATE: normalizeDate(cert.start_date),
    DATE_ISSUE: normalizeDate(cert.start_date),
    DATE_END: normalizeDate(cert.expiry_date),
    DOC_VALID: normalizeDate(cert.expiry_date),
    COURSE_START: normalizeDate(cert.start_date),
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
