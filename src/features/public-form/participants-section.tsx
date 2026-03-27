import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';
import { ChevronDown, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import { getParticipantMissingFields, isParticipantRowStarted, type LocalParticipant, type ValidationErrors } from './model';

type ParticipantColumnKey =
  | 'photo'
  | 'last_name'
  | 'first_name'
  | 'patronymic'
  | 'position'
  | 'category'
  | 'courses'
  | 'actions';

const DEFAULT_COLUMN_WIDTHS: Record<ParticipantColumnKey, number> = {
  photo: 96,
  last_name: 180,
  first_name: 170,
  patronymic: 190,
  position: 220,
  category: 180,
  courses: 460,
  actions: 56,
};

const MIN_COLUMN_WIDTHS: Record<ParticipantColumnKey, number> = {
  photo: 96,
  last_name: 140,
  first_name: 140,
  patronymic: 150,
  position: 170,
  category: 150,
  courses: 320,
  actions: 56,
};

const HEADER_DEFS: Array<{ key: ParticipantColumnKey; label: string; resizable: boolean }> = [
  { key: 'photo', label: 'Фото', resizable: false },
  { key: 'last_name', label: 'Фамилия', resizable: true },
  { key: 'first_name', label: 'Имя', resizable: true },
  { key: 'patronymic', label: 'Отчество', resizable: true },
  { key: 'position', label: 'Должность', resizable: true },
  { key: 'category', label: 'Категория', resizable: true },
  { key: 'courses', label: 'Курсы', resizable: true },
  { key: 'actions', label: '', resizable: false },
];

interface ParticipantsSectionProps {
  participants: LocalParticipant[];
  pagedParticipants: LocalParticipant[];
  availableCategories: string[];
  openCourseSelect: string | null;
  courseSearch: string;
  errors: ValidationErrors;
  canFillParticipants: boolean;
  canEditParticipants: boolean;
  totalCourses: number;
  totalCourseRequests: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  filteredCourses: string[];
  fileInputRefs: MutableRefObject<Record<string, HTMLInputElement | null>>;
  onPageSizeChange: (value: number) => void;
  onPageChange: (value: number) => void;
  onParticipantFieldChange: <K extends keyof LocalParticipant>(id: string, field: K, value: LocalParticipant[K]) => void;
  onParticipantPhotoPick: (participantId: string, file: File) => void;
  onToggleCourse: (participantId: string, course: string) => void;
  onOpenCourseSelectChange: (participantId: string | null) => void;
  onCourseSearchChange: (value: string) => void;
  onRemoveParticipant: (participantIndex: number) => void;
  onAddParticipant: () => void;
}

export function ParticipantsSection(props: ParticipantsSectionProps) {
  const {
    participants,
    pagedParticipants,
    availableCategories,
    openCourseSelect,
    courseSearch,
    errors,
    canFillParticipants,
    canEditParticipants,
    totalCourses,
    totalCourseRequests,
    pageSize,
    currentPage,
    totalPages,
    filteredCourses,
    fileInputRefs,
    onPageSizeChange,
    onPageChange,
    onParticipantFieldChange,
    onParticipantPhotoPick,
    onToggleCourse,
    onOpenCourseSelectChange,
    onCourseSearchChange,
    onRemoveParticipant,
    onAddParticipant,
  } = props;

  const [columnWidths, setColumnWidths] = useState<Record<ParticipantColumnKey, number>>(DEFAULT_COLUMN_WIDTHS);
  const resizeStateRef = useRef<{ key: ParticipantColumnKey; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const state = resizeStateRef.current;
      if (!state) return;

      const minWidth = MIN_COLUMN_WIDTHS[state.key];
      const nextWidth = Math.max(minWidth, state.startWidth + (event.clientX - state.startX));
      setColumnWidths(prev => ({ ...prev, [state.key]: nextWidth }));
    }

    function handleMouseUp() {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const tableMinWidth = useMemo(
    () => Object.values(columnWidths).reduce((total, width) => total + width, 0),
    [columnWidths]
  );
  const minimumVisibleRows = 10;
  const estimatedRowHeight = 76;
  const estimatedHeaderHeight = 52;
  const tableViewportMinHeight = estimatedHeaderHeight + Math.max(minimumVisibleRows, pagedParticipants.length) * estimatedRowHeight;
  const tableViewportPaddingBottom = openCourseSelect ? 220 : 0;

  function beginResizeColumn(columnKey: ParticipantColumnKey, event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeStateRef.current = {
      key: columnKey,
      startX: event.clientX,
      startWidth: columnWidths[columnKey],
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  return (
    <div className={`bg-white rounded-2xl shadow-lg p-5 lg:p-6 xl:p-8 ${!canEditParticipants ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
            <Users size={16} className="text-blue-600" />
          </div>
          Список сотрудников
        </h2>
        <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
          <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
            <Users size={13} /> {participants.length} сотрудников
          </span>
          <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">
            {totalCourses} курсов
          </span>
          <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-medium">
            {totalCourseRequests} заявок на курсы
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Строк:</span>
            <select
              value={pageSize}
              onChange={event => onPageSizeChange(Number(event.target.value))}
              className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {[10, 20, 40, 50, 100, 200].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
        </div>
      </div>

      {errors.participants && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {errors.participants}
        </div>
      )}
      {!canEditParticipants && (
        <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          {canFillParticipants
            ? 'Заполнение списка сотрудников будет доступно после загрузки актуального платежного поручения и заполнения номера, даты и суммы оплаты.'
            : 'Заполнение сотрудников недоступно: требуется активный договор или подтверждение "Нет договора".'}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        <div
          className="overflow-x-auto"
          style={{
            minHeight: `${tableViewportMinHeight}px`,
            paddingBottom: tableViewportPaddingBottom ? `${tableViewportPaddingBottom}px` : undefined,
          }}
        >
          <table className="w-full table-fixed" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr className="border-b border-gray-100">
              {HEADER_DEFS.map(column => (
                <th
                  key={column.key}
                  className={`relative text-left py-3 text-xs font-medium text-gray-500 uppercase tracking-wide ${
                    column.key === 'photo' ? 'px-6' : 'px-4'
                  }`}
                  style={{ width: columnWidths[column.key], minWidth: columnWidths[column.key] }}
                >
                  {column.label}
                  {column.resizable && (
                    <div
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-200/40"
                      onMouseDown={event => beginResizeColumn(column.key, event)}
                      title="Изменить ширину столбца"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedParticipants.map(participant => {
              const index = participants.findIndex(item => item.id === participant.id);
              const missingFields = errors.participants && isParticipantRowStarted(participant)
                ? getParticipantMissingFields(participant)
                : [];
              const hasMissing = missingFields.length > 0;

              return (
                <tr key={participant.id} className={`border-b border-gray-50 ${hasMissing ? 'bg-red-50/40' : ''}`}>
                  <td className="px-6 py-3 align-top" style={{ width: columnWidths.photo, minWidth: columnWidths.photo }}>
                    <div className="relative w-12 h-14 flex-shrink-0">
                      {participant.photoPreview || participant.photo_url ? (
                        <img src={participant.photoPreview || participant.photo_url} alt="" className="w-12 h-14 rounded-lg object-cover border border-gray-200" />
                      ) : (
                        <div className="w-12 h-14 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5">
                          <Upload size={14} className="text-gray-400" />
                          <span className="text-gray-400 text-[9px]">Фото</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        ref={element => {
                          fileInputRefs.current[participant.id] = element;
                        }}
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (file) onParticipantPhotoPick(participant.id, file);
                        }}
                        disabled={!canEditParticipants}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRefs.current[participant.id]?.click()}
                        disabled={participant.uploading || !canEditParticipants}
                        className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                          missingFields.includes('photo') ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {participant.uploading
                          ? <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                          : <Upload size={9} className="text-white" />
                        }
                      </button>
                    </div>
                  </td>

                  {(['last_name', 'first_name', 'patronymic', 'position'] as const).map(field => (
                    <td key={field} className="px-4 py-3 align-top" style={{ width: columnWidths[field], minWidth: columnWidths[field] }}>
                      <input
                        value={participant[field]}
                        onChange={event => onParticipantFieldChange(participant.id, field, event.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all hover:border-gray-300 ${
                          missingFields.includes(field) ? 'border-red-400 bg-red-50' : 'border-gray-200'
                        }`}
                        placeholder="—"
                        disabled={!canEditParticipants}
                      />
                    </td>
                  ))}

                  <td className="px-4 py-3 align-top" style={{ width: columnWidths.category, minWidth: columnWidths.category }}>
                    <div className="relative">
                      <select
                        value={participant.category}
                        onChange={event => onParticipantFieldChange(participant.id, 'category', event.target.value)}
                        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none pr-8 bg-white ${
                          missingFields.includes('category') ? 'border-red-400 bg-red-50' : 'border-gray-200'
                        }`}
                        disabled={!canEditParticipants}
                      >
                        <option value="">—</option>
                        {availableCategories.map(category => <option key={category} value={category}>{category}</option>)}
                      </select>
                      <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top" style={{ width: columnWidths.courses, minWidth: columnWidths.courses }}>
                    <div className="relative" onClick={event => event.stopPropagation()}>
                      <div
                        className={`flex flex-wrap gap-1 min-h-[36px] p-1 border rounded-lg hover:border-blue-300 transition-colors cursor-pointer ${
                          missingFields.includes('courses') ? 'border-red-400 bg-red-50' : 'border-gray-200'
                        }`}
                        onClick={() => {
                          if (!canEditParticipants) return;
                          onOpenCourseSelectChange(openCourseSelect === participant.id ? null : participant.id);
                          onCourseSearchChange('');
                        }}
                      >
                        {participant.courses.map(course => (
                          <span key={course} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs border border-blue-100">
                            {course}
                            <button
                              type="button"
                              onClick={event => {
                                event.stopPropagation();
                                onToggleCourse(participant.id, course);
                              }}
                              className="hover:text-red-500 transition-colors"
                              disabled={!canEditParticipants}
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                        {participant.courses.length === 0 && (
                          <span className="text-xs text-gray-400 px-1 py-1">Выбрать курсы...</span>
                        )}
                      </div>

                      {openCourseSelect === participant.id && canEditParticipants && (
                        <div className="absolute top-full mt-1 left-0 z-30 bg-white rounded-xl border border-gray-200 shadow-xl w-[min(28rem,calc(100vw-4rem))] p-2">
                          <input
                            autoFocus
                            value={courseSearch}
                            onChange={event => onCourseSearchChange(event.target.value)}
                            placeholder="Поиск..."
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            onClick={event => event.stopPropagation()}
                          />
                          <div className="max-h-48 overflow-y-auto space-y-0.5">
                            {filteredCourses.map(course => {
                              const selected = participant.courses.includes(course);
                              return (
                                <button
                                  key={course}
                                  type="button"
                                  onClick={() => onToggleCourse(participant.id, course)}
                                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${selected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                                >
                                  {selected ? <span className="mr-1 text-blue-600">+</span> : null}{course}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-top" style={{ width: columnWidths.actions, minWidth: columnWidths.actions }}>
                    {participants.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveParticipant(index)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        disabled={!canEditParticipants}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="px-6 pt-3 flex items-center justify-between text-sm">
          <span className="text-gray-500 text-xs">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, participants.length)} из {participants.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs disabled:opacity-40 hover:bg-gray-50 transition-all"
            >
              ←
            </button>
            {Array.from({ length: totalPages }, (_, index) => index + 1)
              .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1)
              .map((page, index, list) => (
                <span key={page}>
                  {index > 0 && list[index - 1] !== page - 1 && <span className="px-1 text-gray-400">…</span>}
                  <button
                    type="button"
                    onClick={() => onPageChange(page)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${currentPage === page ? 'bg-blue-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                  >
                    {page}
                  </button>
                </span>
              ))}
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs disabled:opacity-40 hover:bg-gray-50 transition-all"
            >
              →
            </button>
          </div>
        </div>
      )}

      <div className="px-6 pt-4">
        <button
          type="button"
          onClick={onAddParticipant}
          disabled={!canEditParticipants}
          className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all w-full justify-center disabled:opacity-50"
        >
          <Plus size={16} /> Добавить ещё сотрудника
        </button>
      </div>
    </div>
  );
}

