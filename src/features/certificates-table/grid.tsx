import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, ChevronsUpDown, Trash2, XCircle } from 'lucide-react';
import type { Certificate, SortConfig } from '../../types';
import { isElectricalSafetyCourse } from '../../lib/electricalSafety';
import {
  AUX_COLUMN_LABELS,
  BULK_TEXT_FILL_FIELDS,
  TEXT_FIELDS,
  getCertificateDisplayName,
  type EditCell,
} from './config';

interface CertificatesGridProps {
  certificates: Certificate[];
  rowStartIndex: number;
  orderedVisibleColumnKeys: Array<keyof Certificate | 'start_date' | 'expiry_date' | 'is_printed'>;
  columnWidths: Record<string, number>;
  draggingColumn: string | null;
  sortConfig: SortConfig | null;
  activeColumnCount: number;
  tableMinWidth: number;
  participantPhotoById: Map<string, string>;
  bulkSaving: boolean;
  bulkStartDate: string;
  bulkExpiryDate: string;
  bulkCategory: string;
  categoryValueOptions: string[];
  bulkIssuerCompany: string;
  issuerCompanyOptions: string[];
  bulkCommissionChair: string;
  commissionChairOptions: string[];
  bulkManager: string;
  managerOptions: string[];
  bulkQualification: string;
  bulkQualificationOptions: string[];
  bulkElectricalSafetyGroup: string;
  bulkElectricalSafetyGroupOptions: string[];
  bulkPreviousElectricalSafetyGroup: string;
  bulkPreviousElectricalSafetyGroupOptions: string[];
  bulkCommissionMembersProtocol: string;
  bulkCommissionMembersProtocolOptions: string[];
  bulkElectricalSafetyAdmissionProtocol: string;
  bulkElectricalSafetyAdmissionProtocolOptions: string[];
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
  onBulkFillIssuerCompany: () => void;
  onBulkIssuerCompanyChange: (value: string) => void;
  onBulkFillCommissionChair: () => void;
  onBulkCommissionChairChange: (value: string) => void;
  onBulkFillManager: () => void;
  onBulkManagerChange: (value: string) => void;
  onBulkFillQualification: () => void;
  onBulkQualificationChange: (value: string) => void;
  onBulkFillElectricalSafetyGroup: () => void;
  onBulkElectricalSafetyGroupChange: (value: string) => void;
  onBulkFillPreviousElectricalSafetyGroup: () => void;
  onBulkPreviousElectricalSafetyGroupChange: (value: string) => void;
  onBulkFillCommissionMembersProtocol: () => void;
  onBulkCommissionMembersProtocolChange: (value: string) => void;
  onBulkFillElectricalSafetyAdmissionProtocol: () => void;
  onBulkElectricalSafetyAdmissionProtocolChange: (value: string) => void;
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
  getCourseSpecificOptions: (
    courseName: string,
    fieldKey: 'qualification' | 'electrical_safety_group',
  ) => string[];
  getCommissionMembersProtocolOptions: (issuerCompany: string) => string[];
  getElectricalSafetyAdmissionProtocolOptions: (category: string, courseName: string) => string[];
  onDeleteCertificate: (id: string) => void;
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
    rowStartIndex,
    orderedVisibleColumnKeys,
    columnWidths,
    draggingColumn,
    sortConfig,
    activeColumnCount,
    tableMinWidth,
    participantPhotoById,
    bulkSaving,
    bulkStartDate,
    bulkExpiryDate,
    bulkCategory,
    categoryValueOptions,
    bulkIssuerCompany,
    issuerCompanyOptions,
    bulkCommissionChair,
    commissionChairOptions,
    bulkManager,
    managerOptions,
    bulkQualification,
    bulkQualificationOptions,
    bulkElectricalSafetyGroup,
    bulkElectricalSafetyGroupOptions,
    bulkPreviousElectricalSafetyGroup,
    bulkPreviousElectricalSafetyGroupOptions,
    bulkCommissionMembersProtocol,
    bulkCommissionMembersProtocolOptions,
    bulkElectricalSafetyAdmissionProtocol,
    bulkElectricalSafetyAdmissionProtocolOptions,
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
    onBulkFillIssuerCompany,
    onBulkIssuerCompanyChange,
    onBulkFillCommissionChair,
    onBulkCommissionChairChange,
    onBulkFillManager,
    onBulkManagerChange,
    onBulkFillQualification,
    onBulkQualificationChange,
    onBulkFillElectricalSafetyGroup,
    onBulkElectricalSafetyGroupChange,
    onBulkFillPreviousElectricalSafetyGroup,
    onBulkPreviousElectricalSafetyGroupChange,
    onBulkFillCommissionMembersProtocol,
    onBulkCommissionMembersProtocolChange,
    onBulkFillElectricalSafetyAdmissionProtocol,
    onBulkElectricalSafetyAdmissionProtocolChange,
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
    getCourseSpecificOptions,
    getCommissionMembersProtocolOptions,
    getElectricalSafetyAdmissionProtocolOptions,
    onDeleteCertificate,
  } = props;

  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);

  function getCertificatePhotoUrl(cert: Certificate): string {
    const participantId = String(cert.participant_id || '').trim();
    return participantId ? String(participantPhotoById.get(participantId) || '').trim() : '';
  }

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

  function SelectCell({
    certId,
    field,
    value,
    options,
    allowBlank = true,
  }: {
    certId: string;
    field: keyof Certificate;
    value: string;
    options: string[];
    allowBlank?: boolean;
  }) {
    return (
      <select
        value={value || ''}
        onChange={event => onSaveDirectPatch(certId, { [field]: event.target.value } as Partial<Certificate>)}
        className="min-w-[120px] w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
        disabled={saving}
      >
        {allowBlank && <option value="">-</option>}
        {options.map(option => (
          <option key={option} value={option}>{repairDisplayText(option)}</option>
        ))}
      </select>
    );
  }

  function ReadonlyCell({ value }: { value: string }) {
    return (
      <div className="min-h-[20px] whitespace-nowrap px-1 py-0.5 text-xs text-gray-500">
        {repairDisplayText(value) || <span className="text-gray-300">-</span>}
      </div>
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

    if (columnKey === 'issuer_company') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkIssuerCompany}
            onChange={event => onBulkIssuerCompanyChange(event.target.value)}
            className="min-w-[180px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {issuerCompanyOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillIssuerCompany}
            disabled={bulkSaving || !bulkIssuerCompany}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'commission_chair') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkCommissionChair}
            onChange={event => onBulkCommissionChairChange(event.target.value)}
            className="min-w-[150px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {commissionChairOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillCommissionChair}
            disabled={bulkSaving || !bulkCommissionChair}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'manager') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkManager}
            onChange={event => onBulkManagerChange(event.target.value)}
            className="min-w-[150px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving}
          >
            <option value="">Выбрать...</option>
            {managerOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillManager}
            disabled={bulkSaving || !bulkManager}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'qualification') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkQualification}
            onChange={event => onBulkQualificationChange(event.target.value)}
            className="min-w-[150px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving || bulkQualificationOptions.length === 0}
          >
            <option value="">Выбрать...</option>
            {bulkQualificationOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillQualification}
            disabled={bulkSaving || !bulkQualification}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'electrical_safety_group') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkElectricalSafetyGroup}
            onChange={event => onBulkElectricalSafetyGroupChange(event.target.value)}
            className="min-w-[170px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving || bulkElectricalSafetyGroupOptions.length === 0}
          >
            <option value="">Выбрать...</option>
            {bulkElectricalSafetyGroupOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillElectricalSafetyGroup}
            disabled={bulkSaving || !bulkElectricalSafetyGroup}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'previous_electrical_safety_group') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkPreviousElectricalSafetyGroup}
            onChange={event => onBulkPreviousElectricalSafetyGroupChange(event.target.value)}
            className="min-w-[150px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving || bulkPreviousElectricalSafetyGroupOptions.length === 0}
          >
            <option value="">Выбрать...</option>
            {bulkPreviousElectricalSafetyGroupOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillPreviousElectricalSafetyGroup}
            disabled={bulkSaving || !bulkPreviousElectricalSafetyGroup}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'commission_members_protocol') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkCommissionMembersProtocol}
            onChange={event => onBulkCommissionMembersProtocolChange(event.target.value)}
            className="min-w-[190px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving || bulkCommissionMembersProtocolOptions.length === 0}
          >
            <option value="">Выбрать...</option>
            {bulkCommissionMembersProtocolOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillCommissionMembersProtocol}
            disabled={bulkSaving || !bulkCommissionMembersProtocol}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'electrical_safety_admission_protocol') {
      return (
        <div className="flex items-center gap-1">
          <select
            value={bulkElectricalSafetyAdmissionProtocol}
            onChange={event => onBulkElectricalSafetyAdmissionProtocolChange(event.target.value)}
            className="min-w-[210px] rounded border border-gray-300 bg-white px-1.5 py-1 text-[11px]"
            disabled={bulkSaving || bulkElectricalSafetyAdmissionProtocolOptions.length === 0}
          >
            <option value="">Выбрать...</option>
            {bulkElectricalSafetyAdmissionProtocolOptions.map(option => (
              <option key={option} value={option}>{repairDisplayText(option)}</option>
            ))}
          </select>
          <button
            onClick={onBulkFillElectricalSafetyAdmissionProtocol}
            disabled={bulkSaving || !bulkElectricalSafetyAdmissionProtocol}
            className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            Заполнить
          </button>
        </div>
      );
    }

    if (columnKey === 'level') {
      return (
        <button
          onClick={() => onBulkFillText('level')}
          disabled={bulkSaving || bulkQualificationOptions.length === 0}
          className="rounded border border-gray-300 px-2 py-1 text-[11px] hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
        >
          Заполнить
        </button>
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
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl rounded-2xl bg-white p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-gray-500 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-800"
              title="\u0417\u0430\u043a\u0440\u044b\u0442\u044c"
            >
              <XCircle size={20} />
            </button>
            <div className="mb-3 pr-10 text-sm font-semibold text-gray-900">{repairDisplayText(previewPhoto.title)}</div>
            <div className="flex max-h-[78vh] items-center justify-center overflow-hidden rounded-xl bg-gray-50">
              <img src={previewPhoto.url} alt="" className="max-h-[78vh] w-auto max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full bg-white text-sm" style={{ minWidth: `${tableMinWidth}px` }}>
          <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_rgba(229,231,235,1)]">
            <tr className="border-b border-gray-200 bg-gray-50/95">
              <th className="sticky left-0 z-30 w-14 bg-gray-50 px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                №
              </th>
              <th className="sticky left-14 z-30 w-20 bg-gray-50 px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
                {'\u0424\u043e\u0442\u043e'}
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
                    className={`relative cursor-pointer select-none whitespace-nowrap px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-600 transition-colors hover:bg-gray-100/60 hover:text-gray-900 ${
                      key === 'full_name' ? 'sticky left-[136px] z-30 bg-gray-50 shadow-[1px_0_0_rgba(229,231,235,1)]' : ''
                    }`}
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
            <tr className="border-b border-gray-100 bg-white/95">
              <th className="sticky left-0 z-30 bg-white" />
              <th className="sticky left-14 z-30 bg-white" />
              {orderedVisibleColumnKeys.map(columnKey => {
                const key = String(columnKey);
                return (
                  <th
                    key={`${key}-bulk`}
                    className={`px-2 py-2 text-left ${
                      key === 'full_name' ? 'sticky left-[136px] z-30 bg-white shadow-[1px_0_0_rgba(229,231,235,1)]' : ''
                    }`}
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
                <td className="sticky left-0 z-10 bg-white px-4 py-2 text-xs font-medium text-gray-500">
                  {rowStartIndex + index + 1}
                </td>
                <td className="sticky left-14 z-10 bg-white px-4 py-2">
                  {(() => {
                    const photoUrl = getCertificatePhotoUrl(cert);
                    const title = getCertificateDisplayName(cert) || cert.id;
                    return photoUrl ? (
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto({ url: photoUrl, title })}
                        className="block h-10 w-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-all hover:border-blue-300 hover:ring-2 hover:ring-blue-100"
                        title="\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0444\u043e\u0442\u043e"
                      >
                        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-[10px] text-gray-300">
                        -
                      </div>
                    );
                  })()}
                </td>
                {orderedVisibleColumnKeys.map(columnKey => {
                  const key = String(columnKey);
                  const textField = TEXT_FIELDS.find(field => field.key === columnKey);

                  if (textField) {
                    return (
                      <td
                        key={key}
                        className={`px-4 py-2 ${
                          textField.key === 'full_name' ? 'sticky left-[136px] z-10 bg-white shadow-[1px_0_0_rgba(229,231,235,1)]' : ''
                        }`}
                        style={{ width: columnWidths[key], minWidth: columnWidths[key] }}
                      >
                        {textField.key === 'full_name' ? (
                          <EditableCell certId={cert.id} field="full_name" value={getCertificateDisplayName(cert)} />
                        ) : textField.key === 'marker_pass' ? (
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
                        ) : textField.key === 'issuer_company' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={issuerCompanyOptions}
                          />
                        ) : textField.key === 'commission_chair' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={commissionChairOptions}
                          />
                        ) : textField.key === 'manager' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={managerOptions}
                          />
                        ) : textField.key === 'qualification' ? (
                          (() => {
                            const options = getCourseSpecificOptions(cert.course_name, 'qualification');
                            if (options.length === 0) {
                              return <ReadonlyCell value="" />;
                            }
                            return (
                              <SelectCell
                                certId={cert.id}
                                field={textField.key}
                                value={String(cert[textField.key] ?? '')}
                                options={options}
                              />
                            );
                          })()
                        ) : textField.key === 'electrical_safety_group' ? (
                          (() => {
                            const options = getCourseSpecificOptions(cert.course_name, 'electrical_safety_group');
                            if (options.length === 0) {
                              return <ReadonlyCell value="" />;
                            }
                            return (
                              <SelectCell
                                certId={cert.id}
                                field={textField.key}
                                value={String(cert[textField.key] ?? '')}
                                options={options}
                              />
                            );
                          })()
                        ) : textField.key === 'commission_members_protocol' ? (
                          (() => {
                            const options = Array.from(new Set([
                              ...getCommissionMembersProtocolOptions(cert.issuer_company),
                              String(cert.commission_members_protocol || '').trim(),
                            ].filter(Boolean)));
                            if (options.length === 0) {
                              return <ReadonlyCell value="" />;
                            }
                            return (
                              <SelectCell
                                certId={cert.id}
                                field={textField.key}
                                value={String(cert[textField.key] ?? '')}
                                options={options}
                              />
                            );
                          })()
                        ) : textField.key === 'electrical_safety_admission_protocol' ? (
                          (() => {
                            const options = Array.from(new Set([
                              ...getElectricalSafetyAdmissionProtocolOptions(cert.category, cert.course_name),
                              String(cert.electrical_safety_admission_protocol || '').trim(),
                            ].filter(Boolean)));
                            if (options.length === 0) {
                              return <ReadonlyCell value="" />;
                            }
                            return (
                              <SelectCell
                                certId={cert.id}
                                field={textField.key}
                                value={String(cert[textField.key] ?? '')}
                                options={options}
                              />
                            );
                          })()
                        ) : textField.key === 'level' ? (
                          (() => {
                            const isApplicable = getCourseSpecificOptions(cert.course_name, 'qualification').length > 0;
                            if (!isApplicable) {
                              return <ReadonlyCell value="" />;
                            }
                            return (
                              <EditableCell certId={cert.id} field={textField.key} value={String(cert[textField.key] ?? '')} />
                            );
                          })()
                        ) : textField.key === 'type_learn' ? (
                          <SelectCell
                            certId={cert.id}
                            field={textField.key}
                            value={String(cert[textField.key] ?? '')}
                            options={typeLearnOptions}
                          />
                        ) : textField.key === 'previous_electrical_safety_group' ? (
                          (() => {
                            if (!isElectricalSafetyCourse(cert.course_name)) {
                              return <ReadonlyCell value="" />;
                            }
                            return (
                              <SelectCell
                                certId={cert.id}
                                field={textField.key}
                                value={String(cert[textField.key] ?? '') || bulkPreviousElectricalSafetyGroupOptions[0] || ''}
                                options={bulkPreviousElectricalSafetyGroupOptions}
                                allowBlank={false}
                              />
                            );
                          })()
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
                        ) : textField.key === 'protocol_number' ? (
                          <ReadonlyCell value={String(cert[textField.key] ?? '')} />
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
      </div>
    </div>
  );
}
