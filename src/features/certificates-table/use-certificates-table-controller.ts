import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { supabase } from '../../lib/supabase';
import {
 BITRIX_CERTIFICATE_REFERENCE_FIELDS,
 BITRIX_FIELDS,
 BITRIX_FIELDS_RAW,
 callBitrix,
 createSmartProcessItem,
 fetchSmartProcessItem,
 findSmartProcessEntityTypeId,
 getBitrixFieldValue,
 updateSmartProcessItem,
} from '../../lib/bitrix';
import { resolveCourseOption } from '../../lib/courseOptions';
import {
  PREVIOUS_ELECTRICAL_SAFETY_GROUP_OPTIONS,
  isElectricalSafetyCourse,
  normalizePreviousElectricalSafetyGroup,
} from '../../lib/electricalSafety';
import { buildPlaceholders, callGenerateDocumentFunction, resolveTemplateForCertificate, templateSupportsPhoto } from '../../lib/documentGeneration';
import { defaultDocumentType, findDocumentValidityRule, resolveDocumentExpiryFromRule } from '../../lib/documentValidity';
import { reconcileProtocolsFromCertificates } from '../../lib/protocolGeneration';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import type { Certificate, Participant, QuestionnaireRequestType, RefBitrixListItem, RefCoursePrice, RefDocumentValidityRule, SortConfig } from '../../types';
import {
 ALL_COLUMN_KEYS,
 AUX_COLUMN_LABELS,
 BULK_TEXT_FILL_FIELDS,
 DEFAULT_COLUMN_WIDTHS,
 getCertificateDisplayName,
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
 requestType?: QuestionnaireRequestType;
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
 requestType = 'external',
 certificates,
 onRefresh,
}: CertificatesTableProps) {
 const { profile } = useAuth();
 const { showToast } = useToast();
 const isInternalRequest = requestType === 'internal';
  const fallbackCategoryOptions = ['ИТР', 'Обычный'];
  const fallbackTypeLearnOptions = ['очередная', 'первичная', 'повторная', 'периодическая'];
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
  type CourseSpecificFieldKey = 'qualification' | 'electrical_safety_group';

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
 if (normalized === 'очередной' || normalized === 'очередная') return 'очередная';
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

 function normalizeLocalCertificate(cert: Certificate): Certificate {
 return {
 ...cert,
 issuer_company: String(cert.issuer_company || '').trim(),
 commission_chair: String(cert.commission_chair || '').trim(),
 manager: String(cert.manager || '').trim(),
 commission_members_protocol: String(cert.commission_members_protocol || '').trim(),
 electrical_safety_admission_protocol: String(cert.electrical_safety_admission_protocol || '').trim(),
 marker_pass: normalizeMarkerPassValue(cert.marker_pass),
 type_learn: normalizeTypeLearnValue(cert.type_learn),
 previous_electrical_safety_group: isElectricalSafetyCourse(cert.course_name)
 ? normalizePreviousElectricalSafetyGroup(cert.previous_electrical_safety_group)
 : '',
 commis_concl: normalizeCommisConclValue(cert.commis_concl),
 grade: normalizeGradeValue(cert.grade),
 employee_status: normalizeEmployeeStatusValue(cert.employee_status),
 };
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
  const [bulkManager, setBulkManager] = useState<string>('');
  const [bulkQualification, setBulkQualification] = useState<string>('');
  const [bulkElectricalSafetyGroup, setBulkElectricalSafetyGroup] = useState<string>('');
  const [bulkPreviousElectricalSafetyGroup, setBulkPreviousElectricalSafetyGroup] = useState<string>('');
  const [bulkCommissionMembersProtocol, setBulkCommissionMembersProtocol] = useState<string>('');
  const [bulkElectricalSafetyAdmissionProtocol, setBulkElectricalSafetyAdmissionProtocol] = useState<string>('');
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
  const autoCourseSpecificCleanupAttemptedRef = useRef(false);
 const autoCourseSelectionNormalizationAttemptedRef = useRef(false);
  const autoIssuerCompanyRelationsAttemptedRef = useRef(false);

 useEffect(() => {
 setLocalCertificates(certificates.map(normalizeLocalCertificate));
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
  .order('qualification')
  .order('electrical_safety_group'),
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
  .in('list_key', ['MY_COMPANIES', 'COURSES', 'CATEGORIES', 'DOCUMENT_TYPE', 'MARKER_PASS', 'TYPE_LEARN', 'COMMIS_CONCL', 'GRADE', 'EMPLOYEE_STATUS', 'QUALIFICATION', 'ELECTRICAL_SAFETY_GROUP', 'ELECTRICAL_SAFETY_ADMISSION', 'COMMISSION_MEMBERS'])
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

  function normalizeLooseCompanyName(value: string): string {
  return String(value || '')
  .trim()
  .toLocaleLowerCase('ru')
  .replace(/ё/g, 'е')
  .replace(/[«»"'`]/g, ' ')
  .replace(/\b(тоо|ооо|ао|ao|ип|llp|llc)\b/g, ' ')
  .replace(/[^a-zа-я0-9]+/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();
  }

  function companiesLookRelated(left: string, right: string): boolean {
  const normalizedLeft = normalizeLooseCompanyName(left);
  const normalizedRight = normalizeLooseCompanyName(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return (
  normalizedLeft === normalizedRight ||
  normalizedLeft.includes(normalizedRight) ||
  normalizedRight.includes(normalizedLeft)
  );
  }

  function resolvePersonnelCategoryScope(value: string): 'itr' | 'worker' | '' {
  const normalized = normalizeReferenceLookup(value);
  if (!normalized) return '';
  if (/(^| )итр( |$)|инженер|административ|управленчес|технологичес|техническ/.test(normalized)) {
  return 'itr';
  }
  if (/обыч|рабоч|производствен/.test(normalized)) {
  return 'worker';
  }
  return '';
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

  function getBitrixListItemDetails(item: RefBitrixListItem): Record<string, unknown> {
  return item.details_json && typeof item.details_json === 'object'
  ? item.details_json
  : {};
  }

  function getBitrixListItemDetailValue(item: RefBitrixListItem, key: string): string {
  const value = getBitrixListItemDetails(item)[key];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
  return String(value).trim();
  }
  return '';
  }

  function getMyCompanyChairman(item: RefBitrixListItem): string {
  return String(item.code || '').trim();
  }

  function getMyCompanyManager(item: RefBitrixListItem): string {
  return getMyCompanyChairman(item);
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

  function resolveManagerByIssuerCompany(
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

  return match ? getMyCompanyManager(match) : '';
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
  const manager = issuerCompany
  ? resolveManagerByIssuerCompany(listItems, issuerCompany)
  : '';

  return {
  ...patch,
  issuer_company: issuerCompany,
  commission_chair: chairman,
  manager,
  };
  }

  function applyProtocolReferenceFields(
  cert: Certificate,
  patch: Partial<Certificate>,
  ): Partial<Certificate> {
  const nextPatch: Partial<Certificate> = { ...patch };
  const touchesCourseName = Object.prototype.hasOwnProperty.call(patch, 'course_name');
  const touchesIssuerCompany = Object.prototype.hasOwnProperty.call(patch, 'issuer_company');
  const touchesCategory = Object.prototype.hasOwnProperty.call(patch, 'category');
  const touchesCommissionMembersProtocol = Object.prototype.hasOwnProperty.call(patch, 'commission_members_protocol');
  const touchesElectricalSafetyAdmissionProtocol = Object.prototype.hasOwnProperty.call(patch, 'electrical_safety_admission_protocol');

  const nextCourseName = touchesCourseName
  ? String(patch.course_name || '').trim()
  : String(cert.course_name || '').trim();
  const nextIssuerCompany = touchesIssuerCompany
  ? String(patch.issuer_company || '').trim()
  : String(cert.issuer_company || '').trim();
  const nextCategory = touchesCategory
  ? String(patch.category || '').trim()
  : String(cert.category || '').trim();
  const nextCommissionMembersProtocol = touchesCommissionMembersProtocol
  ? String(patch.commission_members_protocol || '').trim()
  : String(cert.commission_members_protocol || '').trim();
  const nextElectricalSafetyAdmissionProtocol = touchesElectricalSafetyAdmissionProtocol
  ? String(patch.electrical_safety_admission_protocol || '').trim()
  : String(cert.electrical_safety_admission_protocol || '').trim();

  if (touchesCommissionMembersProtocol) {
  nextPatch.commission_members_protocol = nextCommissionMembersProtocol;
  }
  if (touchesElectricalSafetyAdmissionProtocol) {
  nextPatch.electrical_safety_admission_protocol = nextElectricalSafetyAdmissionProtocol;
  }

  if ((touchesIssuerCompany || touchesCommissionMembersProtocol) && commissionMembersProtocolReferenceItems.length > 0) {
  const options = getCommissionMembersProtocolOptions(nextIssuerCompany);
  if (nextCommissionMembersProtocol && !isReferenceOptionAllowed(nextCommissionMembersProtocol, options)) {
  nextPatch.commission_members_protocol = '';
  }
  }

  const supportsElectricalSafetyAdmissionProtocol = isElectricalSafetyCourse(nextCourseName);
  if ((touchesCourseName || touchesElectricalSafetyAdmissionProtocol) && !supportsElectricalSafetyAdmissionProtocol) {
  nextPatch.electrical_safety_admission_protocol = '';
  }

  if (
  supportsElectricalSafetyAdmissionProtocol &&
  (touchesCourseName || touchesCategory || touchesElectricalSafetyAdmissionProtocol) &&
  electricalSafetyAdmissionReferenceItems.length > 0
  ) {
  const options = getElectricalSafetyAdmissionProtocolOptions(nextCategory, nextCourseName);
  if (nextElectricalSafetyAdmissionProtocol && !isReferenceOptionAllowed(nextElectricalSafetyAdmissionProtocol, options)) {
  nextPatch.electrical_safety_admission_protocol = '';
  }
  }

  return nextPatch;
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

  function buildDocumentNumberGroupKey(row: Certificate): string {
  const parts = [
  normalizeCoursePriceLookup(row.course_name),
  normalizeCoursePriceLookup(row.category),
  ];

  if (isQualificationCourse(row.course_name)) {
  parts.push(normalizeCoursePriceLookup(row.qualification));
  }

  if (isCourseSpecificFieldApplicable(row.course_name, 'electrical_safety_group')) {
  parts.push(normalizeCoursePriceLookup(row.electrical_safety_group));
  }

  return parts.join('::');
  }

  type DealProductRow = {
  productName: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number;
  };

  function normalizeCertificatePrice(value: Certificate['price']): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
  }

  function formatMoneyPlain(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} \u20b8`;
  }

  function buildDealProductRowsFromCertificates(sourceCertificates: Certificate[]): DealProductRow[] {
  const groups = new Map<string, DealProductRow>();

  for (const cert of sourceCertificates) {
  const courseName = String(cert.course_name || '').trim();
  if (!courseName) continue;

  const categoryLabel = String(cert.category || '').trim() || '\u0411\u0435\u0437 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438';
  const unitPrice = normalizeCertificatePrice(cert.price);
  const productName = `${courseName} (${categoryLabel})`;
  const priceKey = unitPrice === null ? '__missing__' : String(unitPrice);
  const groupKey = `${normalizeCoursePriceLookup(productName)}::${priceKey}`;
  const current = groups.get(groupKey) || {
  productName,
  quantity: 0,
  unitPrice,
  totalPrice: 0,
  };

  current.quantity += 1;
  current.totalPrice = (current.unitPrice ?? 0) * current.quantity;
  groups.set(groupKey, current);
  }

  return Array.from(groups.values()).sort((left, right) => {
  const byName = left.productName.localeCompare(right.productName, 'ru');
  if (byName !== 0) return byName;
  return (left.unitPrice ?? -1) - (right.unitPrice ?? -1);
  });
  }

  async function syncDealProductsAndAmountToBitrix(sourceCertificates: Certificate[]) {
  const dealIdValue = String(bitrixDealId || '').trim();
  if (!dealIdValue) return null;

  const productRows = buildDealProductRowsFromCertificates(sourceCertificates);
  const dealAmount = productRows.reduce((sum, row) => sum + row.totalPrice, 0);
  const bitrixRows = productRows.map(row => ({
  PRODUCT_ID: 0,
  PRODUCT_NAME: row.productName,
  PRICE: row.unitPrice ?? 0,
  QUANTITY: row.quantity,
  MEASURE_CODE: 796,
  MEASURE_NAME: '\u0448\u0442.',
  }));

  await callBitrix('crm.deal.productrows.set', {
  id: dealIdValue,
  rows: bitrixRows,
  });

  await callBitrix('crm.deal.update', {
  id: dealIdValue,
  fields: {
  OPPORTUNITY: dealAmount,
  IS_MANUAL_OPPORTUNITY: 'Y',
  },
  });

  return {
  rowsCount: productRows.length,
  dealAmount,
  };
  }

  function resolveReferencePrice(
  courseName: string,
  category: string,
  qualification: string,
  electricalSafetyGroup: string,
  ): number | null {
  const normalizedCourseName = normalizeCoursePriceLookup(courseName);
  const normalizedCategory = normalizeCoursePriceLookup(category);
  const normalizedQualification = normalizeCoursePriceLookup(qualification);
  const normalizedElectricalSafetyGroup = normalizeCoursePriceLookup(electricalSafetyGroup);

  if (!normalizedCourseName || !normalizedCategory) return null;

  const matchingRows = coursePriceRules.filter(row =>
  normalizeCoursePriceLookup(row.course_name) === normalizedCourseName &&
  normalizeCoursePriceLookup(row.category) === normalizedCategory
  );

  if (matchingRows.length === 0) return null;

  const compatibleRows = matchingRows
  .map(row => ({
  row,
  rowQualification: normalizeCoursePriceLookup(row.qualification),
  rowElectricalSafetyGroup: normalizeCoursePriceLookup(row.electrical_safety_group),
  }))
  .filter(({ rowQualification, rowElectricalSafetyGroup }) =>
  (!rowQualification || rowQualification === normalizedQualification) &&
  (!rowElectricalSafetyGroup || rowElectricalSafetyGroup === normalizedElectricalSafetyGroup)
  )
  .sort((left, right) =>
  (Number(Boolean(right.rowQualification)) + Number(Boolean(right.rowElectricalSafetyGroup))) -
  (Number(Boolean(left.rowQualification)) + Number(Boolean(left.rowElectricalSafetyGroup)))
  );

  const bestMatch = compatibleRows[0]?.row;
  if (bestMatch) {
  const parsed = Number(bestMatch.price);
  if (Number.isFinite(parsed)) return parsed;
  }

  return null;
  }

  function applyCourseSpecificFields(cert: Certificate, patch: Partial<Certificate>): Partial<Certificate> {
  const touchesCourseName = Object.prototype.hasOwnProperty.call(patch, 'course_name');
  const touchesQualification = Object.prototype.hasOwnProperty.call(patch, 'qualification');
  const touchesElectricalSafetyGroup = Object.prototype.hasOwnProperty.call(patch, 'electrical_safety_group');
  const touchesPreviousElectricalSafetyGroup = Object.prototype.hasOwnProperty.call(patch, 'previous_electrical_safety_group');
  const touchesLevel = Object.prototype.hasOwnProperty.call(patch, 'level');
  const nextCourseName = Object.prototype.hasOwnProperty.call(patch, 'course_name')
  ? String(patch.course_name || '')
  : cert.course_name;
  const nextPatch: Partial<Certificate> = { ...patch };
  const supportsPreviousElectricalSafetyGroup = isElectricalSafetyCourse(nextCourseName);

  if (touchesPreviousElectricalSafetyGroup) {
  nextPatch.previous_electrical_safety_group = supportsPreviousElectricalSafetyGroup
  ? normalizePreviousElectricalSafetyGroup(patch.previous_electrical_safety_group)
  : '';
  }
  if (touchesCourseName && supportsPreviousElectricalSafetyGroup && !touchesPreviousElectricalSafetyGroup) {
  nextPatch.previous_electrical_safety_group = normalizePreviousElectricalSafetyGroup(cert.previous_electrical_safety_group);
  }
  if (touchesCourseName && !supportsPreviousElectricalSafetyGroup && String(cert.previous_electrical_safety_group || '').trim()) {
  nextPatch.previous_electrical_safety_group = '';
  }

  if (coursePriceRules.length === 0) return nextPatch;

  const supportsQualification = isQualificationCourse(nextCourseName);
  const supportsElectricalSafetyGroup = isCourseSpecificFieldApplicable(nextCourseName, 'electrical_safety_group');

  if (touchesQualification) {
  nextPatch.qualification = String(patch.qualification || '');
  }
  if (touchesElectricalSafetyGroup) {
  nextPatch.electrical_safety_group = String(patch.electrical_safety_group || '');
  }
  if (touchesLevel) {
  nextPatch.level = String(patch.level || '');
  }

  if ((touchesCourseName || touchesQualification) && !supportsQualification) {
  nextPatch.qualification = '';
  }
  if ((touchesCourseName || touchesLevel) && !supportsQualification) {
  nextPatch.level = '';
  }
  if ((touchesCourseName || touchesElectricalSafetyGroup) && !supportsElectricalSafetyGroup) {
  nextPatch.electrical_safety_group = '';
  }
  if (
  touchesCourseName &&
  supportsQualification &&
  !touchesQualification &&
  cert.qualification &&
  !isCourseSpecificValueAllowed(nextCourseName, 'qualification', cert.qualification)
  ) {
  nextPatch.qualification = '';
  }
  if (
  touchesCourseName &&
  !touchesLevel &&
  !supportsQualification &&
  cert.level
  ) {
  nextPatch.level = '';
  }
  if (
  touchesCourseName &&
  supportsElectricalSafetyGroup &&
  !touchesElectricalSafetyGroup &&
  cert.electrical_safety_group &&
  !isCourseSpecificValueAllowed(nextCourseName, 'electrical_safety_group', cert.electrical_safety_group)
  ) {
  nextPatch.electrical_safety_group = '';
  }

  return nextPatch;
  }

  function buildCourseSpecificCleanupPatch(cert: Certificate): Partial<Certificate> | null {
  const supportsQualification = isQualificationCourse(cert.course_name);
  const supportsElectricalSafetyGroup = isCourseSpecificFieldApplicable(cert.course_name, 'electrical_safety_group');
  const supportsPreviousElectricalSafetyGroup = isElectricalSafetyCourse(cert.course_name);
  const patch: Partial<Certificate> = {};

  if (!supportsQualification && (String(cert.qualification || '').trim() || String(cert.level || '').trim())) {
  patch.qualification = '';
  patch.level = '';
  }

  if (!supportsElectricalSafetyGroup && String(cert.electrical_safety_group || '').trim()) {
  patch.electrical_safety_group = '';
  }
  if (!supportsPreviousElectricalSafetyGroup && String(cert.previous_electrical_safety_group || '').trim()) {
  patch.previous_electrical_safety_group = '';
  }

  return Object.keys(patch).length > 0 ? patch : null;
  }

  function autoPricePatchForCertificate(cert: Certificate, patch: Partial<Certificate>): Partial<Certificate> {
  if (!isInternalRequest) {
  return patch;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'price')) {
  return patch;
  }

  const shouldRecalculate =
  Object.prototype.hasOwnProperty.call(patch, 'course_name') ||
  Object.prototype.hasOwnProperty.call(patch, 'category') ||
  Object.prototype.hasOwnProperty.call(patch, 'qualification') ||
  Object.prototype.hasOwnProperty.call(patch, 'electrical_safety_group');

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
  const nextElectricalSafetyGroup = Object.prototype.hasOwnProperty.call(patch, 'electrical_safety_group')
  ? String(patch.electrical_safety_group || '')
  : cert.electrical_safety_group;
  const nextPrice = resolveReferencePrice(nextCourseName, nextCategory, nextQualification, nextElectricalSafetyGroup);

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
  const patchWithProtocolReferences = applyProtocolReferenceFields(cert, patchWithRelations);
  const patchWithCourseSpecificFields = applyCourseSpecificFields(cert, patchWithProtocolReferences);
  const patchWithPrice = autoPricePatchForCertificate(cert, patchWithCourseSpecificFields);
  return autoExpiryPatchForCertificate(cert, patchWithPrice);
  }

  useEffect(() => {
  autoPriceBackfillAttemptedRef.current = false;
  autoCourseSpecificCleanupAttemptedRef.current = false;
  autoCourseSelectionNormalizationAttemptedRef.current = false;
  autoIssuerCompanyRelationsAttemptedRef.current = false;
  }, [questionnaireId]);

  useEffect(() => {
  if (autoCourseSelectionNormalizationAttemptedRef.current) return;
  if (coursePriceRules.length === 0 || localCertificates.length === 0) return;

  autoCourseSelectionNormalizationAttemptedRef.current = true;
  const updates = localCertificates
  .map(cert => {
  const parsed = resolveCourseOption(cert.course_name, coursePriceRules, cert.category);
  const nextCourseName = String(parsed.courseName || '').trim();
  const nextQualification = String(cert.qualification || '').trim() || String(parsed.qualification || '').trim();
  const nextElectricalSafetyGroup = String(cert.electrical_safety_group || '').trim() || String(parsed.electricalSafetyGroup || '').trim();

  const patch: Partial<Certificate> = {};
  if (nextCourseName && nextCourseName !== String(cert.course_name || '').trim()) {
  patch.course_name = nextCourseName;
  }
  if (nextQualification !== String(cert.qualification || '').trim()) {
  patch.qualification = nextQualification;
  }
  if (nextElectricalSafetyGroup !== String(cert.electrical_safety_group || '').trim()) {
  patch.electrical_safety_group = nextElectricalSafetyGroup;
  }

  return Object.keys(patch).length > 0
  ? { id: cert.id, patch }
  : null;
  })
  .filter((item): item is { id: string; patch: Partial<Certificate> } => Boolean(item));

  if (updates.length === 0) return;

  const now = new Date().toISOString();
  void Promise.all(
  updates.map(item =>
  supabase
  .from('certificates')
  .update({ ...item.patch, updated_at: now })
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
  return { ...cert, ...updated.patch } as Certificate;
  }));
  onRefresh();
  });
  }, [coursePriceRules, localCertificates, onRefresh]);

  useEffect(() => {
  if (autoIssuerCompanyRelationsAttemptedRef.current) return;
  if (referenceBitrixListItems.length === 0 || localCertificates.length === 0) return;
  if (!referenceBitrixListItems.some(item => item.list_key === 'MY_COMPANIES')) return;

  autoIssuerCompanyRelationsAttemptedRef.current = true;
  const updates = localCertificates
  .map(cert => {
  const expectedRelations = applyIssuerCompanyRelations(referenceBitrixListItems, {
  issuer_company: String(cert.issuer_company || '').trim(),
  } as Partial<Certificate>);
  const normalizedIssuerCompany = String(expectedRelations.issuer_company || '').trim();
  const normalizedCommissionChair = String(expectedRelations.commission_chair || '').trim();
  const normalizedManager = String(expectedRelations.manager || '').trim();

  if (
  String(cert.issuer_company || '').trim() === normalizedIssuerCompany &&
  String(cert.commission_chair || '').trim() === normalizedCommissionChair &&
  String(cert.manager || '').trim() === normalizedManager
  ) {
  return null;
  }

  return {
  id: cert.id,
  patch: {
  issuer_company: normalizedIssuerCompany,
  commission_chair: normalizedCommissionChair,
  manager: normalizedManager,
  } as Partial<Certificate>,
  };
  })
  .filter((item): item is { id: string; patch: Partial<Certificate> } => Boolean(item));

  if (updates.length === 0) return;

  const now = new Date().toISOString();
  void Promise.all(
  updates.map(item =>
  supabase
  .from('certificates')
  .update({ ...item.patch, updated_at: now })
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
  return { ...cert, ...updated.patch } as Certificate;
  }));
  onRefresh();
  });
  }, [localCertificates, onRefresh, referenceBitrixListItems]);

  useEffect(() => {
  if (autoCourseSpecificCleanupAttemptedRef.current) return;
  if (coursePriceRules.length === 0 || localCertificates.length === 0) return;

  autoCourseSpecificCleanupAttemptedRef.current = true;
  const updates = localCertificates
  .map(cert => {
  const cleanupPatch = buildCourseSpecificCleanupPatch(cert);
  if (!cleanupPatch) return null;
  const normalized = normalizeCertificatePatchForSave(cert, cleanupPatch);
  return {
  id: cert.id,
  patch: normalized.patch,
  };
  })
  .filter((item): item is { id: string; patch: Partial<Certificate> } => Boolean(item));

  if (updates.length === 0) return;

  const now = new Date().toISOString();
  void Promise.all(
  updates.map(item =>
  supabase
  .from('certificates')
  .update({ ...item.patch, updated_at: now })
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
  return { ...cert, ...updated.patch } as Certificate;
  }));
  onRefresh();
  });
  }, [coursePriceRules, localCertificates, onRefresh]);

  useEffect(() => {
  if (!isInternalRequest) return;
  if (autoPriceBackfillAttemptedRef.current) return;
  if (coursePriceRules.length === 0 || localCertificates.length === 0) return;

  autoPriceBackfillAttemptedRef.current = true;
  const updates = localCertificates
  .filter(cert => cert.price == null)
  .map(cert => {
  const price = resolveReferencePrice(
  cert.course_name,
  cert.category,
  cert.qualification,
  cert.electrical_safety_group,
  );
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
  }, [coursePriceRules, isInternalRequest, localCertificates, onRefresh, questionnaireId]);

  const myCompanyReferenceItems = useMemo(
  () => referenceBitrixListItems.filter(item => item.list_key === 'MY_COMPANIES'),
  [referenceBitrixListItems]
  );
  const commissionMembersProtocolReferenceItems = useMemo(
  () => referenceBitrixListItems.filter(item => item.list_key === 'COMMISSION_MEMBERS'),
  [referenceBitrixListItems]
  );
  const electricalSafetyAdmissionReferenceItems = useMemo(
  () => referenceBitrixListItems.filter(item => item.list_key === 'ELECTRICAL_SAFETY_ADMISSION'),
  [referenceBitrixListItems]
  );

  function isReferenceOptionAllowed(value: string, options: string[]): boolean {
  const normalizedValue = normalizeReferenceLookup(value);
  if (!normalizedValue) return false;
  return options.some(option => normalizeReferenceLookup(option) === normalizedValue);
  }

  function getCommissionMembersProtocolOptions(issuerCompany: string): string[] {
  const normalizedIssuerCompany = normalizeReferenceLookup(issuerCompany);
  const relevantItems = commissionMembersProtocolReferenceItems.filter(item => {
  if (!normalizedIssuerCompany) return true;
  const referenceCompany = getBitrixListItemDetailValue(item, 'my_company');
  return (
  normalizeReferenceLookup(referenceCompany) === normalizedIssuerCompany ||
  companiesLookRelated(referenceCompany, issuerCompany)
  );
  });

  if (relevantItems.length > 0) {
  return normalizeSelectValues(relevantItems.map(item => item.name));
  }

  if (commissionMembersProtocolReferenceItems.length > 0) {
  return normalizeSelectValues(commissionMembersProtocolReferenceItems.map(item => item.name));
  }

  return normalizeSelectValues(localCertificates.map(cert => cert.commission_members_protocol));
  }

  function getElectricalSafetyAdmissionProtocolOptions(category: string, courseName: string): string[] {
  if (!isElectricalSafetyCourse(courseName)) return [];

  const normalizedCategory = normalizeReferenceLookup(category);
  const categoryScope = resolvePersonnelCategoryScope(category);
  const relevantItems = electricalSafetyAdmissionReferenceItems.filter(item => {
  const itemCategory = getBitrixListItemDetailValue(item, 'category');
  const itemScope = resolvePersonnelCategoryScope(itemCategory);
  if (!normalizedCategory) return true;
  if (categoryScope && itemScope) return itemScope === categoryScope;
  return normalizeReferenceLookup(itemCategory) === normalizedCategory;
  });

  if (relevantItems.length > 0) {
  return normalizeSelectValues(relevantItems.map(item => item.name));
  }

  return normalizeSelectValues(
  localCertificates
  .filter(cert => isElectricalSafetyCourse(cert.course_name))
  .map(cert => cert.electrical_safety_admission_protocol)
  );
  }

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
  const managerOptions = useMemo(
  () => {
  const referenceOptions = normalizeSelectValues(myCompanyReferenceItems.map(item => getMyCompanyManager(item)));
  if (referenceOptions.length > 0) return referenceOptions;
  return normalizeSelectValues(localCertificates.map(cert => cert.manager));
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
  const courseSpecificOptionsByCourse = useMemo(() => {
  const seenByField = new Map<string, Set<string>>();
  const result = new Map<string, Record<CourseSpecificFieldKey, string[]>>();

  for (const row of coursePriceRules) {
  const courseKey = normalizeCoursePriceLookup(row.course_name);
  if (!courseKey) continue;

  if (!result.has(courseKey)) {
  result.set(courseKey, {
  qualification: [],
  electrical_safety_group: [],
  });
  }

  const entry = result.get(courseKey)!;

  ([
  ['qualification', String(row.qualification || '').trim()],
  ['electrical_safety_group', String(row.electrical_safety_group || '').trim()],
  ] as Array<[CourseSpecificFieldKey, string]>).forEach(([fieldKey, rawValue]) => {
  if (!rawValue) return;

  const seenKey = `${courseKey}::${fieldKey}`;
  const seen = seenByField.get(seenKey) || new Set<string>();
  const normalizedValue = normalizeCoursePriceLookup(rawValue);
  if (!normalizedValue || seen.has(normalizedValue)) return;

  seen.add(normalizedValue);
  seenByField.set(seenKey, seen);
  entry[fieldKey].push(rawValue);
  });
  }

  for (const entry of result.values()) {
  entry.qualification.sort((left, right) => left.localeCompare(right, 'ru'));
  entry.electrical_safety_group.sort((left, right) => left.localeCompare(right, 'ru'));
  }

  return result;
  }, [coursePriceRules]);

  function getCourseSpecificOptions(courseName: string, fieldKey: CourseSpecificFieldKey): string[] {
  const courseKey = normalizeCoursePriceLookup(courseName);
  if (!courseKey) return [];
  return courseSpecificOptionsByCourse.get(courseKey)?.[fieldKey] || [];
  }

  function isCourseSpecificFieldApplicable(courseName: string, fieldKey: CourseSpecificFieldKey): boolean {
  return getCourseSpecificOptions(courseName, fieldKey).length > 0;
  }

  function isCourseSpecificValueAllowed(
  courseName: string,
  fieldKey: CourseSpecificFieldKey,
  value: string,
  ): boolean {
  const options = getCourseSpecificOptions(courseName, fieldKey);
  if (options.length === 0) return false;
  const normalizedValue = normalizeCoursePriceLookup(value);
  if (!normalizedValue) return false;
  return options.some(option => normalizeCoursePriceLookup(option) === normalizedValue);
  }

  function isQualificationCourse(courseName: string): boolean {
  return isCourseSpecificFieldApplicable(courseName, 'qualification');
  }

 const orderedVisibleColumnKeys = useMemo(
 () => columnOrder.filter(key => visibleColumns[String(key)] !== false),
 [columnOrder, visibleColumns]
 );
 const activeColumnCount = orderedVisibleColumnKeys.length + 2;
 const tableMinWidth = useMemo(() => {
 const mainWidth = orderedVisibleColumnKeys.reduce((sum, key) => sum + (columnWidths[String(key)] || 100), 0);
 const full = mainWidth + 80 + (columnWidths.actions || 56);
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
  const bulkQualificationOptions = useMemo(
  () => mergeSelectOptions(
  visibleRows.flatMap(row => getCourseSpecificOptions(row.course_name, 'qualification'))
  ),
  [visibleRows, courseSpecificOptionsByCourse]
  );
  const bulkElectricalSafetyGroupOptions = useMemo(
  () => mergeSelectOptions(
  visibleRows.flatMap(row => getCourseSpecificOptions(row.course_name, 'electrical_safety_group'))
  ),
  [visibleRows, courseSpecificOptionsByCourse]
  );
  const bulkPreviousElectricalSafetyGroupOptions = useMemo(
  () => visibleRows.some(row => isElectricalSafetyCourse(row.course_name))
  ? PREVIOUS_ELECTRICAL_SAFETY_GROUP_OPTIONS
  : [],
  [visibleRows]
  );
  const bulkCommissionMembersProtocolOptions = useMemo(
  () => mergeSelectOptions(
  ...visibleRows.map(row => getCommissionMembersProtocolOptions(row.issuer_company)),
  normalizeSelectValues(visibleRows.map(row => row.commission_members_protocol)),
  ),
  [visibleRows, commissionMembersProtocolReferenceItems, localCertificates]
  );
  const bulkElectricalSafetyAdmissionProtocolOptions = useMemo(
  () => mergeSelectOptions(
  ...visibleRows.map(row => getElectricalSafetyAdmissionProtocolOptions(row.category, row.course_name)),
  normalizeSelectValues(visibleRows.map(row => row.electrical_safety_admission_protocol)),
  ),
  [visibleRows, electricalSafetyAdmissionReferenceItems, localCertificates]
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
 full_name: '',
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

 if (field === 'document_number') {
 const counters = new Map<string, number>();
 await runBulk(
 visibleRows.map(row => {
 const groupKey = buildDocumentNumberGroupKey(row);
 const nextNumber = (counters.get(groupKey) || 0) + 1;
 counters.set(groupKey, nextNumber);
 return {
 id: row.id,
 patch: { document_number: String(nextNumber) } as Partial<Certificate>,
 };
 })
 );
 return;
 }

 const promptLabel = field === 'protocol_number'
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
 if (localCertificates.length === 0) {
 showToast('warning', 'Нет строк для автонумерации протоколов');
 return;
 }

 setBulkSaving(true);
 try {
 const reconciled = await reconcileProtocolsFromCertificates({
 questionnaireId,
 dealId,
 companyId,
 certificates: localCertificates,
 });
 setLocalCertificates(reconciled.certificates.map(normalizeLocalCertificate));
 showToast('success', 'Автонумерация протоколов обновлена по курсам и категориям');
 onRefresh();
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Не удалось обновить автонумерацию протоколов';
 showToast('error', message);
 } finally {
 setBulkSaving(false);
 }
 }

  async function bulkFillText(field: keyof Certificate, label: string) {
  if (bulkSaving) return;
  const value = window.prompt(`Введите текст для ${label} (${targetRowsInfo}):`, '');
  if (value === null) return;
  const targetRows = field === 'level'
  ? visibleRows.filter(row => isQualificationCourse(row.course_name))
  : visibleRows;

  if (targetRows.length === 0) {
  showToast('warning', field === 'level'
  ? 'В текущем наборе нет строк для курса квалификации'
  : 'Нет строк для массового заполнения');
  return;
  }

  await runBulk(
  targetRows.map(row => ({
  id: row.id,
  patch: { [field]: value } as Partial<Certificate>,
  }))
  );

  if (field === 'level' && targetRows.length !== visibleRows.length) {
  showToast('warning', `Поле "Разряд" применено только к строкам курса квалификации: ${targetRows.length} из ${visibleRows.length}.`);
  }
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
  showToast('warning', 'Выберите значение для поля "Компания, которая выдает документ"');
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

  async function bulkFillManager() {
  if (bulkSaving) return;
  if (!bulkManager.trim()) {
  showToast('warning', 'Выберите значение для поля "Руководитель"');
  return;
  }

  await runBulk(
  visibleRows.map(row => ({
  id: row.id,
  patch: { manager: bulkManager } as Partial<Certificate>,
  }))
  );
  }

  async function bulkFillCourseSpecificField(
  fieldKey: CourseSpecificFieldKey,
  value: string,
  label: string,
  ) {
  if (bulkSaving) return;

  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
  showToast('warning', `Выберите значение для поля "${label}"`);
  return;
  }

  const applicableRows = visibleRows.filter(row => isCourseSpecificValueAllowed(row.course_name, fieldKey, normalizedValue));
  const skippedCount = visibleRows.length - applicableRows.length;

  if (applicableRows.length === 0) {
  showToast('warning', `В текущем наборе нет строк, где доступно значение для поля "${label}"`);
  return;
  }

  await runBulk(
  applicableRows.map(row => ({
  id: row.id,
  patch: { [fieldKey]: normalizedValue } as Partial<Certificate>,
  }))
  );

  if (skippedCount > 0) {
  showToast('warning', `Поле "${label}" применено не ко всем строкам: пропущено ${skippedCount}.`);
  }
  }

  async function bulkFillQualification() {
  await bulkFillCourseSpecificField('qualification', bulkQualification, 'Квалификация');
  }

  async function bulkFillElectricalSafetyGroup() {
  await bulkFillCourseSpecificField(
  'electrical_safety_group',
  bulkElectricalSafetyGroup,
  'Группа электробезопасности',
  );
  }

  async function bulkFillPreviousElectricalSafetyGroup() {
  if (bulkSaving) return;
  const normalizedValue = normalizePreviousElectricalSafetyGroup(bulkPreviousElectricalSafetyGroup);
  const applicableRows = visibleRows.filter(row => isElectricalSafetyCourse(row.course_name));
  const skippedCount = visibleRows.length - applicableRows.length;

  if (applicableRows.length === 0) {
  showToast('warning', 'В текущем наборе нет строк курса "Электробезопасность"');
  return;
  }

  await runBulk(
  applicableRows.map(row => ({
  id: row.id,
  patch: { previous_electrical_safety_group: normalizedValue } as Partial<Certificate>,
  }))
  );

  if (skippedCount > 0) {
  showToast('warning', `Поле "Имеющаяся группа электробезопасности" применено только к курсу "Электробезопасность": пропущено ${skippedCount}.`);
  }
  }

  async function bulkFillReferenceFilteredField(
  fieldKey: 'commission_members_protocol' | 'electrical_safety_admission_protocol',
  value: string,
  label: string,
  resolveOptions: (row: Certificate) => string[],
  ) {
  if (bulkSaving) return;

  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
  showToast('warning', `Выберите значение для поля "${label}"`);
  return;
  }

  const applicableRows = visibleRows.filter(row => {
  const options = resolveOptions(row);
  return options.length > 0 && isReferenceOptionAllowed(normalizedValue, options);
  });
  const skippedCount = visibleRows.length - applicableRows.length;

  if (applicableRows.length === 0) {
  showToast('warning', `В текущем наборе нет строк, где доступно значение для поля "${label}"`);
  return;
  }

  await runBulk(
  applicableRows.map(row => ({
  id: row.id,
  patch: { [fieldKey]: normalizedValue } as Partial<Certificate>,
  }))
  );

  if (skippedCount > 0) {
  showToast('warning', `Поле "${label}" применено не ко всем строкам: пропущено ${skippedCount}.`);
  }
  }

  async function bulkFillCommissionMembersProtocol() {
  await bulkFillReferenceFilteredField(
  'commission_members_protocol',
  bulkCommissionMembersProtocol,
  'Члены комиссии протокол',
  row => getCommissionMembersProtocolOptions(row.issuer_company),
  );
  }

  async function bulkFillElectricalSafetyAdmissionProtocol() {
  await bulkFillReferenceFilteredField(
  'electrical_safety_admission_protocol',
  bulkElectricalSafetyAdmissionProtocol,
  'Допуск электробезопасности протокол',
  row => getElectricalSafetyAdmissionProtocolOptions(row.category, row.course_name),
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

 const placeholders = buildPlaceholders(cert, companyName, template);
 const photoUrl = templateSupportsPhoto(template) && cert.participant_id
 ? String(participantPhotoById.get(cert.participant_id) || '')
 : '';
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
  throw new Error(`Не найдена компания Bitrix для поля "Компания, которая выдает документ": ${cert.issuer_company}`);
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
 throw new Error(`Не найден вариант Bitrix для поля "Вид проверки / тип обучения": ${normalizedTypeLearn}`);
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

 const qualificationValue = String(cert.qualification || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'QUALIFICATION', cert.qualification || '')
 : '';
 if (String(cert.qualification || '').trim() && !qualificationValue) {
 throw new Error(`Не найден элемент Bitrix для поля "Квалификация": ${cert.qualification}`);
 }

 const electricalSafetyGroupValue = String(cert.electrical_safety_group || '').trim()
 ? findReferenceBitrixItemId(bitrixListItemsForSync, 'ELECTRICAL_SAFETY_GROUP', cert.electrical_safety_group || '')
 : '';
 if (String(cert.electrical_safety_group || '').trim() && !electricalSafetyGroupValue) {
 throw new Error(`Не найден элемент Bitrix для поля "Группа электробезопасности": ${cert.electrical_safety_group}`);
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
  const effectiveManager = String(cert.manager || '').trim()
  ? String(cert.manager || '').trim()
  : resolveManagerByIssuerCompany(bitrixListItemsForSync, cert.issuer_company || '');
  const certificateDisplayName = getCertificateDisplayName(cert);
 const fieldEntries: SmartFieldEntry[] = [
 { code: 'TITLE', kind: 'text', value: [certificateDisplayName, cert.course_name].filter(Boolean).join(' - ') },
 { code: BITRIX_FIELDS.PARTICIPANT_FULL_NAME, kind: 'text', value: certificateDisplayName },
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
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.QUALIFICATION, kind: 'link', value: qualificationValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.ELECTRICAL_SAFETY_GROUP, kind: 'link', value: electricalSafetyGroupValue || '' },
 { code: BITRIX_FIELDS.LEVEL, kind: 'text', value: cert.level || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.MARKER_PASS, kind: 'link', value: markerPassValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.TYPE_LEARN, kind: 'link', value: typeLearnValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.COMMIS_CONCL, kind: 'link', value: commisConclValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.GRADE, kind: 'link', value: gradeValue || '' },
 { code: BITRIX_CERTIFICATE_REFERENCE_FIELDS.DOCUMENT_TYPE, kind: 'link', value: documentTypeValue || '' },
  { code: BITRIX_FIELDS.MANAGER, kind: 'text', value: effectiveManager },
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

 if (success > 0) {
 try {
 const dealSyncResult = await syncDealProductsAndAmountToBitrix(localCertificates);
 if (dealSyncResult) {
 showToast('success', `\u0421\u0434\u0435\u043b\u043a\u0430 Bitrix \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0430: ${dealSyncResult.rowsCount} \u0442\u043e\u0432\u0430\u0440\u043d\u044b\u0445 \u0441\u0442\u0440\u043e\u043a, \u0441\u0443\u043c\u043c\u0430 ${formatMoneyPlain(dealSyncResult.dealAmount)}`);
 }
 } catch (dealSyncError) {
 const message = dealSyncError instanceof Error ? dealSyncError.message : '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u0443\u043c\u043c\u0443 \u0438 \u0442\u043e\u0432\u0430\u0440\u044b \u0441\u0434\u0435\u043b\u043a\u0438 Bitrix';
 showToast('warning', `\u0421\u0442\u0440\u043e\u043a\u0438 \u0443\u0434\u043e\u0441\u0442\u043e\u0432\u0435\u0440\u0435\u043d\u0438\u0439 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b, \u043d\u043e \u0441\u0443\u043c\u043c\u0430 \u0441\u0434\u0435\u043b\u043a\u0438 \u043d\u0435 \u043f\u0435\u0440\u0435\u0441\u0447\u0438\u0442\u0430\u043b\u0430\u0441\u044c: ${message}`);
 }
 }

 if (failed > 0) {
 showToast('warning', `\u0421\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043a\u0430\u0442\u043e\u0432: ${success} \u0443\u0441\u043f\u0435\u0448\u043d\u043e, ${failed} \u0441 \u043e\u0448\u0438\u0431\u043a\u043e\u0439`);
 } else {
 showToast('success', `\u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u044b \u0432 Bitrix: ${success} \u0441\u0442\u0440\u043e\u043a`);
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
 participantPhotoById,
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
  setBulkManager,
  setBulkQualification,
  setBulkElectricalSafetyGroup,
  setBulkPreviousElectricalSafetyGroup,
  setBulkCommissionMembersProtocol,
  setBulkElectricalSafetyAdmissionProtocol,
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
  bulkFillManager,
  bulkFillQualification,
  bulkFillElectricalSafetyGroup,
  bulkFillPreviousElectricalSafetyGroup,
  bulkFillCommissionMembersProtocol,
  bulkFillElectricalSafetyAdmissionProtocol,
  bulkFillMarkerPass,
  bulkFillTypeLearn,
 bulkFillCommisConcl,
 bulkFillGrade,
 bulkFillEmployeeStatus,
 bulkFillPrintedStatus,
  bulkFillPrice,
  bulkFillDate,
  saveDirectPatch,
  getCommissionMembersProtocolOptions,
  getElectricalSafetyAdmissionProtocolOptions,
  getCourseSpecificOptions,
  generateDocuments,
  syncCertificatesToBitrix,
  };
}
