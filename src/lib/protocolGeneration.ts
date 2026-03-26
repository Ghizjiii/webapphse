import { supabase } from './supabase';
import type { Certificate, Protocol, ProtocolCategoryScope } from '../types';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface ProtocolTemplateConfig {
  key: string;
  name: string;
}

export interface ProtocolGroup {
  template: ProtocolTemplateConfig;
  courseName: string;
  categoryScope: ProtocolCategoryScope;
  categoryLabel: string;
  certificates: Certificate[];
  employeesCount: number;
}

export interface GenerateProtocolItem {
  placeholders: Record<string, string>;
}

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const TEMPLATE_BOT_ITR: ProtocolTemplateConfig = {
  key: 'tpl_protocol_01_bot_itr',
  name: '01. Безопасность и охрана труда - Протокол ИТР состава',
};

const TEMPLATE_BOT_WORKER: ProtocolTemplateConfig = {
  key: 'tpl_protocol_02_bot_worker',
  name: '02. Безопасность и охрана труда - Протокол для рабочего состава',
};

const PROTOCOL_RULES: Array<{
  matcher: RegExp;
  itr?: ProtocolTemplateConfig;
  worker?: ProtocolTemplateConfig;
  all?: ProtocolTemplateConfig;
}> = [
  {
    matcher: /пожарно[\s-]?техническ.*минимум/i,
    itr: { key: 'tpl_protocol_03_fire_itr', name: '03. Пожарно-технический минимум - Протокол ИТР состава' },
    worker: { key: 'tpl_protocol_04_fire_worker', name: '04. Пожарно-технический минимум - Протокол для рабочего состава' },
  },
  {
    matcher: /промышленн.*безопасност.*сосуд.*под.*давлен/i,
    itr: { key: 'tpl_protocol_09_pressure_itr', name: '09. Промышленная безопасность при работе с сосудами под давлением - Протокол ИТР состава' },
    worker: { key: 'tpl_protocol_10_pressure_worker', name: '10. Промышленная безопасность при работе с сосудами под давлением - Протокол для рабочего состава' },
  },
  {
    matcher: /безопасн.*ведение.*работ.*на.*высоте|на.*высоте/i,
    itr: { key: 'tpl_protocol_11_height_itr', name: '11. Безопасное ведение работ на высоте - Протокол ИТР состава' },
    worker: { key: 'tpl_protocol_12_height_worker', name: '12. Безопасное ведение работ на высоте - Протокол для рабочего состава' },
  },
  {
    matcher: /ответственн.*грузопод/i,
    itr: { key: 'tpl_protocol_13_responsible_lifting_itr', name: '13. Промышленная безопасность ответственное лицо при работе с грузоподъемными механизмами - ИТР' },
  },
  {
    matcher: /грузопод|гпм/i,
    all: { key: 'tpl_protocol_14_lifting_mechanisms', name: '14. Промышленная безопасность при работе с грузоподъемными механизмами' },
  },
  {
    matcher: /квалификац/i,
    itr: { key: 'tpl_protocol_07_qualification_itr', name: '07. Квалификация - Протокол ИТР состава' },
    worker: { key: 'tpl_protocol_08_qualification_worker', name: '08. Квалификация - Протокол для рабочего состава' },
  },
  {
    matcher: /промышленн.*безопасност/i,
    itr: { key: 'tpl_protocol_05_industrial_itr', name: '05. Промышленная безопасность - Протокол ИТР состава' },
    worker: { key: 'tpl_protocol_06_industrial_worker', name: '06. Промышленная безопасность - Протокол для рабочего состава' },
  },
];

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeDate(value: string | null | undefined): string {
  if (!value) return '';
  const source = String(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return '';
  const [year, month, day] = source.split('-');
  return `${day}.${month}.${year}`;
}

function normalizeDay(value: string | null | undefined): string {
  if (!value) return '';
  const source = String(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return '';
  return source.split('-')[2];
}

function normalizeCategoryScope(category: string | null | undefined): ProtocolCategoryScope {
  const normalized = normalizeText(category);
  if (normalized.includes('итр')) return 'itr';
  return 'worker';
}

function categoryLabel(scope: ProtocolCategoryScope): string {
  if (scope === 'itr') return 'ИТР';
  if (scope === 'worker') return 'Обычный';
  return 'Все сотрудники';
}

function compareCertificates(left: Certificate, right: Certificate): number {
  return [
    String(left.last_name || '').localeCompare(String(right.last_name || ''), 'ru'),
    String(left.first_name || '').localeCompare(String(right.first_name || ''), 'ru'),
    String(left.middle_name || '').localeCompare(String(right.middle_name || ''), 'ru'),
    String(left.position || '').localeCompare(String(right.position || ''), 'ru'),
  ].find(result => result !== 0) || 0;
}

export function resolveProtocolTemplate(
  courseName: string,
  category: string | null | undefined,
): { template: ProtocolTemplateConfig; scope: ProtocolCategoryScope } | null {
  const course = normalizeText(courseName);
  const scope = normalizeCategoryScope(category);

  const hasBot = course.includes('безопасность') && course.includes('охрана') && course.includes('труд');
  if (hasBot) {
    return {
      template: scope === 'itr' ? TEMPLATE_BOT_ITR : TEMPLATE_BOT_WORKER,
      scope,
    };
  }

  for (const rule of PROTOCOL_RULES) {
    if (!rule.matcher.test(course)) continue;
    if (rule.all) return { template: rule.all, scope: 'all' };
    if (scope === 'itr' && rule.itr) return { template: rule.itr, scope: 'itr' };
    if (scope === 'worker' && rule.worker) return { template: rule.worker, scope: 'worker' };
    return null;
  }

  return null;
}

export function protocolGroupKey(params: {
  templateKey: string;
  courseName: string;
  categoryScope: ProtocolCategoryScope;
}): string {
  return `${params.templateKey}::${params.courseName}::${params.categoryScope}`;
}

export function buildProtocolGroups(certificates: Certificate[]): ProtocolGroup[] {
  const groups = new Map<string, ProtocolGroup>();

  for (const cert of certificates) {
    const courseName = String(cert.course_name || '').trim();
    if (!courseName) continue;

    const resolved = resolveProtocolTemplate(courseName, cert.category);
    if (!resolved) continue;

    const key = protocolGroupKey({
      templateKey: resolved.template.key,
      courseName,
      categoryScope: resolved.scope,
    });

    const existing = groups.get(key);
    if (existing) {
      existing.certificates.push(cert);
      continue;
    }

    groups.set(key, {
      template: resolved.template,
      courseName,
      categoryScope: resolved.scope,
      categoryLabel: categoryLabel(resolved.scope),
      certificates: [cert],
      employeesCount: 1,
    });
  }

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      certificates: [...group.certificates].sort(compareCertificates),
      employeesCount: group.certificates.length,
    }))
    .sort((left, right) => {
      const byCourse = left.courseName.localeCompare(right.courseName, 'ru');
      if (byCourse !== 0) return byCourse;
      return left.categoryLabel.localeCompare(right.categoryLabel, 'ru');
    });
}

function buildDraftProtocolRow(params: {
  group: ProtocolGroup;
  questionnaireId: string;
  dealId?: string | null;
  companyId?: string | null;
  existing?: Protocol | null;
}): Protocol {
  const { group, questionnaireId, dealId = null, companyId = null, existing = null } = params;
  const groupKey = protocolGroupKey({
    templateKey: group.template.key,
    courseName: group.courseName,
    categoryScope: group.categoryScope,
  });
  const now = new Date().toISOString();

  return {
    id: existing?.id || `draft:${groupKey}`,
    questionnaire_id: questionnaireId,
    deal_id: dealId || existing?.deal_id || null,
    company_id: companyId || existing?.company_id || null,
    bitrix_item_id: existing?.bitrix_item_id || '',
    template_key: group.template.key,
    template_name: group.template.name,
    course_name: group.courseName,
    category_scope: group.categoryScope,
    category_label: group.categoryLabel,
    protocol_number: existing?.protocol_number || '',
    protocol_date: existing?.protocol_date || null,
    employees_count: group.employeesCount,
    file_id: existing?.file_id || '',
    file_name: existing?.file_name || '',
    file_url: existing?.file_url || '',
    is_printed: existing?.is_printed || false,
    generated_at: existing?.generated_at || null,
    sync_status: existing?.sync_status || 'pending',
    sync_error: existing?.sync_error || '',
    created_at: existing?.created_at || now,
    updated_at: existing?.updated_at || now,
    group_key: groupKey,
    is_draft: !existing,
  };
}

export function buildProtocolDraftRows(params: {
  questionnaireId: string;
  dealId?: string | null;
  companyId?: string | null;
  certificates: Certificate[];
  storedProtocols?: Protocol[];
}): Protocol[] {
  const groups = buildProtocolGroups(params.certificates);
  const storedMap = new Map<string, Protocol>();

  for (const row of params.storedProtocols || []) {
    storedMap.set(
      protocolGroupKey({
        templateKey: row.template_key,
        courseName: row.course_name,
        categoryScope: row.category_scope,
      }),
      row,
    );
  }

  return groups.map(group => buildDraftProtocolRow({
    group,
    questionnaireId: params.questionnaireId,
    dealId: params.dealId,
    companyId: params.companyId,
    existing: storedMap.get(protocolGroupKey({
      templateKey: group.template.key,
      courseName: group.courseName,
      categoryScope: group.categoryScope,
    })) || null,
  }));
}

export async function reconcileProtocolsFromCertificates(params: {
  questionnaireId: string;
  dealId?: string | null;
  companyId?: string | null;
  certificates: Certificate[];
}): Promise<Protocol[]> {
  const groups = buildProtocolGroups(params.certificates);

  const { data: existingRows, error: existingError } = await supabase
    .from('protocols')
    .select('*')
    .eq('questionnaire_id', params.questionnaireId);

  if (existingError) throw existingError;

  const existingMap = new Map<string, Protocol>();
  for (const row of (existingRows || []) as Protocol[]) {
    existingMap.set(
      protocolGroupKey({
        templateKey: row.template_key,
        courseName: row.course_name,
        categoryScope: row.category_scope,
      }),
      row,
    );
  }

  const now = new Date().toISOString();
  const nextRows = groups.map(group => {
    const key = protocolGroupKey({
      templateKey: group.template.key,
      courseName: group.courseName,
      categoryScope: group.categoryScope,
    });
    const existing = existingMap.get(key);

    return {
      questionnaire_id: params.questionnaireId,
      deal_id: params.dealId || existing?.deal_id || null,
      company_id: params.companyId || existing?.company_id || null,
      bitrix_item_id: existing?.bitrix_item_id || '',
      template_key: group.template.key,
      template_name: group.template.name,
      course_name: group.courseName,
      category_scope: group.categoryScope,
      category_label: group.categoryLabel,
      protocol_number: existing?.protocol_number || '',
      protocol_date: existing?.protocol_date || null,
      employees_count: group.employeesCount,
      file_id: existing?.file_id || '',
      file_name: existing?.file_name || '',
      file_url: existing?.file_url || '',
      is_printed: existing?.is_printed || false,
      generated_at: existing?.generated_at || null,
      sync_status: existing?.sync_status || 'pending',
      sync_error: existing?.sync_error || '',
      updated_at: now,
    };
  });

  if (nextRows.length > 0) {
    const { error: upsertError } = await supabase.from('protocols').upsert(nextRows, {
      onConflict: 'questionnaire_id,template_key,course_name,category_scope',
    });
    if (upsertError) throw upsertError;
  }

  const nextKeys = new Set(nextRows.map(row => protocolGroupKey({
    templateKey: row.template_key,
    courseName: row.course_name,
    categoryScope: row.category_scope,
  })));

  const staleIds = (existingRows || [])
    .filter(row => !nextKeys.has(protocolGroupKey({
      templateKey: row.template_key,
      courseName: row.course_name,
      categoryScope: row.category_scope,
    })))
    .map(row => row.id);

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase.from('protocols').delete().in('id', staleIds);
    if (deleteError) throw deleteError;
  }

  const { data: finalRows, error: finalError } = await supabase
    .from('protocols')
    .select('*')
    .eq('questionnaire_id', params.questionnaireId)
    .order('course_name')
    .order('category_label');

  if (finalError) throw finalError;
  return buildProtocolDraftRows({
    questionnaireId: params.questionnaireId,
    dealId: params.dealId,
    companyId: params.companyId,
    certificates: params.certificates,
    storedProtocols: (finalRows || []) as Protocol[],
  });
}

export function certificatesForProtocolRow(protocol: Protocol, certificates: Certificate[]): Certificate[] {
  return certificates
    .filter(cert => {
      const resolved = resolveProtocolTemplate(cert.course_name, cert.category);
      if (!resolved) return false;
      return (
        resolved.template.key === protocol.template_key &&
        String(cert.course_name || '').trim() === protocol.course_name &&
        resolved.scope === protocol.category_scope
      );
    })
    .sort(compareCertificates);
}

export function formatProtocolDateRu(value: string | null | undefined): string {
  if (!value) return '';
  const source = String(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return '';
  const [year, month, day] = source.split('-');
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return '';
  return `«${day}» ${MONTHS_GENITIVE[monthIndex]} ${year}`;
}

export function formatProtocolDateShortRu(value: string | null | undefined): string {
  if (!value) return '';
  const source = String(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return '';
  const [year, month, day] = source.split('-');
  return `${day}.${month}.${year}`;
}

export function makeProtocolGeneratedFileName(courseName: string, categoryLabel: string): string {
  const safeCourseName = String(courseName || '').trim() || 'Протокол';
  const safeCategory = String(categoryLabel || '').trim();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${safeCourseName}${safeCategory ? ` - ${safeCategory}` : ''} - ${yyyy}-${mm}-${dd} ${hh}-${mi}`;
}

function protocolGlobalPlaceholders(params: {
  protocol: Protocol;
  companyName: string;
  certificates: Certificate[];
}): Record<string, string> {
  const first = params.certificates[0];
  const protocolDateRu = formatProtocolDateRu(params.protocol.protocol_date);

  return {
    '{{WORK_PLACE}}': String(params.companyName || '').trim(),
    '{{COURSE_NAME}}': params.protocol.course_name,
    '{{PROTOCOL_NUM}}': String(params.protocol.protocol_number || '').trim(),
    '{{PROTOCOL_DATE}}': protocolDateRu,
    '{{PROTOCOL_DATE_SHORT}}': formatProtocolDateShortRu(params.protocol.protocol_date),
    '{{PROTOCOL_DATE_DAY}}': normalizeDay(params.protocol.protocol_date),
    '{{QUALIFICATION}}': String(first?.qualification || '').trim(),
    '{{LEVEL}}': String(first?.level || '').trim(),
    '{{CHAIRMAN}}': String(first?.commission_chair || '').trim(),
    '{{COMMISSION_CHAIR}}': String(first?.commission_chair || '').trim(),
    '{{COMMISSION_MEMB_1}}': String(first?.commission_member_1 || '').trim(),
    '{{COMMISSION_MEMB_2}}': String(first?.commission_member_2 || '').trim(),
    '{{COMMISSION_MEMB_3}}': String(first?.commission_member_3 || '').trim(),
    '{{COMMISSION_MEMB_4}}': String(first?.commission_member_4 || '').trim(),
    '{{COMMISSION_ALL}}': String(first?.commission_members || '').trim(),
    '{{MANAGER}}': String(first?.manager || '').trim(),
    '{{HEAD}}': String(first?.manager || '').trim(),
  };
}

export function buildProtocolDocumentPayload(params: {
  protocol: Protocol;
  certificates: Certificate[];
  companyName: string;
}): { placeholders: Record<string, string>; items: GenerateProtocolItem[] } {
  const placeholders = protocolGlobalPlaceholders(params);
  const items = params.certificates.map((cert, index) => {
    const rowValues: Record<string, string> = {
      '{{AUTO_N}}': String(index + 1),
      '{{WORK_PLACE}}': String(params.companyName || '').trim(),
      '{{LAST_NAME}}': String(cert.last_name || '').trim(),
      '{{NAME}}': String(cert.first_name || '').trim(),
      '{{SEC_NAME}}': String(cert.middle_name || '').trim(),
      '{{POS}}': String(cert.position || '').trim(),
      '{{POSITION}}': String(cert.position || '').trim(),
      '{{CATEGORY}}': String(cert.category || '').trim(),
      '{{COURSE_NAME}}': String(cert.course_name || '').trim(),
      '{{DOC_NUM}}': String(cert.document_number || '').trim(),
      '{{PROTOCOL_NUM}}': String(params.protocol.protocol_number || '').trim(),
      '{{PROTOCOL_DATE}}': formatProtocolDateRu(params.protocol.protocol_date),
      '{{PROTOCOL_DATE_SHORT}}': formatProtocolDateShortRu(params.protocol.protocol_date),
      '{{COURSE_START}}': normalizeDate(cert.start_date),
      '{{DOC_VALID}}': normalizeDate(cert.expiry_date),
      '{{MARKER_PASS}}': String(cert.marker_pass || '').trim(),
      '{{TYPE_LEARN}}': String(cert.type_learn || '').trim(),
      '{{COMMIS_CONCL}}': String(cert.commis_concl || '').trim(),
      '{{GRADE}}': String(cert.grade || '').trim(),
      '{{QUALIFICATION}}': String(cert.qualification || '').trim(),
      '{{LEVEL}}': String(cert.level || '').trim(),
      '{{CHAIRMAN}}': String(cert.commission_chair || '').trim(),
      '{{COMMISSION_CHAIR}}': String(cert.commission_chair || '').trim(),
      '{{COMMISSION_MEMB_1}}': String(cert.commission_member_1 || '').trim(),
      '{{COMMISSION_MEMB_2}}': String(cert.commission_member_2 || '').trim(),
      '{{COMMISSION_MEMB_3}}': String(cert.commission_member_3 || '').trim(),
      '{{COMMISSION_MEMB_4}}': String(cert.commission_member_4 || '').trim(),
      '{{COMMISSION_ALL}}': String(cert.commission_members || '').trim(),
      '{{MANAGER}}': String(cert.manager || '').trim(),
      '{{HEAD}}': String(cert.manager || '').trim(),
    };

    return { placeholders: rowValues };
  });

  return { placeholders, items };
}

export async function callGenerateProtocolDocumentFunction(input: {
  template: ProtocolTemplateConfig;
  fileName: string;
  placeholders: Record<string, string>;
  items: GenerateProtocolItem[];
}): Promise<{
  fileUrl: string;
  fileName: string;
  fileId: string;
  unresolvedCount: number;
  unresolvedTokens: string[];
}> {
  const { data, error } = await supabase.functions.invoke('generate-protocol-document', {
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: {
      templateKey: input.template.key,
      templateName: input.template.name,
      fileName: input.fileName,
      placeholders: input.placeholders,
      items: input.items,
    },
  });

  if (error) throw new Error(error.message || 'Failed to invoke generate-protocol-document');

  const fileUrl = String(data?.fileUrl || '');
  const fileName = String(data?.fileName || input.fileName);
  const fileId = String(data?.fileId || '');
  const unresolvedCount = Number(data?.unresolvedCount || 0);
  const unresolvedTokens = Array.isArray(data?.unresolvedTokens)
    ? data.unresolvedTokens.map((value: unknown) => String(value))
    : [];

  if (!fileUrl) throw new Error('Google Apps Script did not return fileUrl');
  return { fileUrl, fileName, fileId, unresolvedCount, unresolvedTokens };
}
