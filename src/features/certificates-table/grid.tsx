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
  onBulkFillPrice: () => void;
  onBulkStartDateChange: (value: string) => void;
  onBulkExpiryDateChange: (value: string) => void;
  onBulkFillStartDate: () => void;
  onBulkFillExpiryDate: () => void;
  onStartEdit: (certId: string, field: string, value: string) => void;
  onEditValueChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDeleteCertificate: (id: string) => void;
  onAddCertificate: () => void;
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
    onBulkFillPrice,
    onBulkStartDateChange,
    onBulkExpiryDateChange,
    onBulkFillStartDate,
    onBulkFillExpiryDate,
    onStartEdit,
    onEditValueChange,
    onCancelEdit,
    onSaveEdit,
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
          className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50 min-w-[80px]"
          disabled={saving}
        />
      );
    }

    return (
      <div
        className="px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[20px] text-xs whitespace-nowrap"
        onClick={() => onStartEdit(certId, field, value)}
      >
        {value || <span className="text-gray-300">-</span>}
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
          className="px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50"
          disabled={saving}
        />
      );
    }

    return (
      <div
        className="px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[20px] text-xs whitespace-nowrap"
        onClick={() => onStartEdit(certId, field, value?.split('T')[0] || '')}
      >
        {displayValue || <span className="text-gray-300">-</span>}
      </div>
    );
  }

  return (
    <div>
      <ResizableTableContainer className="bg-white">
        <table className="w-full text-sm bg-white" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              {orderedVisibleColumnKeys.map(columnKey => {
                const key = String(columnKey);
                const textField = TEXT_FIELDS.find(field => field.key === columnKey);
                const label = textField?.label || AUX_COLUMN_LABELS[key] || key;
                const isSortable = key !== 'is_printed';

                return (
                  <th
                    key={key}
                    draggable
                    className="relative text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider cursor-pointer select-none hover:text-gray-900 hover:bg-gray-100/60 transition-colors whitespace-nowrap"
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
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize z-30 hover:bg-blue-200/50"
                      onMouseDown={event => onResizeColumn(key, event)}
                      onClick={event => event.stopPropagation()}
                      onDragStart={event => event.preventDefault()}
                    />
                  </th>
                );
              })}
              <th className="px-4 py-3.5 w-10" />
            </tr>
            <tr className="bg-white border-b border-gray-100">
              {orderedVisibleColumnKeys.map(columnKey => {
                const key = String(columnKey);
                const textField = TEXT_FIELDS.find(field => field.key === columnKey);

                return (
                  <th
                    key={`${key}-bulk`}
                    className="px-2 py-2 text-left"
                    style={{ width: columnWidths[key], minWidth: columnWidths[key] }}
                  >
                    {key === 'document_number' && (
                      <button
                        onClick={onBulkFillNumber}
                        disabled={bulkSaving}
                        className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                      >
                        Заполнить
                      </button>
                    )}
                    {key === 'protocol_number' && (
                      <button
                        onClick={onBulkFillProtocol}
                        disabled={bulkSaving}
                        className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-blue-50 hover:border-blue-300 disabled:opacity-50"
                      >
                        Заполнить
                      </button>
                    )}
                    {textField && BULK_TEXT_FILL_FIELDS.some(item => item.key === textField.key) && (
                      <button
                        onClick={() => {
                          if (textField.key === 'price') {
                            onBulkFillPrice();
                            return;
                          }
                          onBulkFillText(textField.key);
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
                          onChange={event => onBulkStartDateChange(event.target.value)}
                          className="px-1.5 py-1 text-[11px] border border-gray-300 rounded bg-white"
                          disabled={bulkSaving}
                        />
                        <button
                          onClick={onBulkFillStartDate}
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
                          onChange={event => onBulkExpiryDateChange(event.target.value)}
                          className="px-1.5 py-1 text-[11px] border border-gray-300 rounded bg-white"
                          disabled={bulkSaving}
                        />
                        <button
                          onClick={onBulkFillExpiryDate}
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
            {certificates.map(cert => (
              <tr key={cert.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                {orderedVisibleColumnKeys.map(columnKey => {
                  const key = String(columnKey);
                  const textField = TEXT_FIELDS.find(field => field.key === columnKey);

                  if (textField) {
                    return (
                      <td key={key} className="px-4 py-2" style={{ width: columnWidths[key], minWidth: columnWidths[key] }}>
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
                    onClick={() => onDeleteCertificate(cert.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {certificates.length === 0 && (
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
        onClick={onAddCertificate}
        className="mt-4 flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
      >
        <Plus size={15} /> Добавить запись
      </button>
    </div>
  );
}
