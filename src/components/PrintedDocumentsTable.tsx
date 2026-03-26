import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { ExternalLink, Settings2 } from 'lucide-react';
import ResizableTableContainer from './ResizableTableContainer';
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
  fileUrl: string;
  generatedAt: string;
  documents: GeneratedDocument[];
  certificates: Certificate[];
  courses: string[];
  categories: string[];
  employeesCount: number;
};

type ColumnKey =
  | 'row_number'
  | 'doc_type'
  | 'courses'
  | 'categories'
  | 'employees'
  | 'generated_at'
  | 'file_url';

const COLUMN_DEFS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'row_number', label: '№' },
  { key: 'doc_type', label: 'Тип' },
  { key: 'courses', label: 'Курс' },
  { key: 'categories', label: 'Категория' },
  { key: 'employees', label: 'Кол-во сотрудников' },
  { key: 'generated_at', label: 'Дата генерации' },
  { key: 'file_url', label: 'Файл' },
];

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  row_number: 60,
  doc_type: 130,
  courses: 420,
  categories: 180,
  employees: 150,
  generated_at: 180,
  file_url: 140,
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

export default function PrintedDocumentsTable({ documents, certificates }: Props) {
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(
    () => Object.fromEntries(COLUMN_DEFS.map(column => [column.key, true])) as Record<ColumnKey, boolean>,
  );
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => COLUMN_DEFS.map(column => column.key));
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (!columnsMenuRef.current) return;
      if (!columnsMenuRef.current.contains(event.target as Node)) {
        setColumnsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const certById = useMemo(() => {
    const map = new Map<string, Certificate>();
    for (const cert of certificates) {
      map.set(cert.id, cert);
    }
    return map;
  }, [certificates]);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, GroupedDocument>();

    for (const document of documents) {
      const key = `${document.file_url}::${document.file_name}`;
      const existing = groups.get(key);

      if (!existing) {
        groups.set(key, {
          id: document.id,
          docType: document.doc_type,
          fileUrl: document.file_url || '',
          generatedAt: document.generated_at,
          documents: [document],
          certificates: [],
          courses: [],
          categories: [],
          employeesCount: Number(document.employees_count || 0),
        });
        continue;
      }

      existing.documents.push(document);
      existing.employeesCount = Math.max(existing.employeesCount, Number(document.employees_count || 0));

      if (new Date(document.generated_at).getTime() > new Date(existing.generatedAt).getTime()) {
        existing.generatedAt = document.generated_at;
      }
    }

    for (const group of groups.values()) {
      const groupCertificates: Certificate[] = [];
      const courseSet = new Set<string>();
      const categorySet = new Set<string>();

      for (const document of group.documents) {
        const docCourse = String(document.course_name || '').trim();
        if (docCourse) courseSet.add(docCourse);

        const docCategory = String(document.category || '').trim();
        if (docCategory) categorySet.add(docCategory);

        if (!document.certificate_id) continue;
        const cert = certById.get(document.certificate_id);
        if (!cert) continue;

        groupCertificates.push(cert);

        const certCourse = String(cert.course_name || '').trim();
        if (certCourse) courseSet.add(certCourse);

        const certCategory = String(cert.category || '').trim();
        if (certCategory) categorySet.add(certCategory);
      }

      group.certificates = groupCertificates;
      group.courses = Array.from(courseSet).sort((left, right) => left.localeCompare(right, 'ru'));
      group.categories = Array.from(categorySet).sort((left, right) => left.localeCompare(right, 'ru'));
      group.employeesCount = Math.max(group.employeesCount, groupCertificates.length);
    }

    return Array.from(groups.values()).sort(
      (left, right) => new Date(right.generatedAt).getTime() - new Date(left.generatedAt).getTime(),
    );
  }, [documents, certById]);

  const courseOptions = useMemo(() => {
    const values = new Set<string>();
    for (const group of groupedDocuments) {
      for (const course of group.courses) {
        values.add(course);
      }
    }
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'ru'));
  }, [groupedDocuments]);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const group of groupedDocuments) {
      for (const category of group.categories) {
        values.add(category);
      }
    }
    return Array.from(values).sort((left, right) => left.localeCompare(right, 'ru'));
  }, [groupedDocuments]);

  const filteredGroups = useMemo(
    () =>
      groupedDocuments.filter(group => {
        if (docFilter !== 'all' && group.docType !== docFilter) return false;
        if (courseFilter !== 'all' && !group.courses.includes(courseFilter)) return false;
        if (categoryFilter !== 'all' && !group.categories.includes(categoryFilter)) return false;
        return true;
      }),
    [groupedDocuments, docFilter, courseFilter, categoryFilter],
  );

  const orderedVisibleColumnKeys = useMemo(
    () => columnOrder.filter(columnKey => visibleColumns[columnKey]),
    [columnOrder, visibleColumns],
  );

  const tableMinWidth = useMemo(() => {
    const totalWidth = orderedVisibleColumnKeys.reduce((sum, key) => sum + (columnWidths[key] || 100), 0);
    return Math.max(1200, totalWidth);
  }, [orderedVisibleColumnKeys, columnWidths]);

  function toggleColumn(key: ColumnKey) {
    setVisibleColumns(prev => {
      const next = { ...prev, [key]: !prev[key] };
      const visibleCount = Object.values(next).filter(Boolean).length;
      return visibleCount === 0 ? prev : next;
    });
  }

  function resetColumns() {
    setVisibleColumns(Object.fromEntries(COLUMN_DEFS.map(column => [column.key, true])) as Record<ColumnKey, boolean>);
    setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS });
    setColumnOrder(COLUMN_DEFS.map(column => column.key));
  }

  function beginResizeColumn(columnKey: ColumnKey, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[columnKey] || 120;

    const onMove = (moveEvent: MouseEvent) => {
      const next = Math.max(80, startWidth + (moveEvent.clientX - startX));
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
      const sourceIndex = prev.findIndex(key => key === sourceKey);
      const targetIndex = prev.findIndex(key => key === targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return prev;

      const next = [...prev];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function renderCell(group: GroupedDocument, key: ColumnKey, rowIndex: number) {
    if (key === 'row_number') return rowIndex + 1;
    if (key === 'doc_type') return group.docType === 'certificate' ? 'Сертификат' : 'Удостоверение';
    if (key === 'courses') return group.courses.join(', ') || '—';
    if (key === 'categories') return group.categories.join(', ') || '—';
    if (key === 'employees') return group.employeesCount || 0;
    if (key === 'generated_at') return formatDateTime(group.generatedAt);
    if (key === 'file_url') {
      return group.fileUrl ? (
        <a
          href={group.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
        >
          Открыть <ExternalLink size={12} />
        </a>
      ) : (
        '—'
      );
    }

    return '—';
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span>Тип документа:</span>
          <select
            value={docFilter}
            onChange={event => setDocFilter(event.target.value as DocFilter)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value="all">Все</option>
            <option value="id_card">Удостоверения</option>
            <option value="certificate">Сертификаты</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span>Курс:</span>
          <select
            value={courseFilter}
            onChange={event => setCourseFilter(event.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value="all">Все курсы</option>
            {courseOptions.map(course => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span>Категория:</span>
          <select
            value={categoryFilter}
            onChange={event => setCategoryFilter(event.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          >
            <option value="all">Все категории</option>
            {categoryOptions.map(category => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <div className="relative ml-auto" ref={columnsMenuRef}>
          <button
            onClick={() => setColumnsMenuOpen(value => !value)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            title="Настройка столбцов"
          >
            <Settings2 size={13} />
            Колонки
          </button>

          {columnsMenuOpen && (
            <div className="absolute right-0 z-20 mt-1.5 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
              <div className="mb-2 text-xs font-semibold text-gray-700">Видимость столбцов</div>
              <div className="max-h-72 space-y-1.5 overflow-auto pr-1">
                {COLUMN_DEFS.map(column => (
                  <label key={column.key} className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={visibleColumns[column.key]}
                      onChange={() => toggleColumn(column.key)}
                    />
                    <span>{column.label}</span>
                  </label>
                ))}
              </div>

              <button
                onClick={resetColumns}
                className="mt-3 w-full rounded border border-gray-300 px-2 py-1.5 text-xs hover:bg-gray-50"
              >
                Сбросить настройки
              </button>
            </div>
          )}
        </div>
      </div>

      <ResizableTableContainer className="bg-white" initialHeight={700} minHeight={560}>
        <table className="w-full bg-white text-sm" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {orderedVisibleColumnKeys.map(columnKey => {
                const definition = COLUMN_DEFS.find(column => column.key === columnKey);
                if (!definition) return null;

                return (
                  <th
                    key={columnKey}
                    draggable
                    className="relative whitespace-nowrap px-4 py-3 text-left text-xs uppercase tracking-wide text-gray-600"
                    style={{
                      width: columnWidths[columnKey],
                      minWidth: columnWidths[columnKey],
                      opacity: draggingColumn === columnKey ? 0.45 : 1,
                    }}
                    onDragStart={event => {
                      setDraggingColumn(columnKey);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', columnKey);
                    }}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                      event.preventDefault();
                      const source = event.dataTransfer.getData('text/plain') || draggingColumn || '';
                      moveColumn(source, columnKey);
                      setDraggingColumn(null);
                    }}
                    onDragEnd={() => setDraggingColumn(null)}
                  >
                    {definition.label}
                    <div
                      className="absolute right-0 top-0 z-30 h-full w-2 cursor-col-resize hover:bg-blue-200/50"
                      onMouseDown={event => beginResizeColumn(columnKey, event)}
                      onDragStart={event => event.preventDefault()}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {filteredGroups.map((group, rowIndex) => (
              <tr key={group.id} className="border-b border-gray-50 last:border-b-0">
                {orderedVisibleColumnKeys.map(columnKey => (
                  <td
                    key={`${group.id}-${columnKey}`}
                    className="px-4 py-2 text-xs text-gray-700"
                    style={{ width: columnWidths[columnKey], minWidth: columnWidths[columnKey] }}
                  >
                    {renderCell(group, columnKey, rowIndex)}
                  </td>
                ))}
              </tr>
            ))}

            {filteredGroups.length === 0 && (
              <tr>
                <td
                  colSpan={Math.max(1, orderedVisibleColumnKeys.length)}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
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
