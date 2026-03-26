import type { MouseEvent as ReactMouseEvent } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, ChevronsUpDown, Plus, Trash2, XCircle } from 'lucide-react';
import ResizableTableContainer from '../../components/ResizableTableContainer';
import type { Certificate, SortConfig } from '../../types';
import {
  AUX_COLUMN_LABELS,
  BULK_TEXT_FILL_FIELDS,
  TEXT_FIELDS,
  type EditCell,
} from './config';

interface CertificatesGridProps {
  certificates: Certificate[];
  orderedVisibleColumnKeys: Array<keyof Certificate | 'start_date' | 'expiry_date' | 'is_printed'>;
  columnWidths: Record<string, number>;
  draggingColumn: string | null;
  sortConfig: SortConfig | null;
  activeColumnCount: number;
  tableMinWidth: number;
  bulkSaving: boolean;
  bulkStartDate: string;
  bulkExpiryDate: string;
  bulkCategory: string;
  categoryValueOptions: string[];
  bulkMarkerPass: string;
  markerPassOptions: string[];
  bulkTypeLearn: string;
  typeLearnOptions: string[];
  bulkCommisConcl: string;
  commisConclOptions: string[];
  bulkGrade: string;
  gradeOptions: string[];
  bulkEmployeeStatus: string;
  employeeStatusOptions: string[];
  bulkPrintedStatus: string;
  printedStatusOptions: string[];
  editCell: EditCell | null;
  editValue: string;
  saving: boolean;
  onSort: (key: string) => void;
  onResizeColumn: (key: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onMoveColumn: (sourceKey: string, targetKey: string) => void;
  onDraggingColumnChange: (key: string | null) => void;
  onBulkFillNumber: () => void;
  onBulkFillProtocol: () => void;
  onBulkFillText: (fieldKey: keyof Certificate) => void;
  onBulkFillCategory: () => void;
  onBulkCategoryChange: (value: string) => void;
  onBulkFillMarkerPass: () => void;
  onBulkMarkerPassChange: (value: string) => void;
  onBulkFillTypeLearn: () => void;
  onBulkTypeLearnChange: (value: string) => void;
  onBulkFillCommisConcl: () => void;
  onBulkCommisConclChange: (value: string) => void;
  onBulkFillGrade: () => void;
  onBulkGradeChange: (value: string) => void;
  onBulkFillEmployeeStatus: () => void;
  onBulkEmployeeStatusChange: (value: string) => void;
  onBulkFillPrintedStatus: () => void;
  onBulkPrintedStatusChange: (value: string) => void;
  onBulkFillPrice: () => void;
  onBulkStartDateChange: (value: string) => void;
  onBulkExpiryDateChange: (value: string) => void;
  onBulkFillStartDate: () => void;
  onBulkFillExpiryDate: () => void;
  onStartEdit: (certId: string, field: string, value: string) => void;
  onEditValueChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onSaveDirectPatch: (certId: string, patch: Partial<Certificate>) => void;
  onDeleteCertificate: (id: string) => void;
  onAddCertificate: () => void;
}

function repairDisplayText(value: string): string {
  const source = String(value || '');
  if (!source) return '';

  if (!/(?:Р.|С.|Ð.|Ñ.){2,}/.test(source)) return source;

  try {
    const bytes = Uint8Array.from(Array.from(source, char => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const sourceCyrillic = (source.match(/[А-Яа-яЁё]/g) || []).length;
    const decodedCyrillic = (decoded.match(/[А-Яа-яЁё]/g) || []).length;
    return decodedCyrillic >= sourceCyrillic ? decoded : source;
  } catch {
    return source;
  }
}

export function CertificatesGrid(props: CertificatesGridProps) {
  const {
    certificates,
    orderedVisibleColumnKeys,
    columnWidths,
    draggingColumn,
    sortConfig,
    activeColumnCount,
    tableMinWidth,
    bulkSaving,
    bulkStartDate,
    bulkExpiryDate,
    bulkCategory,
    categoryValueOptions,
    bulkMarkerPass,
    markerPassOptions,
    bulkTypeLearn,
    typeLearnOptions,
    bulkCommisConcl,
    commisConclOptions,
    bulkGrade,
    gradeOptions,
    bulkEmployeeStatus,
    employeeStatusOptions,
    bulkPrintedStatus,
    printedStatusOptions,
    editCell,
    editValue,
    saving,
    onSort,
    onResizeColumn,
    onMoveColumn,
    onDraggingColumnChange,
    onBulkFillNumber,
    onBulkFillProtocol,
    onBulkFillText,
    onBulkFillCategory,
    onBulkCategoryChange,
    onBulkFillMarkerPass,
    onBulkMarkerPassChange,
    onBulkFillTypeLearn,
    onBulkTypeLearnChange,
    onBulkFillCommisConcl,
    onBulkCommisConclChange,
    onBulkFillGrade,
    onBulkGradeChange,
    onBulkFillEmployeeStatus,
    onBulkEmployeeStatusChange,
    onBulkFillPrintedStatus,
    onBulkPrintedStatusChange,
    onBulkFillPrice,
    onBulkStartDateChange,
    onBulkExpiryDateChange,
    onBulkFillStartDate,
    onBulkFillExpiryDate,
    onStartEdit,
    onEditValueChange,
    onCancelEdit,
    onSaveEdit,
    onSaveDirectPatch,
    onDeleteCertificate,
    onAddCertificate,
  } = props;

  function SortIcon({ keyName }: { keyName: string }) {
    const isActive = sortConfig?.key === keyName;
    if (!isActive) return <ChevronsUpDown size={13} className="text-gray-300" />;
    return sortConfig?.direction === 'asc'
      ? <ChevronUp size={13} className="text-blue-600" />
      : <ChevronDown size={13} className="text-blue-600" />;
  }

  function EditableCell({ certId, field, value }: { certId: string; field: string; value: string }) {
    const isEditing = editCell?.certId === certId && editCell?.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={event => onEditValueChange(event.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={event => {
            if (event.key === 'Enter') onSaveEdit();
            if (event.key === 'Escape') onCancelEdit();
          }}
          className="min-w-[80px] w-full rounded border border-blue-400 bg-blue-50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          disabled={saving}
        />
      );
    }

    return (
      <div
        className="min-h-[20px] cursor-pointer whitespace-nowrap rounded px-1 py-0.5 text-xs transition-all hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
        onClick={() => onStartEdit(certId, field, value)}
      >
        {repairDisplayText(value) || <span className="text-gray-300">-</span>}
      </div>
    );
  }

  function EditableDateCell({ certId, field, value }: { certId: string; field: string; value: string | null }) {
    const isEditing = editCell?.certId === certId && editCell?.field === field;
    const displayValue = value ? new Date(value).toLocaleDateString('ru-RU') : '';
    if (isEditing) {
      return (
        <input
          autoFocus
          type="date"
          value={editValue}
          onChange={event => onEditValueChange(event.target.value)}
          onBlur={onSaveEdit}
          onKeyDown={event => {
            if (event.key === 'Enter') onSaveEdit();
            if (event.key === 'Escape') onCancelEdit();
          }}
          className="rounded border border-blue-400 bg-blue-50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          disabled={saving}
        />
      );
    }

    return (
      <div
        className="min-h-[20px] cursor-pointer whitespace-nowrap rounded px-1 py-0.5 text-xs transition-all hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
        onClick={() => onStartEdit(certId, field, value?.split('T')[0] || '')}
      >
        {displayValue || <span className="text-gray-300">-</span>}
      </div>
    );
  }

  function SelectCell({ certId, field, value, options }: { certId: string; field: keyof Certificate; value: string; options: string[] }) {
    return (
      <select
        value={value || ''}
        onChange={event => onSaveDirectPatch(certId, { [field]: event.target.value } as Partial<Certificate>)}
        className="min-w-[120px] w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        disabled={saving}
      >
        <option value="">-</option>
        {options.map(option => (
          <option key={option} value={option}>{repairDisplayText(option)}</option>
        ))}
      </select>
    );
  }

  function renderBulkControl(columnKey: string) {
    const textField = TEXT_FIELDS.find(field => field.key === columnKey);

    if (columnKey === 'document_number') {
      return (
        <button
          onClick={onBulkFillNumber}
          disabled={bulkSaving}
          className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
        >
          Заполнить
        </button>
      );
    }

    if (columnKey === 'protocol_number') {
      return (
        <button
          onClick={onBulkFillProtocol}
          disabled={bulkSaving}
          className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
        >
          Заполнить
        </button>
      );
    }

    if (columnKey === 'marker_pass') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkMarkerPass}
            onChange={event => onBulkMarkerPassChange(event.target.value)}
            className="min-w-[140px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {markerPassOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillMarkerPass}
            disabled={bulkSaving || !bulkMarkerPass}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'category') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkCategory}
            onChange={event => onBulkCategoryChange(event.target.value)}
            className="min-w-[120px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {categoryValueOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillCategory}
            disabled={bulkSaving || !bulkCategory}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'type_learn') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkTypeLearn}
            onChange={event => onBulkTypeLearnChange(event.target.value)}
            className="min-w-[140px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {typeLearnOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillTypeLearn}
            disabled={bulkSaving || !bulkTypeLearn}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'commis_concl') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkCommisConcl}
            onChange={event => onBulkCommisConclChange(event.target.value)}
            className="min-w-[120px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {commisConclOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillCommisConcl}
            disabled={bulkSaving || !bulkCommisConcl}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'grade') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkGrade}
            onChange={event => onBulkGradeChange(event.target.value)}
            className="min-w-[130px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {gradeOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillGrade}
            disabled={bulkSaving || !bulkGrade}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'employee_status') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkEmployeeStatus}
            onChange={event => onBulkEmployeeStatusChange(event.target.value)}
            className="min-w-[120px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {employeeStatusOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillEmployeeStatus}
            disabled={bulkSaving || !bulkEmployeeStatus}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'is_printed') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkPrintedStatus}
            onChange={event => onBulkPrintedStatusChange(event.target.value)}
            className="min-w-[120px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {printedStatusOptions.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillPrintedStatus}
            disabled={bulkSaving || !bulkPrintedStatus}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (textField && BULK_TEXT_FILL_FIELDS.some(item => item.key === textField.key)) {
      return (
        <button
          onClick={() => {
            if (textField.key === 'price') {
              onBulkFillPrice();
              return;
            }
            onBulkFillText(textField.key);
          }}
          disabled={bulkSaving}
          className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
        >
          Заполнить
        </button>
      );
    }

    if (columnKey === 'start_date') {
      return (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={bulkStartDate}
            onChange={event => onBulkStartDateChange(event.target.value)}
            className="rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          />
          <button
            onClick={onBulkFillStartDate}
            disabled={bulkSaving}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'expiry_date') {
      return (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={bulkExpiryDate}
            onChange={event => onBulkExpiryDateChange(event.target.value)}
            className="rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          />
          <button
            onClick={onBulkFillExpiryDate}
            disabled={bulkSaving}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    return null;
  }

  return (
    <div>
      <ResizableTableContainer className="bg-white">
        <table className="w-full bg-white text-sm" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80">
              <th className="w-14 px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                №
              </th>
              {orderedVisibleColumnKeys.map(columnKey => {
                const key = String(columnKey);
                const textField = TEXT_FIELDS.find(field => field.key === columnKey);
                const label = textField?.label || AUX_COLUMN_LABELS[key] || key;
                const isSortable = key !== 'is_printed';

                return (
                  <th
                    key={key}
                    draggable
                    className="relative cursor-pointer select-none whitespace-nowrap px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-600 transition-colors hover:bg-gray-100/60 hover:text-gray-900"
                    onClick={() => { if (isSortable) onSort(key); }}
                    onDragStart={event => {
                      onDraggingColumnChange(key);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', key);
                    }}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                      event.preventDefault();
                      const source = event.dataTransfer.getData('text/plain') || draggingColumn || '';
                      onMoveColumn(source, key);
                      onDraggingColumnChange(null);
                    }}
                    onDragEnd={() => onDraggingColumnChange(null)}
                    style={{ width: columnWidths[key], minWidth: columnWidths[key], opacity: draggingColumn === key ? 0.45 : 1 }}
                  >
                    <div className="flex items-center gap-1.5">
                      {label}
                      {isSortable ? <SortIcon keyName={key} /> : null}
                    </div>
                    <div
                      className="absolute right-0 top-0 z-30 h-full w-2 cursor-col-resize hover:bg-blue-200/50"
                      onMouseDown={event => onResizeColumn(key, event)}
                      onClick={event => event.stopPropagation()}
                      onDragStart={event => event.preventDefault()}
                    />
                  </th>
                );
              })}
              <th className="w-10 px-4 py-3.5" />
            </tr>
            <tr className="border-b border-gray-100 bg-white">
              <th />
              {orderedVisibleColumnKeys.map(columnKey => {
                const key = String(columnKey);
                return (
                  <th
                    key={`${key}-bulk`}
                    className="px-2 py-2 text-left"
                    style={{ width: columnWidths[key], minWidth: columnWidths[key] }}
                  >
                    {renderBulkControl(key)}
                  </th>
                );
              })}
              <th />
            </tr>
          </thead>
          <tbody>
            {certificates.map((cert, index) => (
              <tr key={cert.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50/50">
                <td className="px-4 py-2 text-xs font-medium text-gray-500">
                  {index + 1}
                </td>
                {orderedVisibleColumnKeys.map(columnKey => {
                  const key = String(columnKey);
                  const textField = TEXT_FIELDS.find(field => field.key === columnKey);

                  if (textField) {
                    return (
                      <td key={key} className="px-4 py-2" style={{ width: columnWidths[key], minWidth: columnWidths[key] }}>
                        {textField.key === 'marker_pass' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={markerPassOptions}
                          />
                        ) : textField.key === 'category' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={categoryValueOptions}
                          />
                        ) : textField.key === 'type_learn' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={typeLearnOptions}
                          />
                        ) : textField.key === 'commis_concl' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={commisConclOptions}
                          />
                        ) : textField.key === 'grade' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={gradeOptions}
                          />
                        ) : textField.key === 'employee_status' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={employeeStatusOptions}
                          />
                        ) : (
                          <EditableCell certId={cert.id} field={textField.key} value={String(cert[textField.key] ?? '')} />
                        )}
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
                        <button
                          onClick={() => onSaveDirectPatch(cert.id, { is_printed: !cert.is_printed })}
                          disabled={saving}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                            cert.is_printed
                              ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {cert.is_printed ? <><CheckCircle size={13} /> Да</> : <><XCircle size={13} /> Нет</>}
                        </button>
                      </td>
                    );
                  }

                  return null;
                })}
                <td className="px-4 py-2">
                  <button
                    onClick={() => onDeleteCertificate(cert.id)}
                    className="rounded-lg p-1.5 text-gray-300 transition-all hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {certificates.length === 0 && (
              <tr>
                <td colSpan={activeColumnCount + 1} className="px-4 py-8 text-center text-sm text-gray-400">
                  Нет записей. Добавьте документ или выполните синхронизацию с Bitrix24.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ResizableTableContainer>

      <button
        onClick={onAddCertificate}
        className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
      >
        <Plus size={15} /> Добавить запись
      </button>
    </div>
  );
}
