import { supabase } from './supabase';
import type {
  Certificate,
  Protocol,
  ProtocolCategoryScope,
  RefProtocolNumeratorSetting,
} from '../types';
import { electricalSafetyGroupShort, gradeShort, normalizePreviousElectricalSafetyGroup } from './electricalSafety';

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

export interface ProtocolReconcileResult {
  protocols: Protocol[];
  certificates: Certificate[];
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

const TEMPLATE_BOT_ITR: ProtocolTemplateConfig = {
  key: 'tpl_protocol_01_bot_itr',
  name: '01. Безопасность и охрана труда - Протокол ИТР состава',
};

const TEMPLATE_BOT_WORKER: ProtocolTemplateConfig = {
  key: 'tpl_protocol_02_bot_worker',
  name: '02. Безопасность и охрана труда - Протокол для рабочего состава',
};

const TEMPLATE_ELECTRICAL_SAFETY_ITR: ProtocolTemplateConfig = {
  key: 'tpl_protocol_15_electrical_safety',
  name: '15. Электробезопасность - Протокол ИТР состава',
};

const TEMPLATE_ELECTRICAL_SAFETY_WORKER: ProtocolTemplateConfig = {
  key: 'tpl_protocol_15_electrical_safety',
  name: '16. Электробезопасность - Протокол для рабочего состава',
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
    matcher: /электробезопас/i,
    itr: TEMPLATE_ELECTRICAL_SAFETY_ITR,
    worker: TEMPLATE_ELECTRICAL_SAFETY_WORKER,
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

function certificateFullName(cert: Certificate): string {
  const separateFullName = [
    String(cert.last_name || '').trim(),
    String(cert.first_name || '').trim(),
    String(cert.middle_name || '').trim(),
  ].filter(Boolean).join(' ');
  return String(cert.full_name || '').trim() || separateFullName;
}

function normalizeProtocolSequenceCourseName(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, ' ');
}

function formatDateKazRusWords(value: string | null | undefined): string {
  if (!value) return '';
  const source = String(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return '';
  const [year, month, day] = source.split('-');
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) return '';
  return `${Number(day)} ${MONTHS_KAZ_RUS_GENITIVE[monthIndex]} ${year}`;
}

function normalizeDay(value: string | null | undefined): string {
  if (!value) return '';
  const source = String(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return '';
  return source.split('-')[2];
}

export function normalizeProtocolCategoryScope(category: string | null | undefined): ProtocolCategoryScope {
  const normalized = normalizeText(category);
  if (normalized.includes('итр')) return 'itr';
  return 'worker';
}

export function protocolCategoryLabel(scope: ProtocolCategoryScope): string {
  if (scope === 'itr') return 'ИТР';
  if (scope === 'worker') return 'Обычный';
  return 'Все сотрудники';
}

export function protocolNumberSequenceKey(params: {
  courseName: string;
  categoryScope: ProtocolCategoryScope;
}): string {
  return `${normalizeProtocolSequenceCourseName(params.courseName)}::${params.categoryScope}`;
}

export function isProtocolTemplateGenerationSupported(templateKey: string | null | undefined): boolean {
  return !String(templateKey || '').trim().startsWith('manual_protocol_');
}

export function parseProtocolSequenceNumber(value: string | null | undefined): number | null {
  const normalized = String(value || '').trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function resolveProtocolStartNumber(
  settingsMap: Map<string, number>,
  courseName: string,
  categoryScope: ProtocolCategoryScope,
): number {
  const stored = settingsMap.get(protocolNumberSequenceKey({ courseName, categoryScope }));
  if (stored == null || !Number.isInteger(stored) || stored < 0) return 1;
  return stored;
}

async function loadProtocolNumeratorSettings(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('ref_protocol_numerator_settings')
    .select('*');

  if (error) throw error;

  const settingsMap = new Map<string, number>();
  for (const row of (data || []) as RefProtocolNumeratorSetting[]) {
    settingsMap.set(
      protocolNumberSequenceKey({
        courseName: row.course_name,
        categoryScope: row.category_scope,
      }),
      Number(row.start_number ?? 1),
    );
  }

  return settingsMap;
}

async function assignAutomaticProtocolNumbers<T extends {
  id?: string;
  course_name: string;
  category_scope: ProtocolCategoryScope;
  protocol_number: string;
}>(
  rows: T[],
  options: { replaceExisting?: boolean } = {},
): Promise<T[]> {
  const rowsToAssign = rows.filter(row => (
    options.replaceExisting || !String(row.protocol_number || '').trim()
  ));
  if (rowsToAssign.length === 0) return rows;

  const excludedIds = new Set(
    options.replaceExisting
      ? rowsToAssign
          .map(row => String(row.id || '').trim())
          .filter(id => id && !id.startsWith('draft:'))
      : [],
  );

  const [settingsMap, existingProtocolsResponse] = await Promise.all([
    loadProtocolNumeratorSettings(),
    supabase
      .from('protocols')
      .select('id, course_name, category_scope, protocol_number'),
  ]);

  if (existingProtocolsResponse.error) throw existingProtocolsResponse.error;

  const maxNumberByKey = new Map<string, number>();
  for (const row of existingProtocolsResponse.data || []) {
    if (excludedIds.has(String(row.id || '').trim())) continue;
    const currentNumber = parseProtocolSequenceNumber(row.protocol_number);
    if (currentNumber == null) continue;

    const key = protocolNumberSequenceKey({
      courseName: row.course_name,
      categoryScope: row.category_scope as ProtocolCategoryScope,
    });
    const currentMax = maxNumberByKey.get(key);
    if (currentMax == null || currentNumber > currentMax) {
      maxNumberByKey.set(key, currentNumber);
    }
  }

  return rows.map(row => {
    if (!options.replaceExisting && String(row.protocol_number || '').trim()) return row;

    const key = protocolNumberSequenceKey({
      courseName: row.course_name,
      categoryScope: row.category_scope,
    });
    const startNumber = resolveProtocolStartNumber(settingsMap, row.course_name, row.category_scope);
    const currentMax = maxNumberByKey.get(key);
    const nextNumber = Math.max((currentMax ?? (startNumber - 1)) + 1, startNumber);
    maxNumberByKey.set(key, nextNumber);

    return {
      ...row,
      protocol_number: String(nextNumber),
    };
  });
}

export async function assignProtocolNumbersToRows<T extends {
  id?: string;
  course_name: string;
  category_scope: ProtocolCategoryScope;
  protocol_number: string;
}>(
  rows: T[],
  options: { replaceExisting?: boolean } = {},
): Promise<T[]> {
  return assignAutomaticProtocolNumbers(rows, options);
}

function buildCertificateProtocolNumberUpdates(
  certificates: Certificate[],
  protocols: Protocol[],
): Array<{ id: string; protocol_number: string }> {
  const protocolMap = new Map<string, Protocol>();
  for (const row of protocols) {
    protocolMap.set(
      protocolGroupKey({
        templateKey: row.template_key,
        courseName: row.course_name,
        categoryScope: row.category_scope,
      }),
      row,
    );
  }

  return certificates
    .map(cert => {
      const resolved = resolveProtocolTemplate(cert.course_name, cert.category);
      if (!resolved) {
        return String(cert.protocol_number || '').trim()
          ? { id: cert.id, protocol_number: '' }
          : null;
      }

      const matchedProtocol = protocolMap.get(protocolGroupKey({
        templateKey: resolved.template.key,
        courseName: String(cert.course_name || '').trim(),
        categoryScope: resolved.scope,
      }));
      const nextProtocolNumber = String(matchedProtocol?.protocol_number || '').trim();
      return String(cert.protocol_number || '').trim() === nextProtocolNumber
        ? null
        : { id: cert.id, protocol_number: nextProtocolNumber };
    })
    .filter((item): item is { id: string; protocol_number: string } => Boolean(item));
}

export async function syncCertificateProtocolNumbers(params: {
  certificates: Certificate[];
  protocols: Protocol[];
}): Promise<Certificate[]> {
  const updates = buildCertificateProtocolNumberUpdates(params.certificates, params.protocols);
  if (updates.length === 0) return params.certificates;

  const now = new Date().toISOString();
  const results = await Promise.all(
    updates.map(update =>
      supabase
        .from('certificates')
        .update({
          protocol_number: update.protocol_number,
          updated_at: now,
        })
        .eq('id', update.id)
    ),
  );

  const firstError = results.find(result => result.error)?.error;
  if (firstError) throw firstError;

  const successIds = new Set<string>();
  for (let index = 0; index < results.length; index += 1) {
    if (!results[index]?.error) {
      successIds.add(updates[index].id);
    }
  }

  if (successIds.size === 0) return params.certificates;

  const protocolNumberById = new Map(
    updates.map(update => [update.id, update.protocol_number] as const),
  );

  return params.certificates.map(cert => (
    successIds.has(cert.id)
      ? {
          ...cert,
          protocol_number: protocolNumberById.get(cert.id) || '',
          updated_at: now,
        }
      : cert
  ));
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
  const scope = normalizeProtocolCategoryScope(category);

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
      categoryLabel: protocolCategoryLabel(resolved.scope),
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
}): Promise<ProtocolReconcileResult> {
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
  const nextRows = await assignAutomaticProtocolNumbers(groups.map(group => {
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
  }));

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

  const reconciledProtocols = buildProtocolDraftRows({
    questionnaireId: params.questionnaireId,
    dealId: params.dealId,
    companyId: params.companyId,
    certificates: params.certificates,
    storedProtocols: (finalRows || []) as Protocol[],
  });

  const nextCertificates = await syncCertificateProtocolNumbers({
    certificates: params.certificates,
    protocols: reconciledProtocols,
  });

  return {
    protocols: reconciledProtocols,
    certificates: nextCertificates,
  };
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

function formatProtocolDateShortYear(value: string | null | undefined): string {
  if (!value) return '';
  const source = String(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return '';
  const [year, month, day] = source.split('-');
  return `${day}.${month}.${year.slice(-2)}`;
}

function formatProtocolDateForTemplate(protocol: Protocol): string {
  if (protocol.template_key === 'tpl_protocol_15_electrical_safety') {
    return formatProtocolDateShortYear(protocol.protocol_date);
  }
  return formatProtocolDateRu(protocol.protocol_date);
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
  const protocolDateRu = formatProtocolDateForTemplate(params.protocol);

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
    const fullName = certificateFullName(cert);
    const rowValues: Record<string, string> = {
      '{{AUTO_N}}': String(index + 1),
      '{{WORK_PLACE}}': String(params.companyName || '').trim(),
      '{{LAST_NAME}}': String(cert.last_name || '').trim(),
      '{{NAME}}': String(cert.first_name || '').trim(),
      '{{SEC_NAME}}': String(cert.middle_name || '').trim(),
      '{{FULLNAME}}': fullName,
      '{{FIO}}': fullName,
      '{{FULL_NAME}}': fullName,
      '{{POS}}': String(cert.position || '').trim(),
      '{{POSITION}}': String(cert.position || '').trim(),
      '{{CATEGORY}}': String(cert.category || '').trim(),
      '{{COURSE_NAME}}': String(cert.course_name || '').trim(),
      '{{DOC_NUM}}': String(cert.document_number || '').trim(),
      '{{PROTOCOL_NUM}}': String(params.protocol.protocol_number || '').trim(),
      '{{PROTOCOL_DATE}}': formatProtocolDateForTemplate(params.protocol),
      '{{PROTOCOL_DATE_SHORT_YEAR}}': formatProtocolDateShortYear(params.protocol.protocol_date),
      '{{PROTOCOL_DATE_SHORT}}': formatProtocolDateShortRu(params.protocol.protocol_date),
      '{{COURSE_START}}': formatDateKazRusWords(cert.start_date),
      '{{DOC_VALID}}': formatDateKazRusWords(cert.expiry_date),
      '{{EL_SAFE_GROUP}}': String(cert.electrical_safety_group || '').trim(),
      '{{EL_SAFE_GROUP_SHRT}}': electricalSafetyGroupShort(cert.electrical_safety_group),
      '{{EL_SAFE_GROUP_OLD}}': params.protocol.template_key === 'tpl_protocol_15_electrical_safety' ? normalizePreviousElectricalSafetyGroup(cert.previous_electrical_safety_group) : '',
      '{{EL_SAFE_APPROV}}': String(cert.electrical_safety_admission_protocol || '').trim(),
      '{{MARKER_PASS}}': String(cert.marker_pass || '').trim(),
      '{{TYPE_LEARN}}': String(cert.type_learn || '').trim(),
      '{{TYPE_TRAINING}}': String(cert.type_learn || '').trim(),
      '{{COMMIS_CONCL}}': String(cert.commis_concl || '').trim(),
      '{{GRADE}}': String(cert.grade || '').trim(),
      '{{GRADE_SHORT}}': gradeShort(cert.grade),
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
