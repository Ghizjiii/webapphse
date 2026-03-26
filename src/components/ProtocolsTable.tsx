import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { supabase } from '../lib/supabase';
import {
  BITRIX_PROTOCOL_FIELDS,
  BITRIX_PROTOCOL_FIELDS_RAW,
  PROTOCOL_SMART_PROCESS_ENTITY_TYPE_ID,
  createSmartProcessItem,
  resolveProtocolSmartProcessFieldMap,
  resolveSmartProcessEnumId,
  updateSmartProcessItem,
} from '../lib/bitrix';
import {
  buildProtocolDocumentPayload,
  callGenerateProtocolDocumentFunction,
  certificatesForProtocolRow,
  makeProtocolGeneratedFileName,
  protocolGroupKey,
} from '../lib/protocolGeneration';
import type { Certificate, Protocol } from '../types';

interface Props {
  questionnaireId: string;
  dealId: string | null;
  companyId: string | null;
  companyName?: string;
  bitrixDealId?: string | null;
  bitrixCompanyId?: string | null;
  protocols: Protocol[];
  certificates: Certificate[];
  onRefresh: () => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

function sortProtocols(rows: Protocol[]): Protocol[] {
  return [...rows].sort((left, right) => {
    const byCourse = String(left.course_name || '').localeCompare(String(right.course_name || ''), 'ru');
    if (byCourse !== 0) return byCourse;
    return String(left.category_label || '').localeCompare(String(right.category_label || ''), 'ru');
  });
}

function normalizeProtocolCategoryLabel(row: Pick<Protocol, 'category_scope' | 'category_label'>): string {
  if (row.category_scope === 'itr') return 'ИТР';
  if (row.category_scope === 'worker') return 'Обычный';

  const normalizedLabel = String(row.category_label || '').trim().toLocaleLowerCase('ru');
  if (normalizedLabel.includes('итр')) return 'ИТР';
  if (normalizedLabel.includes('рабоч') || normalizedLabel.includes('обыч')) return 'Обычный';
  return 'Все сотрудники';
}

function buildProtocolBitrixTitle(row: Protocol, companyName: string): string {
  return [row.course_name, String(companyName || '').trim(), normalizeProtocolCategoryLabel(row)]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(' - ');
}

function buildProtocolFileFieldValue(fieldType: string, isMultiple: boolean, fileUrl: string): string | string[] | undefined {
  const normalizedUrl = String(fileUrl || '').trim();
  if (!normalizedUrl) return isMultiple ? [] : '';

  const normalizedType = String(fieldType || '').trim().toLowerCase();
  if (normalizedType === 'file') return undefined;

  return isMultiple ? [normalizedUrl] : normalizedUrl;
}

function getBitrixCourseEnumAliases(courseName: string): string[] {
  const normalized = String(courseName || '').trim();
  if (!normalized) return [];

  const aliases = new Set<string>([normalized]);
  const aliasMap: Record<string, string[]> = {
    'Курс квалификации': ['Курс квалификации'],
    'Промышленная безопасность при работе с грузоподъемными механизмами (ГПМ)': [
      'Промышленная безопасность при работе с грузоподъемными механизмами (ГПМ)',
      'Промышленная безопасность при работе с грузоподъёмными механизмами (ГПМ)',
    ],
    'Промышленная безопасность для ответственных лиц по грузоподъемных механизмам': [
      'Промышленная безопасность для ответственных лиц по грузоподъемных механизмам',
      'Промышленная безопасность для ответственных лиц по грузоподъёмных механизмам',
    ],
    'Промышленная безопасность сосуды под давлением': [
      'Промышленная безопасность сосуды под давлением',
      'Промышленная безопасность сосудов под давлением',
    ],
    'Промышленной безопасности на опасном производственном объекте': [
      'Промышленной безопасности на опасном производственном объекте',
      'Промышленная безопасность на опасном производственном объекте',
    ],
  };

  for (const value of aliasMap[normalized] || []) {
    aliases.add(value);
  }

  return Array.from(aliases);
}

export default function ProtocolsTable({
  questionnaireId,
  dealId,
  companyId,
  companyName = '',
  bitrixDealId = null,
  bitrixCompanyId = null,
  protocols,
  certificates,
  onRefresh,
}: Props) {
  const { showToast } = useToast();

  const [localProtocols, setLocalProtocols] = useState<Protocol[]>(protocols);
  const [courseFilter, setCourseFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkProtocolNumber, setBulkProtocolNumber] = useState('');
  const [bulkProtocolDate, setBulkProtocolDate] = useState('');
  const [progress, setProgress] = useState<{
    total: number;
    processed: number;
    generated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  useEffect(() => {
    setLocalProtocols(sortProtocols(protocols.map(row => ({
      ...row,
      category_label: normalizeProtocolCategoryLabel(row),
    }))));
  }, [protocols]);

  const courseOptions = useMemo(
    () => Array.from(new Set(localProtocols.map(row => String(row.course_name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
    [localProtocols],
  );

  const categoryOptions = useMemo(
    () => {
      const options: string[] = [];
      if (localProtocols.some(row => row.category_scope === 'itr')) options.push('ИТР');
      if (localProtocols.some(row => row.category_scope === 'worker')) options.push('Обычный');
      return options;
    },
    [localProtocols],
  );

  const visibleRows = useMemo(
    () =>
      localProtocols.filter(row => {
        if (courseFilter !== 'all' && row.course_name !== courseFilter) return false;
        if (categoryFilter === 'ИТР' && row.category_scope !== 'itr') return false;
        if (categoryFilter === 'Обычный' && row.category_scope !== 'worker') return false;
        return true;
      }),
    [localProtocols, courseFilter, categoryFilter],
  );

  function rowKey(row: Protocol): string {
    return row.group_key || protocolGroupKey({
      templateKey: row.template_key,
      courseName: row.course_name,
      categoryScope: row.category_scope,
    });
  }

  function isDraftRow(row: Protocol): boolean {
    return Boolean(row.is_draft) || String(row.id || '').startsWith('draft:');
  }

  function updateLocalRow(row: Protocol, patch: Partial<Protocol>) {
    const key = rowKey(row);
    setLocalProtocols(current => sortProtocols(current.map(item => (rowKey(item) === key ? { ...item, ...patch } : item))));
  }

  function replaceLocalRow(row: Protocol, nextRow: Protocol) {
    const key = rowKey(row);
    setLocalProtocols(current => sortProtocols(current.map(item => (rowKey(item) === key ? nextRow : item))));
  }

  async function persistProtocolRow(row: Protocol, patch: Partial<Protocol>): Promise<Protocol> {
    const nextRow: Protocol = {
      ...row,
      ...patch,
      category_label: normalizeProtocolCategoryLabel({
        category_scope: patch.category_scope ?? row.category_scope,
        category_label: String(patch.category_label ?? row.category_label ?? ''),
      }),
      questionnaire_id: questionnaireId,
      deal_id: dealId || row.deal_id || null,
      company_id: companyId || row.company_id || null,
      employees_count: Number(patch.employees_count ?? row.employees_count ?? 0),
      updated_at: new Date().toISOString(),
    };

    const payload: Record<string, unknown> = {
      questionnaire_id: nextRow.questionnaire_id,
      deal_id: nextRow.deal_id,
      company_id: nextRow.company_id,
      bitrix_item_id: nextRow.bitrix_item_id || '',
      template_key: nextRow.template_key,
      template_name: nextRow.template_name,
      course_name: nextRow.course_name,
      category_scope: nextRow.category_scope,
      category_label: nextRow.category_label,
      protocol_number: nextRow.protocol_number || '',
      protocol_date: nextRow.protocol_date || null,
      employees_count: nextRow.employees_count,
      file_id: nextRow.file_id || '',
      file_name: nextRow.file_name || '',
      file_url: nextRow.file_url || '',
      is_printed: Boolean(nextRow.is_printed),
      generated_at: nextRow.generated_at || null,
      sync_status: nextRow.sync_status || 'pending',
      sync_error: nextRow.sync_error || '',
      updated_at: nextRow.updated_at,
    };

    if (!isDraftRow(row) && row.id) {
      payload.id = row.id;
    }

    const { data, error } = await supabase
      .from('protocols')
      .upsert(payload, { onConflict: 'questionnaire_id,template_key,course_name,category_scope' })
      .select('*')
      .single();

    if (error) throw error;

    const savedRow: Protocol = {
      ...(data as Protocol),
      group_key: rowKey(nextRow),
      is_draft: false,
    };

    replaceLocalRow(row, savedRow);
    return savedRow;
  }

  async function saveProtocolField(row: Protocol, patch: Partial<Protocol>) {
    try {
      await persistProtocolRow(row, patch);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка сохранения протокола';
      showToast('error', message);
      onRefresh();
    }
  }

  async function applyBulkFields() {
    if (bulkSaving) return;
    if (visibleRows.length === 0) {
      showToast('warning', 'Нет строк протоколов для массового заполнения');
      return;
    }

    const patch: Partial<Protocol> = {};
    if (bulkProtocolNumber.trim()) patch.protocol_number = bulkProtocolNumber.trim();
    if (bulkProtocolDate) patch.protocol_date = bulkProtocolDate;

    if (Object.keys(patch).length === 0) {
      showToast('warning', 'Заполните номер протокола или дату протокола');
      return;
    }

    setBulkSaving(true);
    let success = 0;
    let failed = 0;

    for (const row of visibleRows) {
      try {
        await persistProtocolRow(row, patch);
        success += 1;
      } catch {
        failed += 1;
      }
    }

    setBulkSaving(false);
    if (failed > 0) {
      showToast('warning', `Массовое заполнение: успешно ${success}, с ошибкой ${failed}`);
    } else {
      showToast('success', `Массовое заполнение применено к ${success} строкам`);
    }
    onRefresh();
  }

  async function generateProtocols() {
    if (generating) return;
    if (visibleRows.length === 0) {
      showToast('warning', 'Нет строк протоколов для генерации');
      return;
    }

    setGenerating(true);
    setProgress({
      total: visibleRows.length,
      processed: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
    });

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (let index = 0; index < visibleRows.length; index += 1) {
      const row = visibleRows[index];
      try {
        const rowCertificates = certificatesForProtocolRow(row, certificates);
        if (rowCertificates.length === 0) {
          skipped += 1;
          showToast('warning', `${row.course_name} / ${row.category_label}: нет связанных записей`);
          continue;
        }

        if (!String(row.protocol_number || '').trim()) {
          skipped += 1;
          showToast('warning', `${row.course_name} / ${row.category_label}: заполните номер протокола`);
          continue;
        }

        if (!row.protocol_date) {
          skipped += 1;
          showToast('warning', `${row.course_name} / ${row.category_label}: заполните дату протокола`);
          continue;
        }

        const payload = buildProtocolDocumentPayload({
          protocol: row,
          certificates: rowCertificates,
          companyName,
        });

        const result = await callGenerateProtocolDocumentFunction({
          template: {
            key: row.template_key,
            name: row.template_name,
          },
          fileName: makeProtocolGeneratedFileName(row.course_name, row.category_label),
          placeholders: payload.placeholders,
          items: payload.items,
        });

        await persistProtocolRow(row, {
          file_id: result.fileId,
          file_name: result.fileName,
          file_url: result.fileUrl,
          generated_at: new Date().toISOString(),
        });

        generated += 1;

        if (result.unresolvedCount > 0) {
          showToast('warning', `${row.course_name}: осталось незаполненных плейсхолдеров ${result.unresolvedCount}`);
        }
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : 'Ошибка генерации';
        showToast('error', `${row.course_name}: ${message}`);
      } finally {
        setProgress(current => current
          ? {
              ...current,
              processed: index + 1,
              generated,
              skipped,
              failed,
            }
          : current);
      }
    }

    setGenerating(false);
    showToast('success', `Сгенерировано: ${generated}. Пропущено: ${skipped}. Ошибок: ${failed}.`);
    onRefresh();
  }

  async function syncProtocolsToBitrix() {
    if (syncing) return;
    if (!bitrixDealId || !bitrixCompanyId) {
      showToast('error', 'Нет связи со сделкой и компанией Bitrix24');
      return;
    }
    if (visibleRows.length === 0) {
      showToast('warning', 'Нет строк протоколов для синхронизации');
      return;
    }

    setSyncing(true);
    let success = 0;
    let failed = 0;
    const warnings = new Set<string>();

    try {
      const protocolFieldMap = await resolveProtocolSmartProcessFieldMap(PROTOCOL_SMART_PROCESS_ENTITY_TYPE_ID);

      const numberFieldKey = protocolFieldMap.number?.key || BITRIX_PROTOCOL_FIELDS.NUMBER;
      const dateFieldKey = protocolFieldMap.date?.key || BITRIX_PROTOCOL_FIELDS.DATE;
      const courseFieldKey = protocolFieldMap.course?.key || BITRIX_PROTOCOL_FIELDS.COURSE;
      const courseFieldRawName = protocolFieldMap.course?.upperName || BITRIX_PROTOCOL_FIELDS_RAW.COURSE;
      const titleFieldKey = protocolFieldMap.title?.key || 'title';
      const isPrintedFieldKey = protocolFieldMap.isPrinted?.key;

      for (const row of visibleRows) {
        try {
          const courseEnumId = await resolveSmartProcessEnumId({
            entityTypeId: PROTOCOL_SMART_PROCESS_ENTITY_TYPE_ID,
            fieldRawName: courseFieldRawName,
            fieldCamelName: courseFieldKey,
            value: row.course_name,
            aliases: getBitrixCourseEnumAliases(row.course_name),
            forceRefresh: true,
          });

          const baseFields: Record<string, unknown> = {
            [titleFieldKey]: buildProtocolBitrixTitle(row, companyName),
            [numberFieldKey]: String(row.protocol_number || '').trim(),
            [dateFieldKey]: row.protocol_date || null,
          };

          if (isPrintedFieldKey) {
            baseFields[isPrintedFieldKey] = row.is_printed ? '1' : '0';
          }

          const fileFieldValue = protocolFieldMap.file
            ? buildProtocolFileFieldValue(protocolFieldMap.file.type, protocolFieldMap.file.isMultiple, row.file_url || '')
            : undefined;
          if (fileFieldValue !== undefined && protocolFieldMap.file) {
            baseFields[protocolFieldMap.file.key] = fileFieldValue;
          } else if (protocolFieldMap.file && String(row.file_url || '').trim()) {
            warnings.add(`Поле "Файл протокола" в Bitrix имеет тип "${protocolFieldMap.file.type || 'unknown'}", ссылка для "${row.course_name}" не была записана.`);
          }

          const fields: Record<string, unknown> = {
            ...baseFields,
          };

          if (courseEnumId) {
            fields[courseFieldKey] = courseEnumId;
          } else if (protocolFieldMap.course && protocolFieldMap.course.type !== 'enumeration') {
            fields[courseFieldKey] = row.course_name;
          } else if (String(row.course_name || '').trim()) {
            warnings.add(`В Bitrix нет варианта поля "Курс" для "${row.course_name}". Название элемента обновлено, но поле курса может остаться пустым.`);
          }

          let bitrixItemId = String(row.bitrix_item_id || '').trim();
          const runSync = async (payload: Record<string, unknown>) => {
            if (bitrixItemId) {
              await updateSmartProcessItem({
                entityTypeId: PROTOCOL_SMART_PROCESS_ENTITY_TYPE_ID,
                itemId: bitrixItemId,
                fields: payload,
              });
              return;
            }

            bitrixItemId = await createSmartProcessItem({
              entityTypeId: PROTOCOL_SMART_PROCESS_ENTITY_TYPE_ID,
              dealId: bitrixDealId,
              companyId: bitrixCompanyId,
              fields: payload,
            });
          };

          if (courseEnumId || !protocolFieldMap.course || protocolFieldMap.course.type !== 'enumeration') {
            await runSync(fields);
          } else {
            try {
              await runSync({
                ...fields,
                [courseFieldKey]: row.course_name,
              });
            } catch {
              await runSync(baseFields);
            }
          }

          await persistProtocolRow(row, {
            bitrix_item_id: bitrixItemId,
            sync_status: 'synced',
            sync_error: '',
          });
          success += 1;
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : 'Ошибка синхронизации';
          try {
            await persistProtocolRow(row, {
              sync_status: 'error',
              sync_error: message,
            });
          } catch {
            updateLocalRow(row, { sync_status: 'error', sync_error: message });
          }
        }
      }

      if (warnings.size > 0) {
        showToast('warning', Array.from(warnings).slice(0, 2).join(' '));
      }
      if (failed > 0) {
        showToast('warning', `Bitrix24: успешно ${success}, с ошибкой ${failed}`);
      } else {
        showToast('success', `Bitrix24: обновлено ${success} протоколов`);
      }
    } finally {
      setSyncing(false);
    }
    onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Курс</label>
            <select
              value={courseFilter}
              onChange={e => setCourseFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">Все курсы</option>
              {courseOptions.map(course => (
                <option key={course} value={course}>{course}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Категория</label>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">Все категории</option>
              {categoryOptions.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void syncProtocolsToBitrix()}
            disabled={syncing}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {syncing ? 'Синхронизация...' : 'Обновить данные в Bitrix'}
          </button>
          <button
            onClick={() => void generateProtocols()}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-60"
          >
            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Генерация...' : 'Сгенерировать протоколы'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Номер протокола</label>
            <input
              value={bulkProtocolNumber}
              onChange={e => setBulkProtocolNumber(e.target.value)}
              placeholder="Например, 58/1"
              className="w-40 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Дата протокола</label>
            <input
              type="date"
              value={bulkProtocolDate}
              onChange={e => setBulkProtocolDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            />
          </div>
          <button
            onClick={() => void applyBulkFields()}
            disabled={bulkSaving || visibleRows.length === 0}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {bulkSaving ? 'Сохраняем...' : 'Применить к отфильтрованным'}
          </button>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          Массовое заполнение применяется к {visibleRows.length} строкам по текущим фильтрам.
        </div>
      </div>

      {progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Обработано {progress.processed} из {progress.total}</span>
            <span>Успешно {progress.generated} | Пропущено {progress.skipped} | Ошибок {progress.failed}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">№</th>
              <th className="px-4 py-3 text-left font-medium">Курс</th>
              <th className="px-4 py-3 text-left font-medium">Категория</th>
              <th className="px-4 py-3 text-left font-medium">Кол-во сотрудников</th>
              <th className="px-4 py-3 text-left font-medium">Номер протокола</th>
              <th className="px-4 py-3 text-left font-medium">Дата протокола</th>
              <th className="px-4 py-3 text-left font-medium">Последняя генерация</th>
              <th className="px-4 py-3 text-left font-medium">Файл</th>
              <th className="px-4 py-3 text-left font-medium">Синхронизация</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const currentRowKey = rowKey(row);
              return (
                <tr key={currentRowKey} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                  <td className="px-4 py-3 text-gray-900">{row.course_name}</td>
                  <td className="px-4 py-3 text-gray-700">{row.category_label}</td>
                  <td className="px-4 py-3 font-medium text-gray-700">{row.employees_count}</td>
                  <td className="px-4 py-3">
                    <input
                      value={row.protocol_number || ''}
                      onChange={e => updateLocalRow(row, { protocol_number: e.target.value })}
                      onBlur={() => void saveProtocolField(row, { protocol_number: row.protocol_number || '' })}
                      className="w-32 px-2 py-1.5 border border-gray-300 rounded-lg"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      value={row.protocol_date || ''}
                      onChange={e => updateLocalRow(row, { protocol_date: e.target.value || null })}
                      onBlur={() => void saveProtocolField(row, { protocol_date: row.protocol_date || null })}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg"
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatDateTime(row.generated_at)}</td>
                  <td className="px-4 py-3">
                    {row.file_url ? (
                      <a
                        href={row.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        Открыть <ExternalLink size={13} />
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className={`text-xs font-medium ${
                      row.sync_status === 'synced'
                        ? 'text-green-600'
                        : row.sync_status === 'error'
                          ? 'text-red-600'
                          : 'text-gray-500'
                    }`}>
                      {row.sync_status === 'synced' ? 'Синхронизирован' : row.sync_status === 'error' ? 'Ошибка' : 'Ожидает'}
                    </div>
                    {row.bitrix_item_id && (
                      <div className="text-xs text-gray-500 mt-1">ID #{row.bitrix_item_id}</div>
                    )}
                    {row.sync_error && (
                      <div className="text-xs text-red-500 mt-1 max-w-56 break-words">{row.sync_error}</div>
                    )}
                  </td>
                </tr>
              );
            })}

            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                  Нет строк протоколов для текущих фильтров
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
