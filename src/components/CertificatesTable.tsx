import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CertificatesGrid } from '../features/certificates-table/grid';
import { AUX_COLUMN_LABELS, TEXT_FIELDS } from '../features/certificates-table/config';
import { CertificatesToolbar } from '../features/certificates-table/toolbar';
import { useCertificatesTableController, type CertificatesTableProps } from '../features/certificates-table/use-certificates-table-controller';

const PAGE_SIZE_OPTIONS = [20, 50, 100, 150, 200, 250, 500] as const;

function PaginationControls({
  totalRows,
  pageSize,
  currentPage,
  totalPages,
  onPageChange,
  onPageSizeChange,
  className = '',
}: {
  totalRows: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}) {
  const rangeLabel =
    totalRows === 0
      ? '0 из 0'
      : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, totalRows)} из ${totalRows}`;

  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
  );

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between ${className}`.trim()}
    >
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <span className="font-medium text-gray-700">Показано: {rangeLabel}</span>
        <span className="text-gray-400">стр. {currentPage} из {totalPages}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">На странице</span>
        <select
          value={pageSize}
          onChange={event => onPageSizeChange(Number(event.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          {PAGE_SIZE_OPTIONS.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <div className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>

          {visiblePages.map((page, index, list) => (
            <span key={page} className="flex items-center">
              {index > 0 && list[index - 1] !== page - 1 && <span className="px-1 text-xs text-gray-400">…</span>}
              <button
                type="button"
                onClick={() => onPageChange(page)}
                className={`h-8 min-w-[32px] rounded-lg px-2 text-xs transition-all ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {page}
              </button>
            </span>
          ))}

          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CertificatesTable(props: CertificatesTableProps) {
  const controller = useCertificatesTableController(props);
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const getColumnLabel = (key: string) => {
    const textField = TEXT_FIELDS.find(field => String(field.key) === key);
    return textField?.label || AUX_COLUMN_LABELS[key] || key;
  };

  const totalRows = controller.visibleRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const rowStartIndex = (currentPage - 1) * pageSize;
  const pagedCertificates = useMemo(
    () => controller.visibleRows.slice(rowStartIndex, rowStartIndex + pageSize),
    [controller.visibleRows, rowStartIndex, pageSize]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [
    controller.courseFilter,
    controller.categoryFilter,
    controller.printedFilter,
    controller.sortConfig?.key,
    controller.sortConfig?.direction,
  ]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="min-w-0">
      <CertificatesToolbar
        courseFilter={controller.courseFilter}
        categoryFilter={controller.categoryFilter}
        printedFilter={controller.printedFilter}
        courseOptions={controller.courseOptions}
        categoryOptions={controller.categoryOptions}
        printedFilterOptions={controller.printedFilterOptions}
        targetRowsInfo={controller.targetRowsInfo}
        visibleRowsCount={controller.visibleRows.length}
        generatingDocs={controller.generatingDocs}
        syncingBitrix={controller.syncingBitrix}
        bulkSaving={controller.bulkSaving}
        hasBitrixRows={controller.hasBitrixRows}
        columnsMenuOpen={controller.columnsMenuOpen}
        columnsMenuRef={controller.columnsMenuRef}
        visibleColumns={controller.visibleColumns}
        generationProgress={controller.generationProgress}
        columnLabelByKey={getColumnLabel}
        onCourseFilterChange={controller.setCourseFilter}
        onCategoryFilterChange={controller.setCategoryFilter}
        onPrintedFilterChange={controller.setPrintedFilter}
        onGenerateDocuments={() => {
          void controller.generateDocuments();
        }}
        onSyncBitrix={() => {
          void controller.syncCertificatesToBitrix();
        }}
        onColumnsMenuToggle={() => controller.setColumnsMenuOpen(!controller.columnsMenuOpen)}
        onToggleColumn={controller.toggleColumn}
        onResetColumns={controller.resetColumns}
      />

      <PaginationControls
        totalRows={totalRows}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        onPageSizeChange={nextPageSize => {
          setPageSize(nextPageSize);
          setCurrentPage(1);
        }}
        className="mb-3"
      />

      <CertificatesGrid
        certificates={pagedCertificates}
        rowStartIndex={rowStartIndex}
        orderedVisibleColumnKeys={controller.orderedVisibleColumnKeys}
        columnWidths={controller.columnWidths}
        draggingColumn={controller.draggingColumn}
        sortConfig={controller.sortConfig}
        activeColumnCount={controller.activeColumnCount}
        tableMinWidth={controller.tableMinWidth}
        bulkSaving={controller.bulkSaving}
        bulkStartDate={controller.bulkStartDate}
        bulkExpiryDate={controller.bulkExpiryDate}
        bulkCategory={controller.bulkCategory}
        categoryValueOptions={controller.categoryValueOptions}
        bulkIssuerCompany={controller.bulkIssuerCompany}
        issuerCompanyOptions={controller.issuerCompanyOptions}
        bulkCommissionChair={controller.bulkCommissionChair}
        commissionChairOptions={controller.commissionChairOptions}
        bulkManager={controller.bulkManager}
        managerOptions={controller.managerOptions}
        bulkQualification={controller.bulkQualification}
        bulkQualificationOptions={controller.bulkQualificationOptions}
        bulkElectricalSafetyGroup={controller.bulkElectricalSafetyGroup}
        bulkElectricalSafetyGroupOptions={controller.bulkElectricalSafetyGroupOptions}
        bulkMarkerPass={controller.bulkMarkerPass}
        markerPassOptions={controller.markerPassOptions}
        bulkTypeLearn={controller.bulkTypeLearn}
        typeLearnOptions={controller.typeLearnOptions}
        bulkCommisConcl={controller.bulkCommisConcl}
        commisConclOptions={controller.commisConclOptions}
        bulkGrade={controller.bulkGrade}
        gradeOptions={controller.gradeOptions}
        bulkEmployeeStatus={controller.bulkEmployeeStatus}
        employeeStatusOptions={controller.employeeStatusOptions}
        bulkPrintedStatus={controller.bulkPrintedStatus}
        printedStatusOptions={controller.printedStatusOptions}
        editCell={controller.editCell}
        editValue={controller.editValue}
        saving={controller.saving}
        onSort={controller.handleSort}
        onResizeColumn={controller.beginResizeColumn}
        onMoveColumn={controller.moveColumn}
        onDraggingColumnChange={controller.setDraggingColumn}
        onBulkFillNumber={() => {
          void controller.bulkFillNumber('document_number', 'номер документа');
        }}
        onBulkFillProtocol={() => {
          void controller.bulkFillProtocolWithMode();
        }}
        onBulkFillText={fieldKey => {
          const field = controller.BULK_TEXT_FILL_FIELDS.find(item => item.key === fieldKey);
          if (!field) return;
          void controller.bulkFillText(field.key, field.label);
        }}
        onBulkCategoryChange={controller.setBulkCategory}
        onBulkFillCategory={() => {
          void controller.bulkFillCategory();
        }}
        onBulkIssuerCompanyChange={controller.setBulkIssuerCompany}
        onBulkFillIssuerCompany={() => {
          void controller.bulkFillIssuerCompany();
        }}
        onBulkCommissionChairChange={controller.setBulkCommissionChair}
        onBulkFillCommissionChair={() => {
          void controller.bulkFillCommissionChair();
        }}
        onBulkManagerChange={controller.setBulkManager}
        onBulkFillManager={() => {
          void controller.bulkFillManager();
        }}
        onBulkQualificationChange={controller.setBulkQualification}
        onBulkFillQualification={() => {
          void controller.bulkFillQualification();
        }}
        onBulkElectricalSafetyGroupChange={controller.setBulkElectricalSafetyGroup}
        onBulkFillElectricalSafetyGroup={() => {
          void controller.bulkFillElectricalSafetyGroup();
        }}
        onBulkMarkerPassChange={controller.setBulkMarkerPass}
        onBulkFillMarkerPass={() => {
          void controller.bulkFillMarkerPass();
        }}
        onBulkTypeLearnChange={controller.setBulkTypeLearn}
        onBulkFillTypeLearn={() => {
          void controller.bulkFillTypeLearn();
        }}
        onBulkCommisConclChange={controller.setBulkCommisConcl}
        onBulkFillCommisConcl={() => {
          void controller.bulkFillCommisConcl();
        }}
        onBulkGradeChange={controller.setBulkGrade}
        onBulkFillGrade={() => {
          void controller.bulkFillGrade();
        }}
        onBulkEmployeeStatusChange={controller.setBulkEmployeeStatus}
        onBulkFillEmployeeStatus={() => {
          void controller.bulkFillEmployeeStatus();
        }}
        onBulkPrintedStatusChange={controller.setBulkPrintedStatus}
        onBulkFillPrintedStatus={() => {
          void controller.bulkFillPrintedStatus();
        }}
        onBulkFillPrice={() => {
          void controller.bulkFillPrice();
        }}
        onBulkStartDateChange={controller.setBulkStartDate}
        onBulkExpiryDateChange={controller.setBulkExpiryDate}
        onBulkFillStartDate={() => {
          void controller.bulkFillDate('start_date', controller.bulkStartDate);
        }}
        onBulkFillExpiryDate={() => {
          void controller.bulkFillDate('expiry_date', controller.bulkExpiryDate);
        }}
        onStartEdit={controller.startEdit}
        onEditValueChange={controller.setEditValue}
        onCancelEdit={() => controller.setEditCell(null)}
        onSaveEdit={() => {
          void controller.saveEdit();
        }}
        onSaveDirectPatch={(certId, patch) => {
          void controller.saveDirectPatch(certId, patch);
        }}
        getCourseSpecificOptions={controller.getCourseSpecificOptions}
        onDeleteCertificate={id => {
          void controller.deleteCertificate(id);
        }}
      />

      <PaginationControls
        totalRows={totalRows}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        onPageSizeChange={nextPageSize => {
          setPageSize(nextPageSize);
          setCurrentPage(1);
        }}
        className="mt-3"
      />

      <button
        onClick={() => {
          void controller.addCertificate();
        }}
        className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
      >
        <Plus size={15} /> Добавить запись
      </button>
    </div>
  );
}
