import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Plus, Trash2, CheckCircle, XCircle, FileOutput, Settings2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import ResizableTableContainer from './ResizableTableContainer';
import { supabase } from '../lib/supabase';
import {
  BITRIX_FIELDS,
  BITRIX_FIELDS_RAW,
  createSmartProcessItem,
  findSmartProcessEntityTypeId,
  resolveSmartProcessEnumId,
  updateSmartProcessItem,
} from '../lib/bitrixApi';
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
  { key: 'price', label: 'Цена' },
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
  { key: 'price', label: 'Цена' },
];

const AUX_COLUMN_LABELS: Record<string, string> = {
  start_date: 'Нач. курса',
  expiry_date: 'Срок документа',
  is_printed: 'Напечатан',
};

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  last_name: 130,
  first_name: 120,
  middle_name: 130,
  position: 130,
  category: 95,
  course_name: 240,
  document_number: 125,
  protocol_number: 110,
  commission_chair: 140,
  commission_member_1: 120,
  commission_member_2: 120,
  commission_member_3: 120,
  commission_member_4: 120,
  commission_members: 130,
  qualification: 130,
  manager: 130,
  employee_status: 90,
  price: 110,
  start_date: 125,
  expiry_date: 145,
  is_printed: 105,
  actions: 56,
};

const AUX_COLUMN_KEYS = ['start_date', 'expiry_date', 'is_printed'] as const;
type AuxColumnKey = typeof AUX_COLUMN_KEYS[number];
type ColumnKey = keyof Certificate | AuxColumnKey;
const ALL_COLUMN_KEYS: ColumnKey[] = [
  ...TEXT_FIELDS.map(f => f.key),
  ...AUX_COLUMN_KEYS,
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

function makeGeneratedFileName(courseName: string): string {
  const safeCourseName = String(courseName || '').trim() || 'Курс';
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `${safeCourseName} - ${yyyy}-${mm}-${dd} ${hh}-${mi}`;
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
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [bulkStartDate, setBulkStartDate] = useState<string>('');
  const [bulkExpiryDate, setBulkExpiryDate] = useState<string>('');
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const base: Record<string, boolean> = {};
    for (const f of TEXT_FIELDS) base[String(f.key)] = true;
    base.start_date = true;
    base.expiry_date = true;
    base.is_printed = true;
    return base;
  });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => [...ALL_COLUMN_KEYS]);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const orderedVisibleColumnKeys = useMemo(
    () => columnOrder.filter(k => visibleColumns[String(k)] !== false),
    [columnOrder, visibleColumns]
  );
  const [generationProgress, setGenerationProgress] = useState<{
    total: number;
    processed: number;
    generated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const activeColumnCount = orderedVisibleColumnKeys.length + 1;
  const tableMinWidth = useMemo(() => {
    const mainWidth = orderedVisibleColumnKeys.reduce((sum, k) => sum + (columnWidths[String(k)] || 100), 0);
    const full = mainWidth + (columnWidths.actions || 56);
    return Math.max(1600, full);
  }, [columnWidths, orderedVisibleColumnKeys]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (!columnsMenuRef.current) return;
      if (!columnsMenuRef.current.contains(e.target as Node)) {
        setColumnsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const sorted = useMemo(() => sortCerts(certificates, sortConfig), [certificates, sortConfig]);
  const courseOptions = useMemo(
    () => Array.from(new Set(certificates.map(c => String(c.course_name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
    [certificates]
  );
  const categoryOptions = useMemo(
    () => Array.from(new Set(certificates.map(c => String(c.category || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
    [certificates]
  );
  const visibleRows = useMemo(
    () => sorted.filter(c => {
      if (courseFilter !== 'all' && c.course_name !== courseFilter) return false;
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
      return true;
    }),
    [sorted, courseFilter, categoryFilter]
  );
  const targetRowsInfo = [
    courseFilter === 'all' ? 'все курсы' : `курс: ${courseFilter}`,
    categoryFilter === 'all' ? 'все категории' : `категория: ${categoryFilter}`,
  ].join(', ');
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

  function toggleColumn(key: string) {
    setVisibleColumns(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const visibleCount = Object.values(next).filter(Boolean).length;
      return visibleCount === 0 ? prev : next;
    });
  }

  function resetColumns() {
    const nextVisible: Record<string, boolean> = {};
    for (const f of TEXT_FIELDS) nextVisible[String(f.key)] = true;
    nextVisible.start_date = true;
    nextVisible.expiry_date = true;
    nextVisible.is_printed = true;
    setVisibleColumns(nextVisible);
    setColumnOrder([...ALL_COLUMN_KEYS]);
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
  }

  function beginResizeColumn(columnKey: string, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[columnKey] || 120;

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(70, startWidth + (ev.clientX - startX));
      setColumnWidths(prev => ({ ...prev, [columnKey]: next }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function moveColumn(sourceKey: string, targetKey: string) {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;
    setColumnOrder(prev => {
      const srcIndex = prev.findIndex(k => String(k) === sourceKey);
      const dstIndex = prev.findIndex(k => String(k) === targetKey);
      if (srcIndex < 0 || dstIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIndex, 1);
      next.splice(dstIndex, 0, moved);
      return next;
    });
  }


  function SortIcon({ keyName }: { keyName: string }) {
    const isActive = sortConfig?.key === keyName;
    if (!isActive) return <ChevronsUpDown size={13} className="text-gray-300" />;
    return sortConfig?.direction === 'asc'
      ? <ChevronUp size={13} className="text-blue-600" />
      : <ChevronDown size={13} className="text-blue-600" />;
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
      let val: string | number | null = editCell.field.includes('date') ? (editValue ? editValue : null) : editValue;
      if (editCell.field === 'price') {
        const normalized = String(editValue || '').replace(',', '.').trim();
        if (!normalized) {
          val = null;
        } else {
          const parsed = Number(normalized);
          if (!Number.isFinite(parsed)) {
            showToast('error', 'Цена должна быть числом');
            setSaving(false);
            return;
          }
          val = parsed;
        }
      }
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
  async function bulkFillProtocolWithMode() {
    if (bulkSaving) return;
    const modeRaw = window.prompt(
      `Режим заполнения поля "Протокол" (${targetRowsInfo}):\n1 - Автонумерация\n2 - Одинаковое значение`,
      '1'
    );
    if (modeRaw === null) return;

    const mode = modeRaw.trim();
    if (mode === '1') {
      await bulkFillNumber('protocol_number', 'Протокол');
      return;
    }

    if (mode === '2') {
      const value = window.prompt(`Введите значение для "Протокол" (${targetRowsInfo}):`, '');
      if (value === null) return;
      await runBulk(
        visibleRows.map(row => ({
          id: row.id,
          patch: { protocol_number: value } as Partial<Certificate>,
        }))
      );
      return;
    }

    showToast('warning', 'Выберите режим: 1 или 2');
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

  async function bulkFillPrice() {
    if (bulkSaving) return;
    const value = window.prompt(`Значение для "Цена" (${targetRowsInfo}):`, '');
    if (value === null) return;
    const normalized = String(value).replace(',', '.').trim();
    if (!normalized) {
      await runBulk(
        visibleRows.map(row => ({
          id: row.id,
          patch: { price: null } as Partial<Certificate>,
        }))
      );
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      showToast('error', 'Цена должна быть числом');
      return;
    }
    await runBulk(
      visibleRows.map(row => ({
        id: row.id,
        patch: { price: parsed } as Partial<Certificate>,
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
    const grouped = new Map<string, {
      template: NonNullable<ReturnType<typeof resolveTemplateForCertificate>>;
      courseName: string;
      rows: Array<{ cert: Certificate; placeholders: Record<string, string>; photoUrl: string }>;
    }>();

    let skipped = 0;
    for (const cert of visibleRows) {
      const template = resolveTemplateForCertificate(cert);
      if (!template) {
        skipped++;
        continue;
      }

      const courseName = String(cert.course_name || '').trim() || 'Без названия курса';
      const key = `${template.key}::${courseName.toLowerCase()}`;
      const group = grouped.get(key) || {
        template,
        courseName,
        rows: [],
      };

      const placeholders = buildPlaceholders(cert, companyName);
      const photoUrl = cert.participant_id ? String(participantPhotoById.get(cert.participant_id) || '') : '';
      group.rows.push({ cert, placeholders, photoUrl });
      grouped.set(key, group);
    }

    const groupList = Array.from(grouped.values());
    if (groupList.length === 0) {
      showToast('warning', 'Нет подходящих шаблонов для выбранных записей');
      setGeneratingDocs(false);
      return;
    }

    setGenerationProgress({
      total: groupList.length,
      processed: 0,
      generated: 0,
      skipped,
      failed: 0,
    });
    let generated = 0;
    let failed = 0;
    const unresolvedByFile: Array<{ fileName: string; tokens: string[] }> = [];
    const photoIssuesByFile: Array<{ fileName: string; issues: string[] }> = [];

    try {
      for (const group of groupList) {
        const template = group.template;
        try {
          const certIds = group.rows.map(r => r.cert.id);
          await supabase
            .from('generated_documents')
            .delete()
            .eq('questionnaire_id', questionnaireId)
            .in('certificate_id', certIds);

          const {
            fileUrl,
            fileName,
            unresolvedCount,
            unresolvedTokens,
            photoIssueCount,
            photoIssues,
          } = await callGenerateDocumentFunction({
            template,
            fileName: makeGeneratedFileName(group.courseName),
            items: group.rows.map(row => ({
              placeholders: row.placeholders,
              photoUrl: row.photoUrl,
            })),
          });

          if (unresolvedCount > 0) {
            unresolvedByFile.push({ fileName, tokens: unresolvedTokens });
          }
          if (photoIssueCount > 0) {
            photoIssuesByFile.push({ fileName, issues: photoIssues });
          }

          await supabase.from('generated_documents').insert(
            group.rows.map(row => ({
              questionnaire_id: questionnaireId,
              certificate_id: row.cert.id,
              company_id: companyId,
              participant_id: row.cert.participant_id,
              deal_id: dealId,
              bitrix_item_id: row.cert.bitrix_item_id || null,
              doc_type: template.docType,
              template_name: template.name,
              file_name: fileName,
              file_url: fileUrl,
              generated_at: new Date().toISOString(),
            }))
          );

          await supabase
            .from('certificates')
            .update({
              document_url: fileUrl,
              updated_at: new Date().toISOString(),
            })
            .in('id', certIds);

          generated++;
          setGenerationProgress(prev => prev ? { ...prev, processed: prev.processed + 1, generated } : prev);
        } catch {
          failed++;
          setGenerationProgress(prev => prev ? { ...prev, processed: prev.processed + 1, failed } : prev);
        }
      }

      if (generated > 0) {
        showToast('success', `Сгенерировано файлов: ${generated}. Пропущено записей: ${skipped}. Ошибок: ${failed}.`);
        if (unresolvedByFile.length > 0) {
          const preview = unresolvedByFile
            .slice(0, 2)
            .map(x => `${x.fileName}: ${x.tokens.slice(0, 4).join(', ')}`)
            .join(' | ');
          showToast('warning', `Внимание: в ${unresolvedByFile.length} файлах остались незамененные плейсхолдеры. ${preview}`);
        }
        if (photoIssuesByFile.length > 0) {
          const preview = photoIssuesByFile
            .slice(0, 2)
            .map(x => `${x.fileName}: ${x.issues.slice(0, 2).join(', ')}`)
            .join(' | ');
          showToast('warning', `Проблемы с фото в ${photoIssuesByFile.length} файлах. ${preview}`);
        }
      } else if (skipped > 0 && failed === 0) {
        showToast('warning', 'Нет подходящих шаблонов для выбранных записей');
      } else {
        showToast('error', 'Не удалось сгенерировать документы');
      }
      onRefresh();
    } finally {
      setGeneratingDocs(false);
      setTimeout(() => setGenerationProgress(null), 2200);
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
            [BITRIX_FIELDS.PRICE]: cert.price ?? '',
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
        <label className="text-xs text-gray-600 flex items-center gap-2">
          <span>Категория:</span>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
          >
            <option value="all">Все категории</option>
            {categoryOptions.map(category => (
              <option key={category} value={category}>{category}</option>
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
        <div className="relative" ref={columnsMenuRef}>
          <button
            onClick={() => setColumnsMenuOpen(v => !v)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5"
            title="Настройка столбцов"
          >
            <Settings2 size={13} />
            Колонки
          </button>
          {columnsMenuOpen && (
            <div className="absolute right-0 mt-1.5 z-20 w-72 rounded-lg border border-gray-200 bg-white shadow-lg p-3">
              <div className="text-xs font-semibold text-gray-700 mb-2">Видимость столбцов</div>
              <div className="max-h-72 overflow-auto space-y-1.5 pr-1">
                {ALL_COLUMN_KEYS.map(colKey => {
                  const key = String(colKey);
                  const textField = TEXT_FIELDS.find(v => v.key === colKey);
                  const label = textField?.label || AUX_COLUMN_LABELS[key] || key;
                  return (
                    <label key={key} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={visibleColumns[key] !== false}
                        onChange={() => toggleColumn(key)}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
              <button
                onClick={resetColumns}
                className="mt-3 w-full px-2 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                Сбросить настройки
              </button>
            </div>
          )}
        </div>
      </div>
      {generationProgress && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              Генерация документов: {generationProgress.processed}/{generationProgress.total}
            </span>
            <span>
              Успешно (файлы): {generationProgress.generated} | Пропущено: {generationProgress.skipped} | Ошибки: {generationProgress.failed}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
            <div
              className="h-full bg-emerald-500 transition-all duration-200"
              style={{
                width: `${generationProgress.total > 0 ? Math.round((generationProgress.processed / generationProgress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <ResizableTableContainer className="bg-white">
        <table className="w-full text-sm bg-white" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              {orderedVisibleColumnKeys.map((colKey) => {
                const key = String(colKey);
                const textField = TEXT_FIELDS.find(f => f.key === colKey);
                const label = textField?.label || AUX_COLUMN_LABELS[key] || key;
                const isSortable = key !== 'is_printed';
                return (
                  <th
                    key={key}
                    draggable
                    className="relative text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none hover:text-gray-900 hover:bg-gray-100/60 transition-colors whitespace-nowrap"
                    onClick={() => { if (isSortable) handleSort(key); }}
                    onDragStart={(e) => {
                      setDraggingColumn(key);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', key);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const source = e.dataTransfer.getData('text/plain') || draggingColumn || '';
                      moveColumn(source, key);
                      setDraggingColumn(null);
                    }}
                    onDragEnd={() => setDraggingColumn(null)}
                    style={{ width: columnWidths[key], minWidth: columnWidths[key], opacity: draggingColumn === key ? 0.45 : 1 }}
                  >
                    <div className="flex items-center gap-1.5">
                      {label}
                      {isSortable ? <SortIcon keyName={key} /> : null}
                    </div>
                    <div
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-30 hover:bg-blue-200/50"
                      onMouseDown={(e) => beginResizeColumn(key, e)}
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => e.preventDefault()}
                    />
                  </th>
                );
              })}
              <th className="px-4 py-3.5 w-10" />
            </tr>
            <tr className="bg-white border-b border-gray-100">
              {orderedVisibleColumnKeys.map((colKey) => {
                const key = String(colKey);
                const textField = TEXT_FIELDS.find(f => f.key === colKey);
                return (
                  <th
                    key={`${key}-bulk`}
                    className="px-2 py-2 text-left"
                    style={{ width: columnWidths[key], minWidth: columnWidths[key] }}
                  >
                    {key === 'document_number' && (
                      <button
                        onClick={() => void bulkFillNumber('document_number', 'Номер документа')}
                        disabled={bulkSaving}
                        className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                      >
                        Заполнить
                      </button>
                    )}
                    {key === 'protocol_number' && (
                      <button
                        onClick={() => void bulkFillProtocolWithMode()}
                        disabled={bulkSaving}
                        className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                      >
                        Заполнить
                      </button>
                    )}
                    {textField && BULK_TEXT_FILL_FIELDS.some(i => i.key === textField.key) && (
                      <button
                        onClick={() => {
                          if (textField.key === 'price') {
                            void bulkFillPrice();
                            return;
                          }
                          const field = BULK_TEXT_FILL_FIELDS.find(i => i.key === textField.key);
                          if (!field) return;
                          void bulkFillText(field.key, field.label);
                        }}
                        disabled={bulkSaving}
                        className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                      >
                        Заполнить
                      </button>
                    )}
                    {key === 'start_date' && (
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
                    )}
                    {key === 'expiry_date' && (
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
                    )}
                  </th>
                );
              })}
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(cert => (
              <tr key={cert.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                {orderedVisibleColumnKeys.map((colKey) => {
                  const key = String(colKey);
                  const textField = TEXT_FIELDS.find(f => f.key === colKey);

                  if (textField) {
                    return (
                      <td
                        key={key}
                        className="px-4 py-2"
                        style={{ width: columnWidths[key], minWidth: columnWidths[key] }}
                      >
                        <EditableCell certId={cert.id} field={textField.key} value={String(cert[textField.key] ?? '')} />
                      </td>
                    );
                  }

                  if (key === 'start_date') {
                    return (
                      <td key={key} className="px-4 py-2" style={{ width: columnWidths.start_date, minWidth: columnWidths.start_date }}>
                        <EditableDateCell certId={cert.id} field="start_date" value={cert.start_date} />
                      </td>
                    );
                  }

                  if (key === 'expiry_date') {
                    return (
                      <td key={key} className="px-4 py-2" style={{ width: columnWidths.expiry_date, minWidth: columnWidths.expiry_date }}>
                        <EditableDateCell certId={cert.id} field="expiry_date" value={cert.expiry_date} />
                      </td>
                    );
                  }

                  if (key === 'is_printed') {
                    return (
                      <td key={key} className="px-4 py-2" style={{ width: columnWidths.is_printed, minWidth: columnWidths.is_printed }}>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${cert.is_printed ? 'text-green-600' : 'text-gray-400'}`}>
                          {cert.is_printed ? <><CheckCircle size={13} /> Да</> : <><XCircle size={13} /> Нет</>}
                        </span>
                      </td>
                    );
                  }

                  return null;
                })}
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
                <td colSpan={activeColumnCount} className="px-4 py-8 text-center text-gray-400 text-sm">
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






