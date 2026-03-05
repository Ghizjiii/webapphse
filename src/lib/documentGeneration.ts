import { supabase } from './supabase';
import type { Certificate, GeneratedDocumentType } from '../types';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface TemplateConfig {
  key: string;
  name: string;
  docType: GeneratedDocumentType;
}

const TEMPLATE_BOT_CERT: TemplateConfig = {
  key: 'tpl_01_bot_itr_certificate',
  name: '01. Сертификат Безопасность и охрана труда для ИТР состава',
  docType: 'certificate',
};

const TEMPLATE_BOT_ID: TemplateConfig = {
  key: 'tpl_02_bot_worker_id',
  name: '02. Безопасность и охрана труда удостоверение для рабочего состава',
  docType: 'id_card',
};

const TEMPLATE_RULES: Array<{ matcher: RegExp; template: TemplateConfig }> = [
  { matcher: /пожарно[-\s]?технический минимум/i, template: { key: 'tpl_03_fire_tech_minimum', name: '03. Пожарно-технический минимум', docType: 'id_card' } },
  { matcher: /сосуд[а-я\s]*под давлен/i, template: { key: 'tpl_06_pressure_vessels', name: '06. Промышленная безопасность сосуды под давлением', docType: 'id_card' } },
  { matcher: /на высоте|безопасное ведение работ на высоте/i, template: { key: 'tpl_07_work_at_height', name: '07. Безопасное ведение работ на высоте', docType: 'id_card' } },
  { matcher: /ответственн[а-я\s]*грузоподъемн/i, template: { key: 'tpl_08_responsible_lifting', name: '08. Промышленная безопасность для ответственных лиц по грузоподъемным механизмам', docType: 'id_card' } },
  { matcher: /грузоподъемн|гпм/i, template: { key: 'tpl_09_lifting_mechanisms', name: '09. Промышленная безопасность при работе с грузоподъемными механизмами (ГПМ)', docType: 'id_card' } },
  { matcher: /промышленн[а-я\s]*безопасност/i, template: { key: 'tpl_04_industrial_safety', name: '04. Промышленная безопасность', docType: 'id_card' } },
  { matcher: /квалификационн/i, template: { key: 'tpl_05_qualification_id', name: '05. Квалификационное удостоверение', docType: 'id_card' } },
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

  if (course.includes('безопасность') && course.includes('охрана труда')) {
    if (category.includes('итр')) return TEMPLATE_BOT_CERT;
    return TEMPLATE_BOT_ID;
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

  const values: Record<string, string> = {
    WORK_PLACE: firstNotEmpty(companyName, cert.employee_status),
    LAST_NAME: lastName,
    NAME: firstName,
    SEC_NAME: middleName,
    FIO: firstNotEmpty(fullName, `${firstName} ${middleName}`.trim()),
    POS: String(cert.position || '').trim(),
    CATEGORY: String(cert.category || '').trim(),
    COURSE_NAME: String(cert.course_name || '').trim(),
    DOC_NUM: String(cert.document_number || '').trim(),
    CERT_NUM: String(cert.document_number || '').trim(),
    PROTOCOL_NUM: String(cert.protocol_number || '').trim(),
    PROTOCOL: String(cert.protocol_number || '').trim(),
    CHAIRMAN: chairman,
    COMMISSION_ALL: firstNotEmpty(cert.commission_members, chairman),
    COURSE_START: normalizeDate(cert.start_date),
    DOC_VALID: normalizeDate(cert.expiry_date),
    DATE: normalizeDate(cert.start_date),
    DATE_END: normalizeDate(cert.expiry_date),
  };

  const output: Record<string, string> = {};
  for (const [key, val] of Object.entries(values)) {
    output[`{{${key}}}`] = val;
    output[`{{${key}_1}}`] = val;
  }

  return output;
}

export async function callGenerateDocumentFunction(input: {
  template: TemplateConfig;
  fileName: string;
  placeholders: Record<string, string>;
  photoUrl?: string;
}): Promise<{ fileUrl: string; fileName: string }> {
  const { data, error } = await supabase.functions.invoke('generate-document', {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: {
      templateKey: input.template.key,
      templateName: input.template.name,
      fileName: input.fileName,
      placeholders: input.placeholders,
      photoUrl: input.photoUrl || '',
    },
  });

  if (error) {
    throw new Error(error.message || 'Ошибка вызова функции generate-document');
  }

  const fileUrl = String(data?.fileUrl || '');
  const fileName = String(data?.fileName || input.fileName);
  if (!fileUrl) {
    throw new Error('Google Apps Script не вернул ссылку на документ');
  }

  return { fileUrl, fileName };
}
