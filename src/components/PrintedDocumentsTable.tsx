import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { ExternalLink, CheckCircle, XCircle, RefreshCw, Settings2 } from 'lucide-react';
import ResizableTableContainer from './ResizableTableContainer';
import { supabase } from '../lib/supabase';
import { BITRIX_FIELDS, findSmartProcessEntityTypeId, updateSmartProcessItem } from '../lib/bitrix';
import { useToast } from '../context/ToastContext';
import type { Certificate, GeneratedDocument } from '../types';

interface Props {
  documents: GeneratedDocument[];
  certificates: Certificate[];
  bitrixDealId?: string | null;
  bitrixCompanyId?: string | null;
  onRefresh: () => void;
}

type DocFilter = 'all' | 'certificate' | 'id_card';
type CategoryFilter = 'all' | string;

type GroupedDocument = {
  id: string;
  docType: 'certificate' | 'id_card';
  templateName: string;
  fileName: string;
  fileUrl: string;
  generatedAt: string;
  documents: GeneratedDocument[];
  certificates: Certificate[];
  courses: string[];
  categories: string[];
  employeesCount: number;
};

type ColumnKey =
  | 'doc_type'
  | 'template_name'
  | 'file_name'
  | 'courses'
  | 'categories'
  | 'employees'
  | 'generated_at'
  | 'file_url'
  | 'is_printed';

const COLUMN_DEFS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'doc_type', label: 'Тип' },
  { key: 'template_name', label: 'Шаблон' },
  { key: 'file_name', label: 'Файл' },
  { key: 'courses', label: 'Курс' },
  { key: 'categories', label: 'Категория' },
  { key: 'employees', label: 'Сотрудников' },
  { key: 'generated_at', label: 'Дата генерации' },
  { key: 'file_url', label: 'Ссылка' },
  { key: 'is_printed', label: 'Напечатан' },
];

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  doc_type: 130,
  template_name: 180,
  file_name: 330,
  courses: 360,
  categories: 140,
  employees: 110,
  generated_at: 180,
  file_url: 140,
  is_printed: 160,
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

export default function PrintedDocumentsTable({
  documents,
  certificates,
  bitrixDealId = null,
  bitrixCompanyId = null,
  onRefresh,
}: Props) {
  const { showToast } = useToast();

  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [savingPrinted, setSavingPrinted] = useState(false);
  const [syncingBitrix, setSyncingBitrix] = useState(false);

  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() =>
    Object.fromEntries(COLUMN_DEFS.map(c => [c.key, true])) as Record<ColumnKey, boolean>
  );
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => COLUMN_DEFS.map(c => c.key));
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

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

  const certById = useMemo(() => {
    const map = new Map<string, Certificate>();
    for (const cert of certificates) map.set(cert.id, cert);
    return map;
  }, [certificates]);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, GroupedDocument>();

    for (const doc of documents) {
      const key = `${doc.file_url}::${doc.file_name}`;
      const existing = groups.get(key);

      if (!existing) {
        groups.set(key, {
          id: doc.id,
          docType: doc.doc_type,
          templateName: doc.template_name || '',
          fileName: doc.file_name || '',
          fileUrl: doc.file_url || '',
          generatedAt: doc.generated_at,
          documents: [doc],
          certificates: [],
          courses: [],
          categories: [],
          employeesCount: Number(doc.employees_count || 0),
        });
        continue;
      }

      existing.documents.push(doc);
      existing.employeesCount = Math.max(existing.employeesCount, Number(doc.employees_count || 0));
      if (new Date(doc.generated_at).getTime() > new Date(existing.generatedAt).getTime()) {
        existing.generatedAt = doc.generated_at;
      }
    }

    for (const group of groups.values()) {
      const certs: Certificate[] = [];
      const courseSet = new Set<string>();
      const categorySet = new Set<string>();

      for (const doc of group.documents) {
        const docCourse = String(doc.course_name || '').trim();
        if (docCourse) courseSet.add(docCourse);

        const docCategory = String(doc.category || '').trim();
        if (docCategory) categorySet.add(docCategory);

        if (!doc.certificate_id) continue;
        const cert = certById.get(doc.certificate_id);
        if (!cert) continue;
        certs.push(cert);

        const course = String(cert.course_name || '').trim();
        if (course) courseSet.add(course);

        const category = String(cert.category || '').trim();
        if (category) categorySet.add(category);
      }

      group.certificates = certs;
      group.courses = Array.from(courseSet).sort((a, b) => a.localeCompare(b, 'ru'));
      group.categories = Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'ru'));
      group.employeesCount = Math.max(group.employeesCount, certs.length);
    }

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    );
  }, [documents, certById]);

  const courseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const group of groupedDocuments) {
      for (const course of group.courses) set.add(course);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [groupedDocuments]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const group of groupedDocuments) {
      for (const category of group.categories) set.add(category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [groupedDocuments]);

  const filteredGroups = useMemo(() => {
    return groupedDocuments.filter(group => {
      if (docFilter !== 'all' && group.docType !== docFilter) return false;
      if (courseFilter !== 'all' && !group.courses.includes(courseFilter)) return false;
      if (categoryFilter !== 'all' && !group.categories.includes(categoryFilter)) return false;
      return true;
    });
  }, [groupedDocuments, docFilter, courseFilter, categoryFilter]);

  const printedCertificatesForSync = useMemo(() => {
    const map = new Map<string, Certificate>();
    for (const group of filteredGroups) {
      for (const cert of group.certificates) {
        if (!cert.is_printed) continue;
        const bitrixId = String(cert.bitrix_item_id || '').trim();
        if (!bitrixId) continue;
        map.set(cert.id, cert);
      }
    }
    return Array.from(map.values());
  }, [filteredGroups]);

  const orderedVisibleColumnKeys = useMemo(
    () => columnOrder.filter(k => visibleColumns[k]),
    [columnOrder, visibleColumns]
  );

  const tableMinWidth = useMemo(() => {
    const base = orderedVisibleColumnKeys.reduce((sum, k) => sum + (columnWidths[k] || 100), 0);
    return Math.max(1200, base);
  }, [orderedVisibleColumnKeys, columnWidths]);

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const visibleCount = Object.values(next).filter(Boolean).length;
      return visibleCount === 0 ? prev : next;
    });
  }

  function resetColumns() {
    setVisibleColumns(Object.fromEntries(COLUMN_DEFS.map(c => [c.key, true])) as Record<ColumnKey, boolean>);
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
    setColumnOrder(COLUMN_DEFS.map(c => c.key));
  }

  function beginResizeColumn(columnKey: ColumnKey, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[columnKey] || 120;

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(80, startWidth + (ev.clientX - startX));
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
      const srcIndex = prev.findIndex(k => k === sourceKey);
      const dstIndex = prev.findIndex(k => k === targetKey);
      if (srcIndex < 0 || dstIndex < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(srcIndex, 1);
      next.splice(dstIndex, 0, moved);
      return next;
    });
  }

  async function togglePrinted(group: GroupedDocument, nextPrinted: boolean) {
    const certIds = group.certificates.map(c => c.id);
    if (certIds.length === 0) return;

    setSavingPrinted(true);
    try {
      const { error } = await supabase
        .from('certificates')
        .update({ is_printed: nextPrinted, updated_at: new Date().toISOString() })
        .in('id', certIds);
      if (error) throw error;

      showToast(
        'success',
        nextPrinted
          ? `Статус "Напечатан" включен для ${certIds.length} записей`
          : `Статус "Напечатан" выключен для ${certIds.length} записей`
      );
      onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка обновления статуса';
      showToast('error', msg);
    } finally {
      setSavingPrinted(false);
    }
  }

  async function syncPrintedToBitrix() {
    if (syncingBitrix) return;

    if (!bitrixDealId || !bitrixCompanyId) {
      showToast('error', 'Сначала выполните синхронизацию анкеты в Bitrix24 (нет ID сделки/компании)');
      return;
    }

    if (printedCertificatesForSync.length === 0) {
      showToast('warning', 'Нет записей для обновления в Bitrix24');
      return;
    }

    setSyncingBitrix(true);
    try {
      const entityTypeId = await findSmartProcessEntityTypeId();
      let success = 0;
      let failed = 0;

      for (const cert of printedCertificatesForSync) {
        const itemId = String(cert.bitrix_item_id || '').trim();
        if (!itemId) continue;
        try {
          await updateSmartProcessItem({
            entityTypeId,
            itemId,
            fields: {
              [BITRIX_FIELDS.IS_PRINTED]: '1',
            },
          });
          success++;
        } catch {
          failed++;
        }
      }

      if (failed > 0) {
        showToast('warning', `Частично обновлено в Bitrix24: ${success} успешно, ${failed} с ошибкой`);
      } else {
        showToast('success', `Bitrix24 обновлен: ${success} записей (поле "Напечатан" = Да)`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка синхронизации';
      showToast('error', msg);
    } finally {
      setSyncingBitrix(false);
    }
  }

  function renderCell(group: GroupedDocument, key: ColumnKey) {
    const certCount = group.certificates.length;
    const printedCount = group.certificates.filter(c => c.is_printed).length;
    const allPrinted = certCount > 0 && printedCount === certCount;

    if (key === 'doc_type') {
      return group.docType === 'certificate' ? 'Сертификат' : 'Удостоверение';
    }
    if (key === 'template_name') return group.templateName || '-';
    if (key === 'file_name') return group.fileName || '-';
    if (key === 'courses') return group.courses.join(', ') || '-';
    if (key === 'categories') return group.categories.join(', ') || '-';
    if (key === 'employees') return group.employeesCount || certCount || 0;
    if (key === 'generated_at') return formatDateTime(group.generatedAt);
    if (key === 'file_url') {
      return (
        <a
          href={group.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
        >
          Открыть <ExternalLink size={12} />
        </a>
      );
    }
    if (key === 'is_printed') {
      return certCount > 0 ? (
        <button
          onClick={() => void togglePrinted(group, !allPrinted)}
          disabled={savingPrinted}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${
            allPrinted
              ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
              : 'border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100'
          }`}
        >
          {allPrinted ? <CheckCircle size={13} /> : <XCircle size={13} />}
          {allPrinted ? `Да (${printedCount}/${certCount})` : `Нет (${printedCount}/${certCount})`}
        </button>
      ) : <span className="text-gray-400">-</span>;
    }
    return '-';
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-600 flex items-center gap-2">
          <span>Тип документа:</span>
          <select
            value={docFilter}
            onChange={e => setDocFilter(e.target.value as DocFilter)}
            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
          >
            <option value="all">Все</option>
            <option value="id_card">Удостоверения</option>
            <option value="certificate">Сертификаты</option>
          </select>
        </label>

        <label className="text-xs text-gray-600 flex items-center gap-2">
          <span>Курс:</span>
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

        <button
          onClick={() => void syncPrintedToBitrix()}
          disabled={syncingBitrix}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={syncingBitrix ? 'animate-spin' : ''} />
          {syncingBitrix ? 'Обновление...' : 'Обновить статус "Напечатан" в Bitrix24'}
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
                {COLUMN_DEFS.map(col => (
                  <label key={col.key} className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.key]}
                      onChange={() => toggleColumn(col.key)}
                    />
                    <span>{col.label}</span>
                  </label>
                ))}
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

      <ResizableTableContainer className="bg-white" initialHeight={700} minHeight={560}>
        <table className="w-full text-sm bg-white" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {orderedVisibleColumnKeys.map(colKey => {
                const def = COLUMN_DEFS.find(c => c.key === colKey);
                if (!def) return null;
                return (
                  <th
                    key={colKey}
                    draggable
                    className="relative text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600 whitespace-nowrap"
                    style={{ width: columnWidths[colKey], minWidth: columnWidths[colKey], opacity: draggingColumn === colKey ? 0.45 : 1 }}
                    onDragStart={(e) => {
                      setDraggingColumn(colKey);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', colKey);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const source = e.dataTransfer.getData('text/plain') || draggingColumn || '';
                      moveColumn(source, colKey);
                      setDraggingColumn(null);
                    }}
                    onDragEnd={() => setDraggingColumn(null)}
                  >
                    {def.label}
                    <div
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-30 hover:bg-blue-200/50"
                      onMouseDown={(e) => beginResizeColumn(colKey, e)}
                      onDragStart={(e) => e.preventDefault()}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredGroups.map(group => (
              <tr key={group.id} className="border-b border-gray-50 last:border-b-0">
                {orderedVisibleColumnKeys.map(colKey => (
                  <td
                    key={`${group.id}-${colKey}`}
                    className="px-4 py-2 text-xs text-gray-700"
                    style={{ width: columnWidths[colKey], minWidth: columnWidths[colKey] }}
                  >
                    {renderCell(group, colKey)}
                  </td>
                ))}
              </tr>
            ))}
            {filteredGroups.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, orderedVisibleColumnKeys.length)} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Сгенерированные документы пока отсутствуют.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ResizableTableContainer>
    </div>
  );
}
