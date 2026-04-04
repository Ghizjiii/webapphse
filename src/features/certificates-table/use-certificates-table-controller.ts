import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { supabase } from '../../lib/supabase';
import {
 BITRIX_CERTIFICATE_REFERENCE_FIELDS,
 BITRIX_FIELDS,
 BITRIX_FIELDS_RAW,
 createSmartProcessItem,
 fetchSmartProcessItem,
 findSmartProcessEntityTypeId,
 getBitrixFieldValue,
 updateSmartProcessItem,
} from '../../lib/bitrix';
import { buildPlaceholders, callGenerateDocumentFunction, resolveTemplateForCertificate } from '../../lib/documentGeneration';
import { defaultDocumentType, findDocumentValidityRule, resolveDocumentExpiryFromRule } from '../../lib/documentValidity';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import type { Certificate, Participant, RefBitrixListItem, RefCoursePrice, RefDocumentValidityRule, SortConfig } from '../../types';
import {
 ALL_COLUMN_KEYS,
 AUX_COLUMN_LABELS,
 BULK_TEXT_FILL_FIELDS,
 DEFAULT_COLUMN_WIDTHS,
 makeGeneratedFileName,
 sortCerts,
 TEXT_FIELDS,
 toBitrixDate,
 type ColumnKey,
 type EditCell,
} from './config';

export interface CertificatesTableProps {
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

export function useCertificatesTableController({
 questionnaireId,
 dealId,
 companyId,
 companyName = '',
 participants = [],
 bitrixDealId = null,
 bitrixCompanyId = null,
 certificates,
 onRefresh,
}: CertificatesTableProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const fallbackCategoryOptions = ['ИТР', 'Обычный'];
  const fallbackTypeLearnOptions = ['первичная', 'повторная', 'периодическая'];
  const canonicalMarkerPassOptions = [
  'Прошел (-а)',
  'Не прошел (-а)',
 'Подлежит повторной проверке знаний',
 ];
 const canonicalCommisConclOptions = [
 'Сдал (-а)',
 'Не сдал (-а)',
 ];
 const canonicalGradeOptions = [
 'Плохо',
 'Удовлетворительно',
 'Хорошо',
 'Отлично',
 ];
 const canonicalEmployeeStatusOptions = [
 'Работает',
 'Уволен',
 ];
 type SmartFieldKind = 'text' | 'date' | 'boolean' | 'number' | 'link';
 type SmartFieldEntry = {
 code: string;
 kind: SmartFieldKind;
 value: string | number;
 };
 const printedStatusOptions = [
 'Да',
 'Нет',
 ];
 const printedFilterOptions = ['Да', 'Нет'];

 function normalizeMarkerPassValue(value: string): string {
 const normalized = String(value || '').trim().toLocaleLowerCase('ru');
 if (!normalized) return '';
 if (normalized === 'прошел' || normalized === 'прошла' || normalized === 'прошел (-а)' || normalized === 'прошла (-а)') {
 return 'Прошел (-а)';
 }
 if (normalized === 'не прошел' || normalized === 'не прошла' || normalized === 'не прошел (-а)' || normalized === 'не прошла (-а)') {
 return 'Не прошел (-а)';
 }
 if (
 normalized === 'подлежит повторной проверке знаний' ||
 normalized === 'проверка знаний проведена'
 ) {
 return 'Подлежит повторной проверке знаний';
 }
 return String(value || '').trim();
 }

 function normalizeCommisConclValue(value: string): string {
 const normalized = String(value || '').trim().toLocaleLowerCase('ru');
 if (!normalized) return '';
 if (
 normalized === 'сдал' ||
 normalized === 'сдала' ||
 normalized === 'сдал (-а)' ||
 normalized === 'сдала (-а)' ||
 normalized === 'сдал (-a)' ||
 normalized === 'сдала (-a)'
 ) {
 return 'Сдал (-а)';
 }
 if (
 normalized === 'не сдал' ||
 normalized === 'не сдала' ||
 normalized === 'не сдал (-а)' ||
 normalized === 'не сдала (-а)' ||
 normalized === 'не сдал (-a)' ||
 normalized === 'не сдала (-a)'
 ) {
 return 'Не сдал (-а)';
 }
 return String(value || '').trim();
 }

 function toBitrixCommisConclValue(value: string): string {
 const normalized = normalizeCommisConclValue(value);
 if (normalized === 'Сдал (-а)') return 'Сдал (-a)';
 if (normalized === 'Не сдал (-а)') return 'Не сдал (-a)';
 return normalized;
 }

 function normalizeTypeLearnValue(value: string): string {
 const normalized = String(value || '').trim().toLocaleLowerCase('ru');
 if (!normalized) return '';
 if (normalized === 'первичный' || normalized === 'первичная') return 'первичная';
 if (normalized === 'повторный' || normalized === 'повторная') return 'повторная';
 if (normalized === 'периодический' || normalized === 'периодическая') return 'периодическая';
 return String(value || '').trim();
 }

 function normalizeGradeValue(value: string): string {
 const normalized = String(value || '').trim().toLocaleLowerCase('ru');
 if (!normalized) return '';
 if (normalized === 'плохо') return 'Плохо';
 if (normalized === 'удовлетворительно') return 'Удовлетворительно';
 if (normalized === 'хорошо') return 'Хорошо';
 if (normalized === 'отлично') return 'Отлично';
 return String(value || '').trim();
 }

 function normalizeEmployeeStatusValue(value: string): string {
 const normalized = String(value || '').trim().toLocaleLowerCase('ru');
 if (!normalized) return '';
 if (normalized === 'работает' || normalized === 'active' || normalized === 'работающий') {
 return 'Работает';
 }
 if (normalized === 'уволен' || normalized === 'inactive' || normalized === 'не работает') {
 return 'Уволен';
 }
 return String(value || '').trim();
 }

 function normalizeBitrixDate(value: unknown): string | null {
 const raw = String(value || '').trim();
 if (!raw) return null;
 const isoPart = raw.includes('T') ? raw.split('T')[0] : raw;
 if (/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) return isoPart;
 const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
 if (match) return `${match[3]}-${match[2]}-${match[1]}`;
 return raw;
 }

 function normalizeBitrixBoolean(value: unknown): boolean | null {
 if (typeof value === 'boolean') return value;
 const raw = String(value || '').trim().toUpperCase();
 if (!raw) return null;
 if (['Y', 'YES', 'TRUE', '1', 'ДА'].includes(raw)) return true;
 if (['N', 'NO', 'FALSE', '0', 'НЕТ'].includes(raw)) return false;
 return null;
 }

 function normalizeBitrixNumber(value: unknown): number | null {
 if (typeof value === 'number') return Number.isFinite(value) ? value : null;
 const raw = String(value || '').trim().replace(',', '.');
 if (!raw) return null;
 const parsed = Number(raw);
 return Number.isFinite(parsed) ? parsed : null;
 }

 function normalizeBitrixLinkTokens(value: unknown): string[] {
 const tokens = new Set<string>();

 const visit = (candidate: unknown) => {
 if (candidate === null || candidate === undefined) return;

 if (
 typeof candidate === 'string' ||
 typeof candidate === 'number' ||
 typeof candidate === 'boolean'
 ) {
 const normalized = String(candidate).trim();
 if (normalized) tokens.add(normalized);
 return;
 }

 if (Array.isArray(candidate)) {
 for (const item of candidate) visit(item);
 return;
 }

 if (typeof candidate === 'object') {
 const record = candidate as Record<string, unknown>;
 let foundExplicitId = false;
 for (const key of ['ID', 'id', 'VALUE', 'value', 'ITEM_ID', 'itemId']) {
 const raw = record[key];
 if (raw === null || raw === undefined) continue;
 const normalized = String(raw).trim();
 if (!normalized) continue;
 tokens.add(normalized);
 foundExplicitId = true;
 }
 if (foundExplicitId) return;
 for (const nested of Object.values(record)) visit(nested);
 }
 };

 visit(value);
 return Array.from(tokens).sort();
 }

 function getSmartFieldValue(item: Record<string, unknown>, code: string): unknown {
 const direct = getBitrixFieldValue(item, code);
 if (direct !== undefined) return direct;

 for (const [key, camelCode] of Object.entries(BITRIX_FIELDS)) {
 const rawCode = BITRIX_FIELDS_RAW[key as keyof typeof BITRIX_FIELDS_RAW];
 if (camelCode === code || rawCode === code) {
 return getBitrixFieldValue(item, camelCode) ?? getBitrixFieldValue(item, rawCode);
 }
 }

 return undefined;
 }

 function areSmartFieldValuesEqual(kind: SmartFieldKind, currentValue: unknown, desiredValue: unknown): boolean {
 switch (kind) {
 case 'date':
 return normalizeBitrixDate(currentValue) === normalizeBitrixDate(desiredValue);
 case 'boolean':
 return normalizeBitrixBoolean(currentValue) === normalizeBitrixBoolean(desiredValue);
 case 'number':
 return normalizeBitrixNumber(currentValue) === normalizeBitrixNumber(desiredValue);
 case 'link': {
 const currentTokens = normalizeBitrixLinkTokens(currentValue);
 const desiredTokens = normalizeBitrixLinkTokens(desiredValue);
 return currentTokens.length === desiredTokens.length && currentTokens.every((token, index) => token === desiredTokens[index]);
 }
 case 'text':
 default:
 return String(currentValue ?? '').trim() === String(desiredValue ?? '').trim();
 }
 }

 function isBitrixItemMissingError(error: unknown): boolean {
 const message = error instanceof Error ? error.message : String(error || '');
 return /ENTITY_ITEM_NOT_FOUND|ITEM_NOT_FOUND|not found|does not exist|could not find/i.test(message);
 }

 function buildSmartProcessDiff(currentItem: Record<string, unknown>, entries: SmartFieldEntry[]): Record<string, unknown> {
 const patch: Record<string, unknown> = {};
 for (const entry of entries) {
 const currentValue = entry.code === 'TITLE' ? currentItem.TITLE : getSmartFieldValue(currentItem, entry.code);
 if (areSmartFieldValuesEqual(entry.kind, currentValue, entry.value)) continue;
 patch[entry.code] = entry.value;
 }
 return patch;
 }

 const [localCertificates, setLocalCertificates] = useState<Certificate[]>(certificates);
 const [documentValidityRules, setDocumentValidityRules] = useState<RefDocumentValidityRule[]>([]);
 const [coursePriceRules, setCoursePriceRules] = useState<RefCoursePrice[]>([]);

 const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
 const [editCell, setEditCell] = useState<EditCell | null>(null);
 const [editValue, setEditValue] = useState('');
 const [saving, setSaving] = useState(false);
 const [bulkSaving, setBulkSaving] = useState(false);
 const [syncingBitrix, setSyncingBitrix] = useState(false);
 const [generatingDocs, setGeneratingDocs] = useState(false);
 const [courseFilter, setCourseFilter] = useState<string>('all');
 const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [printedFilter, setPrintedFilter] = useState<string>('all');
  const [bulkStartDate, setBulkStartDate] = useState<string>('');
  const [bulkExpiryDate, setBulkExpiryDate] = useState<string>('');
  const [bulkCategory, setBulkCategory] = useState<string>('');
  const [referenceCategories, setReferenceCategories] = useState<string[]>([]);
  const [referenceBitrixListItems, setReferenceBitrixListItems] = useState<RefBitrixListItem[]>([]);
  const [bulkIssuerCompany, setBulkIssuerCompany] = useState<string>('');
  const [bulkCommissionChair, setBulkCommissionChair] = useState<string>('');
  const [bulkMarkerPass, setBulkMarkerPass] = useState<string>('');
  const [bulkTypeLearn, setBulkTypeLearn] = useState<string>('');
  const [bulkCommisConcl, setBulkCommisConcl] = useState<string>('');
  const [bulkGrade, setBulkGrade] = useState<string>('');
  const [bulkEmployeeStatus, setBulkEmployeeStatus] = useState<string>('');
  const [bulkPrintedStatus, setBulkPrintedStatus] = useState<string>('');
 const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
 const columnsMenuRef = useRef<HTMLDivElement>(null);
 const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
 const base: Record<string, boolean> = {};
 for (const field of TEXT_FIELDS) base[String(field.key)] = true;
 base.start_date = true;
 base.expiry_date = true;
 base.is_printed = true;
 return base;
 });
 const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => ({ ...DEFAULT_COLUMN_WIDTHS }));
 const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() => [...ALL_COLUMN_KEYS]);
 const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
 const [generationProgress, setGenerationProgress] = useState<{
 total: number;
 processed: number;
 generated: number;
 skipped: number;
 failed: number;
 } | null>(null);
 const lastResumeRefreshAtRef = useRef(0);
 const autoPriceBackfillAttemptedRef = useRef(false);

 useEffect(() => {
 setLocalCertificates(certificates.map(cert => ({
 ...cert,
 issuer_company: String(cert.issuer_company || '').trim(),
 commission_chair: String(cert.commission_chair || '').trim(),
 marker_pass: normalizeMarkerPassValue(cert.marker_pass),
 type_learn: normalizeTypeLearnValue(cert.type_learn),
 commis_concl: normalizeCommisConclValue(cert.commis_concl),
 grade: normalizeGradeValue(cert.grade),
 employee_status: normalizeEmployeeStatusValue(cert.employee_status),
 })));
 }, [certificates]);

 useEffect(() => {
 void Promise.all([
 supabase
 .from('ref_document_validity_rules')
 .select('*')
 .order('sort_order')
 .order('course_name')
 .order('category'),
 supabase
 .from('ref_course_prices')
 .select('*')
 .order('sort_order')
 .order('course_name')
 .order('category')
 .order('qualification'),
 ]).then(([documentRulesRes, coursePricesRes]) => {
 setDocumentValidityRules((documentRulesRes.data || []) as RefDocumentValidityRule[]);
 setCoursePriceRules((coursePricesRes.data || []) as RefCoursePrice[]);
 });
 }, []);

  function mergeSelectOptions(...lists: string[][]): string[] {
 const result: string[] = [];
 const seen = new Set<string>();

 for (const list of lists) {
 for (const item of list) {
 const normalized = String(item || '').trim();
 if (!normalized) continue;
 const key = normalized.toLocaleLowerCase('ru');
 if (seen.has(key)) continue;
 seen.add(key);
 result.push(normalized);
 }
 }

 return result;
 }

  async function loadReferenceSelects(): Promise<{ categories: string[]; bitrixListItems: RefBitrixListItem[] }> {
  const [categoriesRes, bitrixListsRes] = await Promise.all([
  supabase.from('ref_categories').select('name').order('sort_order').order('name'),
  supabase
  .from('ref_bitrix_list_items')
  .select('*')
  .in('list_key', ['MY_COMPANIES', 'COURSES', 'CATEGORIES', 'DOCUMENT_TYPE', 'MARKER_PASS', 'TYPE_LEARN', 'COMMIS_CONCL', 'GRADE', 'EMPLOYEE_STATUS'])
  .order('list_key')
  .order('sort_order')
  .order('name'),
  ]);

  const nextCategories = (categoriesRes.data || []).map(item => String(item.name || '').trim()).filter(Boolean);
  const nextBitrixListItems = (bitrixListsRes.data || []) as RefBitrixListItem[];
  if (!categoriesRes.error) {
  setReferenceCategories(nextCategories);
  }
  if (!bitrixListsRes.error) {
  setReferenceBitrixListItems(nextBitrixListItems);
  }

  return {
  categories: nextCategories,
  bitrixListItems: nextBitrixListItems,
  };
  }

  useEffect(() => {
  void loadReferenceSelects();

  const intervalId = window.setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  void loadReferenceSelects();
  }, 30000);

  const onVisibilityChange = () => {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  if (now - lastResumeRefreshAtRef.current < 5000) return;
  lastResumeRefreshAtRef.current = now;
  void loadReferenceSelects();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
  window.clearInterval(intervalId);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  };
  }, []);

  function normalizeSelectValues(
  values: string[],
  normalizeValue?: (value: string) => string,
  ): string[] {
  return mergeSelectOptions(
  values.map(value => {
  const normalized = normalizeValue ? normalizeValue(String(value || '')) : String(value || '').trim();
  return String(normalized || '').trim();
  }),
  );
  }

  function buildReferenceOptions(referenceValues: string[], currentValues: string[], fallbackValues: string[]): string[] {
  if (referenceValues.length > 0) {
  return mergeSelectOptions(referenceValues, currentValues);
  }
  return mergeSelectOptions(currentValues, fallbackValues);
  }

  function normalizeReferenceLookup(value: string): string {
  return String(value || '')
  .trim()
  .toLocaleLowerCase('ru')
  .replace(/ё/g, 'е')
  .replace(/\(-a\)/g, '(-а)')
  .replace(/\s+/g, ' ');
  }

  function findReferenceBitrixItemId(
  listItems: RefBitrixListItem[],
  listKey: RefBitrixListItem['list_key'],
  value: string,
  aliases: string[] = [],
  ): string {
  const candidates = Array.from(new Set([
  value,
  ...aliases,
  ]))
  .map(candidate => normalizeReferenceLookup(candidate))
  .filter(Boolean);
  if (candidates.length === 0) return '';

  const relevantItems = listItems.filter(item => item.list_key === listKey);
  for (const candidate of candidates) {
  const match = relevantItems.find(item => {
  const itemValues = [
  item.name,
  item.bitrix_value,
  ...(listKey === 'MY_COMPANIES' ? [] : [item.code]),
  ].map(current => normalizeReferenceLookup(current));
  return itemValues.includes(candidate);
  });
  if (match) return String(match.bitrix_item_id || '').trim();
  }

  return '';
  }

  function getReferenceListValues(
  listKey: RefBitrixListItem['list_key'],
  normalizeValue?: (value: string) => string,
  ): string[] {
  return normalizeSelectValues(
  referenceBitrixListItems
  .filter(item => item.list_key === listKey)
  .map(item => item.name),
  normalizeValue,
  );
  }

  function getMyCompanyChairman(item: RefBitrixListItem): string {
  return String(item.code || '').trim();
  }

  function resolveChairmanByIssuerCompany(
  listItems: RefBitrixListItem[],
  issuerCompany: string,
  ): string {
  const normalizedIssuerCompany = normalizeReferenceLookup(issuerCompany);
  if (!normalizedIssuerCompany) return '';

  const match = listItems.find(item =>
  item.list_key === 'MY_COMPANIES' &&
  [item.name, item.bitrix_value]
  .map(current => normalizeReferenceLookup(current))
  .includes(normalizedIssuerCompany)
  );

  return match ? getMyCompanyChairman(match) : '';
  }

  function applyIssuerCompanyRelations(
  listItems: RefBitrixListItem[],
  patch: Partial<Certificate>,
  ): Partial<Certificate> {
  if (!Object.prototype.hasOwnProperty.call(patch, 'issuer_company')) {
  return patch;
  }

  const issuerCompany = String(patch.issuer_company || '').trim();
  const chairman = issuerCompany
  ? resolveChairmanByIssuerCompany(listItems, issuerCompany)
  : '';

  return {
  ...patch,
  issuer_company: issuerCompany,
  commission_chair: chairman,
  };
  }

  function normalizeCoursePriceLookup(value: string): string {
  const normalized = String(value || '')
  .trim()
  .toLocaleLowerCase('ru')
  .replace(/ё/g, 'е')
  .replace(/\s+/g, ' ');

  if (!normalized || normalized === '-' || normalized === 'нет данных' || normalized === 'не установлено') {
  return '';
  }

  return normalized;
  }

  function resolveReferencePrice(
  courseName: string,
  category: string,
  qualification: string,
  ): number | null {
  const normalizedCourseName = normalizeCoursePriceLookup(courseName);
  const normalizedCategory = normalizeCoursePriceLookup(category);
  const normalizedQualification = normalizeCoursePriceLookup(qualification);

  if (!normalizedCourseName || !normalizedCategory) return null;

  const matchingRows = coursePriceRules.filter(row =>
  normalizeCoursePriceLookup(row.course_name) === normalizedCourseName &&
  normalizeCoursePriceLookup(row.category) === normalizedCategory
  );

  if (matchingRows.length === 0) return null;

  const exactMatch = matchingRows.find(row => normalizeCoursePriceLookup(row.qualification) === normalizedQualification);
  if (exactMatch) {
  const parsed = Number(exactMatch.price);
  if (Number.isFinite(parsed)) return parsed;
  }

  const genericMatch = matchingRows.find(row => normalizeCoursePriceLookup(row.qualification) === '');
  if (genericMatch) {
  const parsed = Number(genericMatch.price);
  if (Number.isFinite(parsed)) return parsed;
  }

  return null;
  }

  function autoPricePatchForCertificate(cert: Certificate, patch: Partial<Certificate>): Partial<Certificate> {
  if (Object.prototype.hasOwnProperty.call(patch, 'price')) {
  return patch;
  }

  const shouldRecalculate =
  Object.prototype.hasOwnProperty.call(patch, 'course_name') ||
  Object.prototype.hasOwnProperty.call(patch, 'category') ||
  Object.prototype.hasOwnProperty.call(patch, 'qualification');

  if (!shouldRecalculate) {
  return patch;
  }

  const nextCourseName = Object.prototype.hasOwnProperty.call(patch, 'course_name')
  ? String(patch.course_name || '')
  : cert.course_name;
  const nextCategory = Object.prototype.hasOwnProperty.call(patch, 'category')
  ? String(patch.category || '')
  : cert.category;
  const nextQualification = Object.prototype.hasOwnProperty.call(patch, 'qualification')
  ? String(patch.qualification || '')
  : cert.qualification;
  const nextPrice = resolveReferencePrice(nextCourseName, nextCategory, nextQualification);

  return {
  ...patch,
  price: nextPrice,
  };
  }

  function normalizeCertificatePatchForSave(
  cert: Certificate,
  patch: Partial<Certificate>,
  ): { patch: Partial<Certificate>; missingRule: boolean } {
  const patchWithRelations = applyIssuerCompanyRelations(referenceBitrixListItems, patch);
  const patchWithPrice = autoPricePatchForCertificate(cert, patchWithRelations);
  return autoExpiryPatchForCertificate(cert, patchWithPrice);
  }

  useEffect(() => {
  autoPriceBackfillAttemptedRef.current = false;
  }, [questionnaireId]);

  useEffect(() => {
  if (autoPriceBackfillAttemptedRef.current) return;
  if (coursePriceRules.length === 0 || localCertificates.length === 0) return;

  autoPriceBackfillAttemptedRef.current = true;
  const updates = localCertificates
  .filter(cert => cert.price == null)
  .map(cert => {
  const price = resolveReferencePrice(cert.course_name, cert.category, cert.qualification);
  if (price === null) return null;
  return {
  id: cert.id,
  price,
  };
  })
  .filter((item): item is { id: string; price: number } => Boolean(item));

  if (updates.length === 0) return;

  const now = new Date().toISOString();
  void Promise.all(
  updates.map(item =>
  supabase
  .from('certificates')
  .update({ price: item.price, updated_at: now })
  .eq('id', item.id)
  )
  ).then(results => {
  const successIds = new Set(
  updates
  .filter((_, index) => !results[index]?.error)
  .map(item => item.id)
  );
  if (successIds.size === 0) return;

  setLocalCertificates(current => current.map(cert => {
  const updated = updates.find(item => item.id === cert.id);
  if (!updated || !successIds.has(cert.id)) return cert;
  return { ...cert, price: updated.price } as Certificate;
  }));
  onRefresh();
  });
  }, [coursePriceRules, localCertificates, onRefresh, questionnaireId]);

  const myCompanyReferenceItems = useMemo(
  () => referenceBitrixListItems.filter(item => item.list_key === 'MY_COMPANIES'),
  [referenceBitrixListItems]
  );

  const categoryValueOptions = useMemo(
  () => buildReferenceOptions(
  referenceCategories,
  normalizeSelectValues([
  ...participants.map(participant => participant.category),
  ...localCertificates.map(cert => cert.category),
  ]),
  fallbackCategoryOptions,
  ),
  [localCertificates, participants, referenceCategories]
  );
  const issuerCompanyOptions = useMemo(
  () => {
  const referenceOptions = normalizeSelectValues(myCompanyReferenceItems.map(item => item.name));
  if (referenceOptions.length > 0) return referenceOptions;
  return normalizeSelectValues(localCertificates.map(cert => cert.issuer_company));
  },
  [localCertificates, myCompanyReferenceItems]
  );
  const commissionChairOptions = useMemo(
  () => {
  const referenceOptions = normalizeSelectValues(myCompanyReferenceItems.map(item => getMyCompanyChairman(item)));
  if (referenceOptions.length > 0) return referenceOptions;
  return normalizeSelectValues(localCertificates.map(cert => cert.commission_chair));
  },
  [localCertificates, myCompanyReferenceItems]
  );
  const markerPassOptions = useMemo(
  () => buildReferenceOptions(
  getReferenceListValues('MARKER_PASS', normalizeMarkerPassValue),
  normalizeSelectValues(localCertificates.map(cert => cert.marker_pass), normalizeMarkerPassValue),
  canonicalMarkerPassOptions,
  ),
  [localCertificates, referenceBitrixListItems]
  );
  const typeLearnOptions = useMemo(
  () => buildReferenceOptions(
  getReferenceListValues('TYPE_LEARN', normalizeTypeLearnValue),
  normalizeSelectValues(localCertificates.map(cert => cert.type_learn), normalizeTypeLearnValue),
  fallbackTypeLearnOptions,
  ),
  [localCertificates, referenceBitrixListItems]
  );
  const commisConclOptions = useMemo(
  () => buildReferenceOptions(
  getReferenceListValues('COMMIS_CONCL', normalizeCommisConclValue),
  normalizeSelectValues(localCertificates.map(cert => cert.commis_concl), normalizeCommisConclValue),
  canonicalCommisConclOptions,
  ),
  [localCertificates, referenceBitrixListItems]
  );
  const gradeOptions = useMemo(
  () => buildReferenceOptions(
  getReferenceListValues('GRADE', normalizeGradeValue),
  normalizeSelectValues(localCertificates.map(cert => cert.grade), normalizeGradeValue),
  canonicalGradeOptions,
  ),
  [localCertificates, referenceBitrixListItems]
  );
  const employeeStatusOptions = useMemo(
  () => buildReferenceOptions(
  getReferenceListValues('EMPLOYEE_STATUS', normalizeEmployeeStatusValue),
  normalizeSelectValues(localCertificates.map(cert => cert.employee_status), normalizeEmployeeStatusValue),
  canonicalEmployeeStatusOptions,
  ),
  [localCertificates, referenceBitrixListItems]
  );

 const orderedVisibleColumnKeys = useMemo(
 () => columnOrder.filter(key => visibleColumns[String(key)] !== false),
 [columnOrder, visibleColumns]
 );
 const activeColumnCount = orderedVisibleColumnKeys.length + 1;
 const tableMinWidth = useMemo(() => {
 const mainWidth = orderedVisibleColumnKeys.reduce((sum, key) => sum + (columnWidths[String(key)] || 100), 0);
 const full = mainWidth + (columnWidths.actions || 56);
 return Math.max(1600, full);
 }, [columnWidths, orderedVisibleColumnKeys]);

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

 const sorted = useMemo(() => sortCerts(localCertificates, sortConfig), [localCertificates, sortConfig]);
  const courseOptions = useMemo(
  () => Array.from(new Set(localCertificates.map(cert => String(cert.course_name || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ru')),
  [localCertificates]
  );
  const categoryOptions = useMemo(() => categoryValueOptions, [categoryValueOptions]);
 const visibleRows = useMemo(
 () => sorted.filter(cert => {
 if (courseFilter !== 'all' && cert.course_name !== courseFilter) return false;
 if (categoryFilter !== 'all' && cert.category !== categoryFilter) return false;
 if (printedFilter === 'Да' && !cert.is_printed) return false;
 if (printedFilter === 'Нет' && cert.is_printed) return false;
 return true;
 }),
 [sorted, courseFilter, categoryFilter, printedFilter]
 );
 const targetRowsInfo = [
 courseFilter === 'all' ? 'все курсы' : `курс: ${courseFilter}`,
 categoryFilter === 'all' ? 'все категории' : `категория: ${categoryFilter}`,
 printedFilter === 'all' ? 'статус печати: все' : `статус печати: ${printedFilter}`,
 ].join(', ');
 const hasBitrixRows = useMemo(
 () => localCertificates.some(cert => String(cert.bitrix_item_id || '').trim().length > 0 || cert.sync_status === 'synced'),
 [localCertificates]
 );
 const participantPhotoById = useMemo(() => {
 const map = new Map<string, string>();
 for (const participant of participants) {
 if (!participant.id) continue;
 map.set(participant.id, String(participant.photo_url || '').trim());
 }
 return map;
 }, [participants]);

 function autoExpiryPatchForCertificate(cert: Certificate, patch: Partial<Certificate>) {
 const shouldRecalculate =
 Object.prototype.hasOwnProperty.call(patch, 'start_date') ||
 Object.prototype.hasOwnProperty.call(patch, 'course_name') ||
 Object.prototype.hasOwnProperty.call(patch, 'category');

 if (!shouldRecalculate) {
 return { patch, missingRule: false };
 }

 const nextStartDate = Object.prototype.hasOwnProperty.call(patch, 'start_date')
 ? patch.start_date ?? null
 : cert.start_date;
 const nextCourseName = Object.prototype.hasOwnProperty.call(patch, 'course_name')
 ? String(patch.course_name || '')
 : cert.course_name;
 const nextCategory = Object.prototype.hasOwnProperty.call(patch, 'category')
 ? String(patch.category || '')
 : cert.category;

 if (!nextStartDate) {
 return {
 patch: { ...patch, expiry_date: null },
 missingRule: false,
 };
 }

 const { expiryDate, usedDefault } = resolveDocumentExpiryFromRule({
 rules: documentValidityRules,
 courseName: nextCourseName,
 category: nextCategory,
 startDate: nextStartDate,
 });

 if (expiryDate && !usedDefault) {
 return {
 patch: { ...patch, expiry_date: expiryDate },
 missingRule: false,
 };
 }

 return {
 patch: { ...patch, expiry_date: null },
 missingRule: true,
 };
 }

 function missingRuleMessage(cert: Pick<Certificate, 'course_name' | 'category'>) {
 const courseName = String(cert.course_name || '').trim() || 'без курса';
 const category = String(cert.category || '').trim() || 'без категории';
 return `Не найдено правило срока документа для курса "${courseName}" и категории "${category}"`;
 }

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
 for (const field of TEXT_FIELDS) nextVisible[String(field.key)] = true;
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

 const onMove = (moveEvent: MouseEvent) => {
 const next = Math.max(70, startWidth + (moveEvent.clientX - startX));
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
 const sourceIndex = prev.findIndex(key => String(key) === sourceKey);
 const targetIndex = prev.findIndex(key => String(key) === targetKey);
 if (sourceIndex < 0 || targetIndex < 0) return prev;
 const next = [...prev];
 const [moved] = next.splice(sourceIndex, 1);
 next.splice(targetIndex, 0, moved);
 return next;
 });
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

 async function saveDirectPatch(certId: string, patch: Partial<Certificate>) {
 if (saving) return;
 setSaving(true);
 try {
 const currentCertificate = localCertificates.find(cert => cert.id === certId);
 if (!currentCertificate) return;

 const { patch: normalizedPatch, missingRule } = normalizeCertificatePatchForSave(currentCertificate, { ...patch });
 const { error } = await supabase
 .from('certificates')
 .update({ ...normalizedPatch, updated_at: new Date().toISOString() })
 .eq('id', certId);
 if (error) throw error;

 setLocalCertificates(current => current.map(cert => (
 cert.id === certId
 ? { ...cert, ...normalizedPatch } as Certificate
 : cert
 )));

 if (missingRule) {
 showToast('warning', missingRuleMessage({
 course_name: String(normalizedPatch.course_name ?? currentCertificate.course_name),
 category: String(normalizedPatch.category ?? currentCertificate.category),
 }));
 }

 onRefresh();
 } catch {
 showToast('error', 'Ошибка сохранения');
 } finally {
 setSaving(false);
 }
 }

 async function saveEdit() {
 if (!editCell) return;
 setSaving(true);
 try {
 const currentCertificate = localCertificates.find(cert => cert.id === editCell.certId);
 if (!currentCertificate) {
 setSaving(false);
 return;
 }

 let valueToSave: string | number | null = editCell.field.includes('date') ? (editValue ? editValue : null) : editValue;
 if (editCell.field === 'price') {
 const normalized = String(editValue || '').replace(',', '.').trim();
 if (!normalized) {
 valueToSave = null;
 } else {
 const parsed = Number(normalized);
 if (!Number.isFinite(parsed)) {
 showToast('error', 'Поле цены должно быть числом');
 setSaving(false);
 return;
 }
 valueToSave = parsed;
 }
 }

 const basePatch = { [editCell.field]: valueToSave } as Partial<Certificate>;
 const { patch, missingRule } = normalizeCertificatePatchForSave(currentCertificate, basePatch);
 const { error } = await supabase
 .from('certificates')
 .update({ ...patch, updated_at: new Date().toISOString() })
 .eq('id', editCell.certId);
 if (error) throw error;

 setLocalCertificates(current => current.map(cert => (
 cert.id === editCell.certId
 ? { ...cert, ...patch } as Certificate
 : cert
 )));

 if (missingRule) {
 showToast('warning', missingRuleMessage({
 course_name: String(basePatch.course_name ?? currentCertificate.course_name),
 category: String(basePatch.category ?? currentCertificate.category),
 }));
 }

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
 const normalizedUpdates = updates.map(({ id, patch }) => {
 const currentCertificate = localCertificates.find(cert => cert.id === id);
 if (!currentCertificate) {
 return { id, patch };
 }
 const normalized = normalizeCertificatePatchForSave(currentCertificate, { ...patch });
 return {
 id,
 patch: normalized.patch,
 };
 });
 const results = await Promise.all(
 normalizedUpdates.map(({ id, patch }) =>
 supabase
 .from('certificates')
 .update({ ...patch, updated_at: now })
 .eq('id', id)
 )
 );

 const errorCount = results.filter(result => result.error).length;
 const successIds = new Set(
 normalizedUpdates
 .filter((_, index) => !results[index]?.error)
 .map(item => item.id)
 );
 if (successIds.size > 0) {
 setLocalCertificates(current => current.map(cert => {
 if (!successIds.has(cert.id)) return cert;
 const patch = normalizedUpdates.find(item => item.id === cert.id)?.patch || {};
 return { ...cert, ...patch } as Certificate;
 }));
 }
 if (errorCount > 0) {
 showToast('warning', `Массовое заполнение: ${normalizedUpdates.length - errorCount} из ${normalizedUpdates.length}`);
 } else {
 showToast('success', `Заполнено ${normalizedUpdates.length} строк (${targetRowsInfo})`);
 }
 onRefresh();
 } finally {
 setBulkSaving(false);
 }
 }

async function bulkFillNumber(field: 'document_number' | 'protocol_number', label: string) {
 if (bulkSaving) return;
 const promptLabel = field === 'document_number'
 ? 'номер документа'
 : field === 'protocol_number'
   ? 'номер протокола'
   : label;
 const startRaw = window.prompt(`Начальный номер для ${promptLabel} (${targetRowsInfo}):`, '1');
 if (startRaw === null) return;
 const start = Number(startRaw);
 if (!Number.isInteger(start) || start < 0) {
 showToast('error', 'Начальное значение должно быть >= 0');
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
 `Режим заполнения поля протокол (${targetRowsInfo}):\n1 - последовательный\n2 - одинаковое значение`,
 '1'
 );
 if (modeRaw === null) return;

 const mode = modeRaw.trim();
 if (mode === '1') {
 await bulkFillNumber('protocol_number', 'протокола');
 return;
 }

 if (mode === '2') {
 const value = window.prompt(`Введите значение для протокола (${targetRowsInfo}):`, '');
 if (value === null) return;
 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { protocol_number: value } as Partial<Certificate>,
 }))
 );
 return;
 }

 showToast('warning', 'Укажите режим: 1 или 2');
 }

 async function bulkFillText(field: keyof Certificate, label: string) {
 if (bulkSaving) return;
 const value = window.prompt(`Введите текст для ${label} (${targetRowsInfo}):`, '');
 if (value === null) return;
 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { [field]: value } as Partial<Certificate>,
 }))
 );
 }

 async function bulkFillMarkerPass() {
 if (bulkSaving) return;
 if (!bulkMarkerPass.trim()) {
 showToast('warning', 'Выберите значение для поля "Отметка о проверке знаний"');
 return;
 }

 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { marker_pass: bulkMarkerPass } as Partial<Certificate>,
 }))
 );
 }

 async function bulkFillCategory() {
 if (bulkSaving) return;
 if (!bulkCategory.trim()) {
 showToast('warning', 'Выберите значение для поля "Категория"');
 return;
 }

 const missingRules: string[] = [];
 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: (() => {
 const next = autoExpiryPatchForCertificate(row, { category: bulkCategory });
 if (next.missingRule) {
 missingRules.push(`${row.course_name || 'без курса'} / ${bulkCategory}`);
 }
 return next.patch;
 })(),
 }))
 );

 if (missingRules.length > 0) {
 const preview = Array.from(new Set(missingRules)).slice(0, 3).join('; ');
 showToast('warning', `Для части строк срок документа не пересчитан из-за отсутствия правила. ${preview}`);
 }
 }

 async function bulkFillIssuerCompany() {
 if (bulkSaving) return;
 if (!bulkIssuerCompany.trim()) {
 showToast('warning', 'Выберите значение для поля "Компания, которая выдает удостоверение"');
 return;
 }

 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: applyIssuerCompanyRelations(referenceBitrixListItems, { issuer_company: bulkIssuerCompany } as Partial<Certificate>),
 }))
 );
 }

 async function bulkFillCommissionChair() {
 if (bulkSaving) return;
 if (!bulkCommissionChair.trim()) {
 showToast('warning', 'Выберите значение для поля "Председатель"');
 return;
 }

 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { commission_chair: bulkCommissionChair } as Partial<Certificate>,
 }))
 );
 }

 async function bulkFillTypeLearn() {
 if (bulkSaving) return;
 if (!bulkTypeLearn.trim()) {
 showToast('warning', 'Выберите значение для поля "Вид проверки / тип / причина"');
 return;
 }

 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { type_learn: bulkTypeLearn } as Partial<Certificate>,
 }))
 );
 }

 async function bulkFillCommisConcl() {
 if (bulkSaving) return;
 if (!bulkCommisConcl.trim()) {
 showToast('warning', 'Выберите значение для поля "Заключение комиссии"');
 return;
 }

 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { commis_concl: bulkCommisConcl } as Partial<Certificate>,
 }))
 );
 }

 async function bulkFillGrade() {
 if (bulkSaving) return;
 if (!bulkGrade.trim()) {
 showToast('warning', 'Выберите значение для поля "Оценка за квалиф. экзамен"');
 return;
 }

 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { grade: bulkGrade } as Partial<Certificate>,
 }))
 );
 }

 async function bulkFillEmployeeStatus() {
 if (bulkSaving) return;
 if (!bulkEmployeeStatus.trim()) {
 showToast('warning', 'Выберите значение для поля "Статус сотрудника"');
 return;
 }

 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { employee_status: bulkEmployeeStatus } as Partial<Certificate>,
 }))
 );
 }

 async function bulkFillPrintedStatus() {
 if (bulkSaving) return;
 if (!bulkPrintedStatus.trim()) {
 showToast('warning', 'Выберите значение для поля "Напечатан"');
 return;
 }

 const nextPrinted = bulkPrintedStatus === 'Да';
 await runBulk(
 visibleRows.map(row => ({
 id: row.id,
 patch: { is_printed: nextPrinted } as Partial<Certificate>,
 }))
 );
 }

 async function bulkFillPrice() {
 if (bulkSaving) return;
 const value = window.prompt(`Введите цену (${targetRowsInfo}):`, '');
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
 showToast('error', 'Поле цены должно быть числом');
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

 const missingRules: string[] = [];
 const updates = visibleRows.map(row => {
 const basePatch = { [field]: normalized || null } as Partial<Certificate>;
 if (field === 'start_date') {
 const next = autoExpiryPatchForCertificate(row, basePatch);
 if (next.missingRule) {
 missingRules.push(`${row.course_name || 'без курса'} / ${row.category || 'без категории'}`);
 }
 return {
 id: row.id,
 patch: next.patch,
 };
 }

 return {
 id: row.id,
 patch: basePatch,
 };
 });

 await runBulk(
 updates
 );

 if (field === 'start_date' && missingRules.length > 0) {
 const preview = Array.from(new Set(missingRules)).slice(0, 3).join('; ');
 showToast('warning', `Для части строк срок документа не пересчитан из-за отсутствия правила. ${preview}`);
 }
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
 if (cert.is_printed) {
 skipped++;
 continue;
 }

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
 showToast('warning', 'Нет поддерживаемых записей для генерации файлов');
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
 try {
 const certIds = group.rows.map(row => row.cert.id);
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
 template: group.template,
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
 doc_type: group.template.docType,
 template_name: group.template.name,
 file_name: fileName,
 file_url: fileUrl,
 course_name: row.cert.course_name || '',
 category: row.cert.category || '',
 employees_count: group.rows.length,
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
 showToast('success', `Сгенерировано файлов: ${generated}. Пропущено групп: ${skipped}. Ошибок: ${failed}.`);
 if (unresolvedByFile.length > 0) {
 const preview = unresolvedByFile
 .slice(0, 2)
 .map(item => `${item.fileName}: ${item.tokens.slice(0, 4).join(', ')}`)
 .join(' | ');
 showToast('warning', `В ${unresolvedByFile.length} файлах остались незаполненные плейсхолдеры. ${preview}`);
 }
 if (photoIssuesByFile.length > 0) {
 const preview = photoIssuesByFile
 .slice(0, 2)
 .map(item => `${item.fileName}: ${item.issues.slice(0, 2).join(', ')}`)
 .join(' | ');
 showToast('warning', `Есть проблемы с фото в ${photoIssuesByFile.length} файлах. ${preview}`);
 }
 } else if (skipped > 0 && failed === 0) {
 showToast('warning', 'Нет поддерживаемых записей для генерации файлов');
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
 showToast('error', 'Нельзя синхронизировать, пока не заполнены ID сделки и компании в Bitrix24');
 return;
 }
 if (!String(profile?.bitrix_user_id || '').trim()) {
 showToast('error', 'Для текущего пользователя не назначен сотрудник Bitrix');
 return;
 }
 if (visibleRows.length === 0) {
 showToast('warning', 'Нет строк для выгрузки');
 return;
 }

 setSyncingBitrix(true);
 try {
 const entityTypeId = await findSmartProcessEntityTypeId();
 let bitrixListItemsForSync = referenceBitrixListItems;
 if (bitrixListItemsForSync.length === 0) {
 const loadedReferences = await loadReferenceSelects();
 bitrixListItemsForSync = loadedReferences.bitrixListItems;
 }
 let success = 0;
 let failed = 0;

 for (const cert of visibleRows) {
 try {
 const issuerCompanyValue = String(cert.issuer_company || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'MY_COMPANIES', cert.issuer_company || '')
 : '';
 if (String(cert.issuer_company || '').trim() && !issuerCompanyValue) {
 throw new Error(`Не найдена компания Bitrix для поля "Компания, которая выдает удостоверение": ${cert.issuer_company}`);
 }

 const categoryValue = String(cert.category || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'CATEGORIES', cert.category || '')
 : '';
 if (String(cert.category || '').trim() && !categoryValue) {
 throw new Error(`Не найден элемент Bitrix для поля "Категория": ${cert.category}`);
 }

 const courseValue = String(cert.course_name || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'COURSES', cert.course_name || '')
 : '';
 if (String(cert.course_name || '').trim() && !courseValue) {
 throw new Error(`Не найден элемент Bitrix для поля "Наименование курсов": ${cert.course_name}`);
 }

 const normalizedMarkerPass = normalizeMarkerPassValue(cert.marker_pass || '');
 const markerPassValue = String(normalizedMarkerPass || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'MARKER_PASS', normalizedMarkerPass, [cert.marker_pass || ''])
 : '';
 if (String(normalizedMarkerPass || '').trim() && !markerPassValue) {
 throw new Error(`Не найден вариант Bitrix для поля "Отметка о проверке знаний": ${normalizedMarkerPass}`);
 }

 const normalizedTypeLearn = normalizeTypeLearnValue(cert.type_learn || '');
 const typeLearnValue = String(normalizedTypeLearn || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'TYPE_LEARN', normalizedTypeLearn, [cert.type_learn || ''])
 : '';
 if (String(normalizedTypeLearn || '').trim() && !typeLearnValue) {
 throw new Error(`Не найден вариант Bitrix для поля "Вид проверки знаний / тип обучения": ${normalizedTypeLearn}`);
 }

 const normalizedCommisConcl = toBitrixCommisConclValue(cert.commis_concl || '');
 const commisConclValue = String(normalizedCommisConcl || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'COMMIS_CONCL', normalizedCommisConcl, [
 cert.commis_concl || '',
 normalizeCommisConclValue(cert.commis_concl || ''),
 ])
 : '';
 if (String(normalizedCommisConcl || '').trim() && !commisConclValue) {
 throw new Error(`Не найден вариант Bitrix для поля "Заключение комиссии": ${normalizedCommisConcl}`);
 }

 const normalizedGrade = normalizeGradeValue(cert.grade || '');
 const gradeValue = String(normalizedGrade || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'GRADE', normalizedGrade, [cert.grade || ''])
 : '';
 if (String(normalizedGrade || '').trim() && !gradeValue) {
 throw new Error(`Не найден вариант Bitrix для поля "Оценка за квалиф. экзамен": ${normalizedGrade}`);
 }

 const normalizedEmployeeStatus = normalizeEmployeeStatusValue(cert.employee_status || '');
 const employeeStatusValue = String(normalizedEmployeeStatus || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'EMPLOYEE_STATUS', normalizedEmployeeStatus, [cert.employee_status || ''])
 : '';
 if (String(normalizedEmployeeStatus || '').trim() && !employeeStatusValue) {
 throw new Error(`Не найден вариант Bitrix для поля "Статус сотрудника": ${normalizedEmployeeStatus}`);
 }

 const documentTypeName = String(
 findDocumentValidityRule(documentValidityRules, cert.course_name, cert.category)?.document_type ||
 defaultDocumentType(cert.category, cert.course_name)
 ).trim();
 const documentTypeValue = documentTypeName
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'DOCUMENT_TYPE', documentTypeName)
 : '';
 if (!documentTypeValue) {
 throw new Error(`Не найден элемент Bitrix для поля "Тип документа": ${documentTypeName || 'пустое значение'}`);
 }
 const effectiveCommissionChair = String(cert.commission_chair || '').trim()
 ? String(cert.commission_chair || '').trim()
 : resolveChairmanByIssuerCompany(bitrixListItemsForSync, cert.issuer_company || '');
 const fieldEntries: SmartFieldEntry[] = [
 { code: 'TITLE', kind: 'text', value: [cert.last_name, cert.first_name, cert.middle_name, cert.course_name].filter(Boolean).join(' - ') },
 { code: BITRIX_FIELDS.LAST_NAME, kind: 'text', value: cert.last_name || '' },
 { code: BITRIX_FIELDS.FIRST_NAME, kind: 'text', value: cert.first_name || '' },
 { code: BITRIX_FIELDS.MIDDLE_NAME, kind: 'text', value: cert.middle_name || '' },
 { code: BITRIX_FIELDS.POSITION, kind: 'text', value: cert.position || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.CATEGORY, kind: 'link', value: categoryValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.COURSE_NAME, kind: 'link', value: courseValue || '' },
 { code: BITRIX_FIELDS.COURSE_START_DATE, kind: 'date', value: toBitrixDate(cert.start_date) },
 { code: BITRIX_FIELDS.DOCUMENT_EXPIRY_DATE, kind: 'date', value: toBitrixDate(cert.expiry_date) },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.ISSUER_COMPANY, kind: 'link', value: issuerCompanyValue || '' },
 { code: BITRIX_FIELDS.COMMISSION_CHAIR, kind: 'text', value: effectiveCommissionChair },
 { code: BITRIX_FIELDS.PROTOCOL, kind: 'text', value: cert.protocol_number || '' },
 { code: BITRIX_FIELDS.DOCUMENT_NUMBER, kind: 'text', value: cert.document_number || '' },
 { code: BITRIX_FIELDS.COMMISSION_MEMBER_1, kind: 'text', value: cert.commission_member_1 || '' },
 { code: BITRIX_FIELDS.COMMISSION_MEMBER_2, kind: 'text', value: cert.commission_member_2 || '' },
 { code: BITRIX_FIELDS.COMMISSION_MEMBER_3, kind: 'text', value: cert.commission_member_3 || '' },
 { code: BITRIX_FIELDS.COMMISSION_MEMBER_4, kind: 'text', value: cert.commission_member_4 || '' },
 { code: BITRIX_FIELDS.COMMISSION_MEMBERS, kind: 'text', value: cert.commission_members || '' },
 { code: BITRIX_FIELDS.QUALIFICATION, kind: 'text', value: cert.qualification || '' },
 { code: BITRIX_FIELDS.LEVEL, kind: 'text', value: cert.level || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.MARKER_PASS, kind: 'link', value: markerPassValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.TYPE_LEARN, kind: 'link', value: typeLearnValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.COMMIS_CONCL, kind: 'link', value: commisConclValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.GRADE, kind: 'link', value: gradeValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.DOCUMENT_TYPE, kind: 'link', value: documentTypeValue || '' },
 { code: BITRIX_FIELDS.MANAGER, kind: 'text', value: cert.manager || '' },
 { code: BITRIX_FIELDS.IS_PRINTED, kind: 'boolean', value: cert.is_printed ? 'Y' : 'N' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.EMPLOYEE_STATUS, kind: 'link', value: employeeStatusValue || '' },
 { code: BITRIX_FIELDS.PRICE, kind: 'number', value: cert.price ?? '' },
 ];
 const fields = fieldEntries.reduce<Record<string, unknown>>((acc, entry) => {
 acc[entry.code] = entry.value;
 return acc;
 }, {});

 const existingItemId = String(cert.bitrix_item_id || '').trim();
 let finalItemId = existingItemId;
 let currentBitrixItem: Record<string, unknown> | null = null;

 if (/^\d+$/.test(existingItemId)) {
 try {
 currentBitrixItem = await fetchSmartProcessItem({
 entityTypeId,
 itemId: existingItemId,
 });
 } catch (error) {
 if (isBitrixItemMissingError(error)) {
 finalItemId = '';
 currentBitrixItem = null;
 } else {
 throw error;
 }
 }
 } else {
 finalItemId = '';
 }

 if (finalItemId && currentBitrixItem) {
 const changedFields = buildSmartProcessDiff(currentBitrixItem, fieldEntries);
 if (Object.keys(changedFields).length > 0) {
 await updateSmartProcessItem({
 entityTypeId,
 itemId: finalItemId,
 assignedById: String(profile?.bitrix_user_id || '').trim(),
 fields: changedFields,
 });
 }
 } else {
 finalItemId = await createSmartProcessItem({
 entityTypeId,
 dealId: bitrixDealId,
 companyId: bitrixCompanyId,
 assignedById: String(profile?.bitrix_user_id || '').trim(),
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
 } catch (error) {
 const message = error instanceof Error ? error.message : String(error || 'sync failed');
 await supabase.from('certificates').update({
 sync_status: 'error',
 sync_error: message,
 updated_at: new Date().toISOString(),
 }).eq('id', cert.id);
 failed++;
 }
 }

 if (failed > 0) {
 showToast('warning', `Синхронизация сертификатов: ${success} успешно, ${failed} с ошибкой`);
 } else {
 showToast('success', `Данные отправлены в Bitrix: ${success} строк`);
 }
 onRefresh();
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Ошибка синхронизации';
 showToast('error', message);
 } finally {
 setSyncingBitrix(false);
 }
 }

 return {
 AUX_COLUMN_LABELS,
 BULK_TEXT_FILL_FIELDS,
 TEXT_FIELDS,
 sortConfig,
 editCell,
 editValue,
 saving,
 bulkSaving,
 syncingBitrix,
 generatingDocs,
 courseFilter,
 categoryFilter,
 printedFilter,
 bulkStartDate,
 bulkExpiryDate,
 bulkCategory,
 categoryValueOptions,
 bulkIssuerCompany,
 issuerCompanyOptions,
 bulkCommissionChair,
 commissionChairOptions,
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
 printedFilterOptions,
 columnsMenuOpen,
 columnsMenuRef,
 visibleColumns,
 columnWidths,
 draggingColumn,
 generationProgress,
 orderedVisibleColumnKeys,
 activeColumnCount,
 tableMinWidth,
 courseOptions,
 categoryOptions,
 visibleRows,
 targetRowsInfo,
 hasBitrixRows,
 setEditCell,
 setEditValue,
 setCourseFilter,
 setCategoryFilter,
 setPrintedFilter,
 setBulkStartDate,
 setBulkExpiryDate,
 setBulkCategory,
 setBulkIssuerCompany,
 setBulkCommissionChair,
 setBulkMarkerPass,
 setBulkTypeLearn,
 setBulkCommisConcl,
 setBulkGrade,
 setBulkEmployeeStatus,
 setBulkPrintedStatus,
 setColumnsMenuOpen,
 setDraggingColumn,
 handleSort,
 toggleColumn,
 resetColumns,
 beginResizeColumn,
 moveColumn,
 addCertificate,
 deleteCertificate,
 startEdit,
 saveEdit,
 bulkFillNumber,
 bulkFillProtocolWithMode,
 bulkFillText,
 bulkFillCategory,
 bulkFillIssuerCompany,
 bulkFillCommissionChair,
 bulkFillMarkerPass,
 bulkFillTypeLearn,
 bulkFillCommisConcl,
 bulkFillGrade,
 bulkFillEmployeeStatus,
 bulkFillPrintedStatus,
 bulkFillPrice,
 bulkFillDate,
 saveDirectPatch,
 generateDocuments,
 syncCertificatesToBitrix,
 };
}
