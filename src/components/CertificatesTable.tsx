import { CertificatesGrid } from '../features/certificates-table/grid';
import { AUX_COLUMN_LABELS, TEXT_FIELDS } from '../features/certificates-table/config';
import { CertificatesToolbar } from '../features/certificates-table/toolbar';
import { useCertificatesTableController, type CertificatesTableProps } from '../features/certificates-table/use-certificates-table-controller';

export default function CertificatesTable(props: CertificatesTableProps) {
 const controller = useCertificatesTableController(props);

 const getColumnLabel = (key: string) => {
 const textField = TEXT_FIELDS.find(field => String(field.key) === key);
 return textField?.label || AUX_COLUMN_LABELS[key] || key;
 };

 return (
 <div>
 <CertificatesToolbar
 courseFilter={controller.courseFilter}
 categoryFilter={controller.categoryFilter}
 courseOptions={controller.courseOptions}
 categoryOptions={controller.categoryOptions}
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

 <CertificatesGrid
 certificates={controller.visibleRows}
 orderedVisibleColumnKeys={controller.orderedVisibleColumnKeys}
 columnWidths={controller.columnWidths}
 draggingColumn={controller.draggingColumn}
 sortConfig={controller.sortConfig}
 activeColumnCount={controller.activeColumnCount}
 tableMinWidth={controller.tableMinWidth}
 bulkSaving={controller.bulkSaving}
 bulkStartDate={controller.bulkStartDate}
 bulkExpiryDate={controller.bulkExpiryDate}
 editCell={controller.editCell}
 editValue={controller.editValue}
 saving={controller.saving}
 onSort={controller.handleSort}
 onResizeColumn={controller.beginResizeColumn}
 onMoveColumn={controller.moveColumn}
 onDraggingColumnChange={controller.setDraggingColumn}
 onBulkFillNumber={() => {
 void controller.bulkFillNumber('document_number', 'Номер документа');
 }}
 onBulkFillProtocol={() => {
 void controller.bulkFillProtocolWithMode();
 }}
 onBulkFillText={fieldKey => {
 const field = controller.BULK_TEXT_FILL_FIELDS.find(item => item.key === fieldKey);
 if (!field) return;
 void controller.bulkFillText(field.key, field.label);
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
 onDeleteCertificate={id => {
 void controller.deleteCertificate(id);
 }}
 onAddCertificate={() => {
 void controller.addCertificate();
 }}
 />
 </div>
 );
}
