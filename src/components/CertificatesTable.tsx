import { useMemo, useState } from 'react';
import { Plus, Trash2, CheckCircle, XCircle, FileOutput } from 'lucide-react';
import SortableHeader from './SortableHeader';
import ResizableTableContainer from './ResizableTableContainer';
import { supabase } from '../lib/supabase';
import {
  BITRIX_FIELDS,
  BITRIX_FIELDS_RAW,
  createSmartProcessItem,
  findSmartProcessEntityTypeId,
  resolveSmartProcessEnumId,
  updateSmartProcessItem,
} from '../lib/bitrix';
import { buildPlaceholders, callGenerateDocumentFunction, resolveTemplateForCertificate } from '../lib/documentGeneration';
import { useToast } from '../context/ToastContext';
import type { Certificate, Participant, SortConfig } from '../types';

interface Props {
  questionnaireId: string;
  dealId: string | null;
  companyId: string | null;
  companyName?: string;
  participants?: Participant[];
  bitrixDealId?: string | null;
  bitrixCompanyId?: string | null;
  certificates: Certificate[];
  onRefresh: () => void;
}

const TEXT_FIELDS: { key: keyof Certificate; label: string }[] = [
  { key: 'last_name', label: 'Фамилия' },
  { key: 'first_name', label: 'Имя' },
  { key: 'middle_name', label: 'Отчество' },
  { key: 'position', label: 'Должность' },
  { key: 'category', label: 'Категория' },
  { key: 'course_name', label: 'Наим. курса' },
  { key: 'document_number', label: 'Номер документа' },
  { key: 'protocol_number', label: 'Протокол' },
  { key: 'commission_chair', label: 'Председатель' },
  { key: 'commission_member_1', label: 'Член комис. 1' },
  { key: 'commission_member_2', label: 'Член комис. 2' },
  { key: 'commission_member_3', label: 'Член комис. 3' },
  { key: 'commission_member_4', label: 'Член комис. 4' },
  { key: 'commission_members', label: 'Все члены' },
  { key: 'qualification', label: 'Квалификация' },
  { key: 'manager', label: 'Руководитель' },
  { key: 'employee_status', label: 'Статус сотр.' },
];

const BULK_TEXT_FILL_FIELDS: Array<{ key: keyof Certificate; label: string }> = [
  { key: 'commission_chair', label: 'Председатель' },
  { key: 'commission_member_1', label: 'Член комиссии 1' },
  { key: 'commission_member_2', label: 'Член комиссии 2' },
  { key: 'commission_member_3', label: 'Член комиссии 3' },
  { key: 'commission_member_4', label: 'Член комиссии 4' },
  { key: 'commission_members', label: 'Все члены комиссии' },
  { key: 'qualification', label: 'Квалификация' },
  { key: 'manager', label: 'Руководитель' },
];

interface EditCell {
  certId: string;
  field: string;
}

function sortCerts(list: Certificate[], cfg: SortConfig | null): Certificate[] {
  if (!cfg) return list;
  return [...list].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[cfg.key] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[cfg.key] ?? '');
    const cmp = aVal.localeCompare(bVal, 'ru');
    return cfg.direction === 'asc' ? cmp : -cmp;
  });
}

function toBitrixDate(value: string | null): string {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : value;
}

function makeGeneratedFileName(cert: Certificate): string {
  const fio = [cert.last_name, cert.first_name, cert.middle_name].filter(Boolean).join(' ').trim() || 'Без ФИО';
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${fio} - ${stamp}`;
}

export default function CertificatesTable({
  questionnaireId,
  dealId,
  companyId,
  companyName = '',
  participants = [],
  bitrixDealId = null,
  bitrixCompanyId = null,
  certificates,
  onRefresh,
}: Props) {
  const { showToast } = useToast();

  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [syncingBitrix, setSyncingBitrix] = useState(false);
  const [generatingDocs, setGeneratingDocs] = useState(false);
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [bulkStartDate, setBulkStartDate] = useState<string>('');
  const [bulkExpiryDate, setBulkExpiryDate] = useState<string>('');

  const sorted = useMemo(() => sortCerts(certificates, sortConfig), [certificates, sortConfig]);
  const courseOptions = useMemo(
    () => Array.from(new Set(certificates.map(c => String(c.course_name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
    [certificates]
  );
  const visibleRows = useMemo(
    () => sorted.filter(c => (courseFilter === 'all' ? true : c.course_name === courseFilter)),
    [sorted, courseFilter]
  );
  const targetRowsInfo = courseFilter === 'all' ? 'все курсы' : `курс: ${courseFilter}`;
  const hasBitrixRows = useMemo(
    () => certificates.some(c => String(c.bitrix_item_id || '').trim().length > 0 || c.sync_status === 'synced'),
    [certificates]
  );
  const participantPhotoById = useMemo(() => {
    const map = new Map<string, string>();
    for (const participant of participants) {
      if (!participant.id) continue;
      map.set(participant.id, String(participant.photo_url || '').trim());
    }
    return map;
  }, [participants]);

  function handleSort(key: string) {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  }

  async function addCertificate() {
    const { error } = await supabase.from('certificates').insert({
      questionnaire_id: questionnaireId,
      deal_id: dealId,
      company_id: companyId,
      is_printed: false,
      sync_status: 'pending',
    });
    if (error) {
      showToast('error', 'Ошибка добавления');
      return;
    }
    onRefresh();
  }

  async function deleteCertificate(id: string) {
    const { error } = await supabase.from('certificates').delete().eq('id', id);
    if (error) {
      showToast('error', 'Ошибка удаления');
      return;
    }
    onRefresh();
  }

  function startEdit(certId: string, field: string, value: string) {
    setEditCell({ certId, field });
    setEditValue(value ?? '');
  }

  async function saveEdit() {
    if (!editCell) return;
    setSaving(true);
    try {
      const val = editCell.field.includes('date') ? (editValue ? editValue : null) : editValue;
      const { error } = await supabase
        .from('certificates')
        .update({ [editCell.field]: val, updated_at: new Date().toISOString() })
        .eq('id', editCell.certId);
      if (error) throw error;
      setEditCell(null);
      onRefresh();
    } catch {
      showToast('error', 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function runBulk(updates: Array<{ id: string; patch: Partial<Certificate> }>) {
    if (updates.length === 0) {
      showToast('warning', 'Нет строк для массового заполнения');
      return;
    }
    setBulkSaving(true);
    try {
      const now = new Date().toISOString();
      const results = await Promise.all(
        updates.map(({ id, patch }) =>
          supabase
            .from('certificates')
            .update({ ...patch, updated_at: now })
            .eq('id', id)
        )
      );

      const errorCount = results.filter(r => r.error).length;
      if (errorCount > 0) {
        showToast('warning', `Частично заполнено: ${updates.length - errorCount} из ${updates.length}`);
      } else {
        showToast('success', `Заполнено ${updates.length} записей (${targetRowsInfo})`);
      }
      onRefresh();
    } finally {
      setBulkSaving(false);
    }
  }

  async function bulkFillNumber(field: 'document_number' | 'protocol_number', label: string) {
    if (bulkSaving) return;
    const startRaw = window.prompt(`Начальное значение для "${label}" (${targetRowsInfo}):`, '1');
    if (startRaw === null) return;
    const start = Number(startRaw);
    if (!Number.isInteger(start) || start < 0) {
      showToast('error', 'Введите целое число >= 0');
      return;
    }
    await runBulk(
      visibleRows.map((row, index) => ({
        id: row.id,
        patch: { [field]: String(start + index) } as Partial<Certificate>,
      }))
    );
  }

  async function bulkFillText(field: keyof Certificate, label: string) {
    if (bulkSaving) return;
    const value = window.prompt(`Значение для "${label}" (${targetRowsInfo}):`, '');
    if (value === null) return;
    await runBulk(
      visibleRows.map(row => ({
        id: row.id,
        patch: { [field]: value } as Partial<Certificate>,
      }))
    );
  }

  async function bulkFillDate(field: 'start_date' | 'expiry_date', value: string) {
    if (bulkSaving) return;
    const normalized = value.trim();
    if (normalized && !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      showToast('error', 'Формат даты: YYYY-MM-DD');
      return;
    }

    await runBulk(
      visibleRows.map(row => ({
        id: row.id,
        patch: { [field]: normalized || null } as Partial<Certificate>,
      }))
    );
  }

  async function generateDocuments() {
    if (generatingDocs) return;
    if (visibleRows.length === 0) {
      showToast('warning', 'Нет строк для генерации');
      return;
    }

    setGeneratingDocs(true);
    let generated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      for (const cert of visibleRows) {
        const template = resolveTemplateForCertificate(cert);
        if (!template) {
          skipped++;
          continue;
        }

        try {
          const placeholders = buildPlaceholders(cert, companyName);
          const photoUrl = cert.participant_id ? participantPhotoById.get(cert.participant_id) : '';

          const { fileUrl, fileName } = await callGenerateDocumentFunction({
            template,
            fileName: makeGeneratedFileName(cert),
            placeholders,
            photoUrl,
          });

          await supabase.from('generated_documents').insert({
            questionnaire_id: questionnaireId,
            certificate_id: cert.id,
            company_id: companyId,
            participant_id: cert.participant_id,
            deal_id: dealId,
            bitrix_item_id: cert.bitrix_item_id || null,
            doc_type: template.docType,
            template_name: template.name,
            file_name: fileName,
            file_url: fileUrl,
            generated_at: new Date().toISOString(),
          });

          await supabase
            .from('certificates')
            .update({
              document_url: fileUrl,
              updated_at: new Date().toISOString(),
            })
            .eq('id', cert.id);

          generated++;
        } catch {
          failed++;
        }
      }

      if (generated > 0) {
        showToast('success', `Сгенерировано: ${generated}. Пропущено: ${skipped}. Ошибок: ${failed}.`);
      } else if (skipped > 0 && failed === 0) {
        showToast('warning', 'Нет подходящих шаблонов для выбранных записей');
      } else {
        showToast('error', 'Не удалось сгенерировать документы');
      }
      onRefresh();
    } finally {
      setGeneratingDocs(false);
    }
  }

  async function syncCertificatesToBitrix() {
    if (syncingBitrix) return;

    if (!bitrixDealId || !bitrixCompanyId) {
      showToast('error', 'Сначала выполните общую синхронизацию, чтобы получить ID сделки и компании в Bitrix24');
      return;
    }
    if (visibleRows.length === 0) {
      showToast('warning', 'Нет строк для отправки');
      return;
    }

    setSyncingBitrix(true);
    try {
      const entityTypeId = await findSmartProcessEntityTypeId();
      let success = 0;
      let failed = 0;

      for (const cert of visibleRows) {
        try {
          const categoryValue = (await resolveSmartProcessEnumId({
            entityTypeId,
            fieldRawName: BITRIX_FIELDS_RAW.CATEGORY,
            fieldCamelName: BITRIX_FIELDS.CATEGORY,
            value: cert.category || '',
          })) || cert.category;

          const courseValue = (await resolveSmartProcessEnumId({
            entityTypeId,
            fieldRawName: BITRIX_FIELDS_RAW.COURSE_NAME,
            fieldCamelName: BITRIX_FIELDS.COURSE_NAME,
            value: cert.course_name || '',
          })) || cert.course_name;

          const fields: Record<string, unknown> = {
            TITLE: [cert.last_name, cert.first_name, cert.middle_name, cert.course_name].filter(Boolean).join(' - '),
            [BITRIX_FIELDS.LAST_NAME]: cert.last_name || '',
            [BITRIX_FIELDS.FIRST_NAME]: cert.first_name || '',
            [BITRIX_FIELDS.MIDDLE_NAME]: cert.middle_name || '',
            [BITRIX_FIELDS.POSITION]: cert.position || '',
            [BITRIX_FIELDS.CATEGORY]: categoryValue || '',
            [BITRIX_FIELDS.COURSE_NAME]: courseValue || '',
            [BITRIX_FIELDS.COURSE_START_DATE]: toBitrixDate(cert.start_date),
            [BITRIX_FIELDS.DOCUMENT_EXPIRY_DATE]: toBitrixDate(cert.expiry_date),
            [BITRIX_FIELDS.COMMISSION_CHAIR]: cert.commission_chair || '',
            [BITRIX_FIELDS.PROTOCOL]: cert.protocol_number || '',
            [BITRIX_FIELDS.DOCUMENT_NUMBER]: cert.document_number || '',
            [BITRIX_FIELDS.COMMISSION_MEMBER_1]: cert.commission_member_1 || '',
            [BITRIX_FIELDS.COMMISSION_MEMBER_2]: cert.commission_member_2 || '',
            [BITRIX_FIELDS.COMMISSION_MEMBER_3]: cert.commission_member_3 || '',
            [BITRIX_FIELDS.COMMISSION_MEMBER_4]: cert.commission_member_4 || '',
            [BITRIX_FIELDS.COMMISSION_MEMBERS]: cert.commission_members || '',
            [BITRIX_FIELDS.QUALIFICATION]: cert.qualification || '',
            [BITRIX_FIELDS.MANAGER]: cert.manager || '',
            [BITRIX_FIELDS.IS_PRINTED]: cert.is_printed ? '1' : '0',
            [BITRIX_FIELDS.EMPLOYEE_STATUS]: cert.employee_status || '',
          };

          const existingItemId = String(cert.bitrix_item_id || '').trim();
          let finalItemId = existingItemId;

          if (/^\d+$/.test(existingItemId)) {
            await updateSmartProcessItem({
              entityTypeId,
              itemId: existingItemId,
              fields,
            });
          } else {
            finalItemId = await createSmartProcessItem({
              entityTypeId,
              dealId: bitrixDealId,
              companyId: bitrixCompanyId,
              fields,
            });
          }

          await supabase.from('certificates').update({
            bitrix_item_id: finalItemId,
            sync_status: 'synced',
            sync_error: '',
            updated_at: new Date().toISOString(),
          }).eq('id', cert.id);

          success++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e || 'sync failed');
          await supabase.from('certificates').update({
            sync_status: 'error',
            sync_error: msg,
            updated_at: new Date().toISOString(),
          }).eq('id', cert.id);
          failed++;
        }
      }

      if (failed > 0) {
        showToast('warning', `Синхронизация завершена частично: ${success} успешно, ${failed} с ошибкой`);
      } else {
        showToast('success', `Успешно отправлено в Bitrix: ${success} записей`);
      }
      onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка синхронизации';
      showToast('error', msg);
    } finally {
      setSyncingBitrix(false);
    }
  }

  function EditableCell({ certId, field, value }: { certId: string; field: string; value: string }) {
    const isEditing = editCell?.certId === certId && editCell?.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') void saveEdit();
            if (e.key === 'Escape') setEditCell(null);
          }}
          className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50 min-w-[80px]"
          disabled={saving}
        />
      );
    }
    return (
      <div
        className="px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[20px] text-xs whitespace-nowrap"
        onClick={() => startEdit(certId, field, value)}
      >
        {value || <span className="text-gray-300">-</span>}
      </div>
    );
  }

  function EditableDateCell({ certId, field, value }: { certId: string; field: string; value: string | null }) {
    const isEditing = editCell?.certId === certId && editCell?.field === field;
    const displayVal = value ? new Date(value).toLocaleDateString('ru-RU') : '';
    if (isEditing) {
      return (
        <input
          autoFocus
          type="date"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') void saveEdit();
            if (e.key === 'Escape') setEditCell(null);
          }}
          className="px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50"
          disabled={saving}
        />
      );
    }
    return (
      <div
        className="px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[20px] text-xs whitespace-nowrap"
        onClick={() => startEdit(certId, field, value?.split('T')[0] || '')}
      >
        {displayVal || <span className="text-gray-300">-</span>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-600 flex items-center gap-2">
          <span>Фильтр по курсам:</span>
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
          >
            <option value="all">Все курсы</option>
            {courseOptions.map(course => (
              <option key={course} value={course}>{course}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-gray-500">
          Массовое заполнение применяется к: <b>{targetRowsInfo}</b> ({visibleRows.length} строк)
        </span>
        <button
          onClick={() => void generateDocuments()}
          disabled={generatingDocs || bulkSaving}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <FileOutput size={13} />
          {generatingDocs ? 'Генерация...' : 'Сгенерировать документы'}
        </button>
        <button
          onClick={() => void syncCertificatesToBitrix()}
          disabled={syncingBitrix || bulkSaving}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {syncingBitrix ? 'Синхронизация...' : (hasBitrixRows ? 'Обновить данные в Bitrix' : 'Отправить в Bitrix')}
        </button>
      </div>

      <ResizableTableContainer>
        <table className="w-full text-sm" style={{ minWidth: '1600px' }}>
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              {TEXT_FIELDS.map(f => (
                <SortableHeader key={f.key} label={f.label} sortKey={f.key} sortConfig={sortConfig} onSort={handleSort} />
              ))}
              <SortableHeader label="Нач. курса" sortKey="start_date" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label="Срок документа" sortKey="expiry_date" sortConfig={sortConfig} onSort={handleSort} />
              <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Напечатан</th>
              <th className="px-4 py-3.5 w-10" />
            </tr>
            <tr className="bg-white border-b border-gray-100">
              {TEXT_FIELDS.map(f => (
                <th key={`${f.key}-bulk`} className="px-2 py-2 text-left">
                  {f.key === 'document_number' && (
                    <button
                      onClick={() => void bulkFillNumber('document_number', 'Номер документа')}
                      disabled={bulkSaving}
                      className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                    >
                      Заполнить
                    </button>
                  )}
                  {f.key === 'protocol_number' && (
                    <button
                      onClick={() => void bulkFillNumber('protocol_number', 'Протокол')}
                      disabled={bulkSaving}
                      className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                    >
                      Заполнить
                    </button>
                  )}
                  {BULK_TEXT_FILL_FIELDS.some(i => i.key === f.key) && (
                    <button
                      onClick={() => {
                        const field = BULK_TEXT_FILL_FIELDS.find(i => i.key === f.key);
                        if (!field) return;
                        void bulkFillText(field.key, field.label);
                      }}
                      disabled={bulkSaving}
                      className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                    >
                      Заполнить
                    </button>
                  )}
                </th>
              ))}
              <th className="px-2 py-2 text-left">
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={bulkStartDate}
                    onChange={e => setBulkStartDate(e.target.value)}
                    className="px-1.5 py-1 text-[11px] border border-gray-300 rounded bg-white"
                    disabled={bulkSaving}
                  />
                  <button
                    onClick={() => void bulkFillDate('start_date', bulkStartDate)}
                    disabled={bulkSaving}
                    className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                  >
                    Заполнить
                  </button>
                </div>
              </th>
              <th className="px-2 py-2 text-left">
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    value={bulkExpiryDate}
                    onChange={e => setBulkExpiryDate(e.target.value)}
                    className="px-1.5 py-1 text-[11px] border border-gray-300 rounded bg-white"
                    disabled={bulkSaving}
                  />
                  <button
                    onClick={() => void bulkFillDate('expiry_date', bulkExpiryDate)}
                    disabled={bulkSaving}
                    className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                  >
                    Заполнить
                  </button>
                </div>
              </th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(cert => (
              <tr key={cert.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                {TEXT_FIELDS.map(f => (
                  <td key={f.key} className="px-4 py-2">
                    <EditableCell certId={cert.id} field={f.key} value={String(cert[f.key] ?? '')} />
                  </td>
                ))}
                <td className="px-4 py-2">
                  <EditableDateCell certId={cert.id} field="start_date" value={cert.start_date} />
                </td>
                <td className="px-4 py-2">
                  <EditableDateCell certId={cert.id} field="expiry_date" value={cert.expiry_date} />
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${cert.is_printed ? 'text-green-600' : 'text-gray-400'}`}>
                    {cert.is_printed ? <><CheckCircle size={13} /> Да</> : <><XCircle size={13} /> Нет</>}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => void deleteCertificate(cert.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={TEXT_FIELDS.length + 4} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Нет записей. Добавьте документ или выполните синхронизацию с Bitrix24.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ResizableTableContainer>

      <button
        onClick={() => void addCertificate()}
        className="mt-4 flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
      >
        <Plus size={15} /> Добавить запись
      </button>
    </div>
  );
}
