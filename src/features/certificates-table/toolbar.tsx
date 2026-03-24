import type { Ref } from 'react';
import { FileOutput, Settings2 } from 'lucide-react';
import { ALL_COLUMN_KEYS } from './config';

interface CertificatesToolbarProps {
  courseFilter: string;
  categoryFilter: string;
  courseOptions: string[];
  categoryOptions: string[];
  targetRowsInfo: string;
  visibleRowsCount: number;
  generatingDocs: boolean;
  syncingBitrix: boolean;
  bulkSaving: boolean;
  hasBitrixRows: boolean;
  columnsMenuOpen: boolean;
  columnsMenuRef: Ref<HTMLDivElement>;
  visibleColumns: Record<string, boolean>;
  generationProgress: {
    total: number;
    processed: number;
    generated: number;
    skipped: number;
    failed: number;
  } | null;
  columnLabelByKey: (key: string) => string;
  onCourseFilterChange: (value: string) => void;
  onCategoryFilterChange: (value: string) => void;
  onGenerateDocuments: () => void;
  onSyncBitrix: () => void;
  onColumnsMenuToggle: () => void;
  onToggleColumn: (key: string) => void;
  onResetColumns: () => void;
}

export function CertificatesToolbar(props: CertificatesToolbarProps) {
  const {
    courseFilter,
    categoryFilter,
    courseOptions,
    categoryOptions,
    targetRowsInfo,
    visibleRowsCount,
    generatingDocs,
    syncingBitrix,
    bulkSaving,
    hasBitrixRows,
    columnsMenuOpen,
    columnsMenuRef,
    visibleColumns,
    generationProgress,
    columnLabelByKey,
    onCourseFilterChange,
    onCategoryFilterChange,
    onGenerateDocuments,
    onSyncBitrix,
    onColumnsMenuToggle,
    onToggleColumn,
    onResetColumns,
  } = props;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-600 flex items-center gap-2">
          <span>Фильтр по курсам:</span>
          <select
            value={courseFilter}
            onChange={event => onCourseFilterChange(event.target.value)}
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
            onChange={event => onCategoryFilterChange(event.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
          >
            <option value="all">Все категории</option>
            {categoryOptions.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </label>
        <span className="text-xs text-gray-500">
          Массовое заполнение применяется к: <b>{targetRowsInfo}</b> ({visibleRowsCount} строк)
        </span>
        <button
          onClick={onGenerateDocuments}
          disabled={generatingDocs || bulkSaving}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <FileOutput size={13} />
          {generatingDocs ? 'Генерация...' : 'Сгенерировать документы'}
        </button>
        <button
          onClick={onSyncBitrix}
          disabled={syncingBitrix || bulkSaving}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {syncingBitrix ? 'Синхронизация...' : (hasBitrixRows ? 'Обновить данные в Bitrix' : 'Отправить в Bitrix')}
        </button>
        <div className="relative" ref={columnsMenuRef}>
          <button
            onClick={onColumnsMenuToggle}
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
                {ALL_COLUMN_KEYS.map(columnKey => {
                  const key = String(columnKey);
                  return (
                    <label key={key} className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={visibleColumns[key] !== false}
                        onChange={() => onToggleColumn(key)}
                      />
                      <span>{columnLabelByKey(key)}</span>
                    </label>
                  );
                })}
              </div>
              <button
                onClick={onResetColumns}
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
    </>
  );
}
