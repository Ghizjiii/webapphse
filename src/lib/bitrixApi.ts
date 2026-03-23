/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from './supabase';

export const BITRIX_FIELDS = {
 LAST_NAME: 'ufCrm12_1772560668',
 FIRST_NAME: 'ufCrm12_1772560711',
 MIDDLE_NAME: 'ufCrm12_1772560721',
 POSITION: 'ufCrm12_1772560767',
 CATEGORY: 'ufCrm12_1772560781',
 COURSE_NAME: 'ufCrm12_1772560835',
 COURSE_START_DATE: 'ufCrm12_1772561081',
 DOCUMENT_EXPIRY_DATE: 'ufCrm12_1772561142',
 COMMISSION_CHAIR: 'ufCrm12_1772561169',
 PROTOCOL: 'ufCrm12_1772561202',
 DOCUMENT_NUMBER: 'ufCrm12_1772561299',
 COMMISSION_MEMBER_1: 'ufCrm12_1772561371',
 COMMISSION_MEMBER_2: 'ufCrm12_1772561385',
 COMMISSION_MEMBER_3: 'ufCrm12_1772561392',
 COMMISSION_MEMBER_4: 'ufCrm12_1772561401',
 COMMISSION_MEMBERS: 'ufCrm12_1772561415',
 QUALIFICATION: 'ufCrm12_1772561427',
 MANAGER: 'ufCrm12_1772561434',
 IS_PRINTED: 'ufCrm12_1772561447',
 EMPLOYEE_STATUS: 'ufCrm12_1772561489',
 PRICE: 'ufCrm12_1773257578',
} as const;

export const BITRIX_FIELDS_RAW = {
 LAST_NAME: 'UF_CRM_12_1772560668',
 FIRST_NAME: 'UF_CRM_12_1772560711',
 MIDDLE_NAME: 'UF_CRM_12_1772560721',
 POSITION: 'UF_CRM_12_1772560767',
 CATEGORY: 'UF_CRM_12_1772560781',
 COURSE_NAME: 'UF_CRM_12_1772560835',
 PHOTO: 'UF_CRM_12_1772578817',
 PRICE: 'UF_CRM_12_1773257578',
} as const;

type PlainObject = Record<string, unknown>;

async function callBitrix(method: string, params: PlainObject): Promise<any> {
 const { data, error } = await supabase.functions.invoke('bitrix-proxy', {
 body: { method, params },
 });

 if (error) {
 throw new Error(error.message || `Bitrix proxy failed: ${method}`);
 }

 const payload = (data || {}) as { result?: unknown; error?: string };
 if (payload.error) {
 throw new Error(payload.error);
 }

 return payload.result;
}

function normalizePlain(value: unknown): string {
 return String(value || '').trim();
}

function normalizeDigits(value: unknown): string {
 return String(value || '').replace(/\D/g, '');
}


function extractListRows(payload: unknown): PlainObject[] {
 if (Array.isArray(payload)) return payload as PlainObject[];
 const wrapped = (payload || {}) as PlainObject;
 if (Array.isArray(wrapped.items)) return wrapped.items as PlainObject[];
 if (Array.isArray(wrapped.result)) return wrapped.result as PlainObject[];
 if (Array.isArray(wrapped.types)) return wrapped.types as PlainObject[];
 return [];
}

function extractEnumFromField(fieldDef: PlainObject | null | undefined): string[] {
 if (!fieldDef) return [];
 const sources = [fieldDef.LIST, fieldDef.list, fieldDef.items, fieldDef.ENUM, (fieldDef.settings as PlainObject | undefined)?.LIST];
 for (const src of sources) {
 if (!Array.isArray(src)) continue;
 const values = src
 .map((item: any) => String(item?.VALUE || item?.value || item?.DISPLAY_VALUE || item?.label || ''))
 .filter(Boolean);
 if (values.length > 0) return values;
 }
 return [];
}

function findFieldByName(fields: PlainObject, rawName: string, camelName: string): PlainObject | null {
 const lowerRaw = rawName.toLowerCase();
 const lowerCamel = camelName.toLowerCase();
 for (const [key, value] of Object.entries(fields)) {
 if (!value || typeof value !== 'object') continue;
 const field = value as PlainObject;
 const lowerKey = key.toLowerCase();
 const upperName = String(field.upperName || field.UPPER_NAME || field.fieldName || field.FIELD_NAME || '').toUpperCase();
 if (lowerKey === lowerRaw || lowerKey === lowerCamel || upperName === rawName.toUpperCase()) {
 return field;
 }
 }
 return null;
}

function normalizeDateValue(value: unknown): string | null {
 const raw = normalizePlain(value);
 if (!raw) return null;
 const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
 if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
 const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
 return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function isContractStatusActive(status: string): boolean {
 const value = normalizePlain(status).toLowerCase();
 if (!value) return false;
 return /(действ|актив|active|valid|в работе)/i.test(value);
}

export async function findSmartProcessEntityTypeId(): Promise<number> {
 try {
 const result = await callBitrix('crm.type.list', {});
 const types = Array.isArray((result as any)?.types) ? (result as any).types : extractListRows(result);
 const found = types.find((item: any) => {
 const title = String(item?.title || '').toLowerCase();
 return title.includes('удостоверения и сертификаты') || title.includes('сертификаты');
 });
 return Number(found?.entityTypeId || 1056);
 } catch {
 return 1056;
 }
}

export async function fetchUserFieldEnumValues(fieldName: string, entityId?: string): Promise<string[]> {
 const tryFetch = async (filter: Record<string, string>) => {
 try {
 const result = await callBitrix('crm.userfield.list', { order: { SORT: 'ASC' }, filter });
 const fields = Array.isArray(result) ? result : Array.isArray((result as any)?.fields) ? (result as any).fields : Array.isArray((result as any)?.result) ? (result as any).result : [];
 for (const field of fields) {
 const list = field?.LIST || field?.list || field?.ENUM || field?.enum || [];
 if (!Array.isArray(list) || list.length === 0) continue;
 return list.map((item: any) => String(item?.VALUE || item?.value || item?.DISPLAY_VALUE || '')).filter(Boolean);
 }
 } catch {
 // ignore
 }
 return null;
 };

 const entityIds = Array.from(new Set([entityId, 'CRM_SPA_12_1056', 'CRM_1056', 'CRM_12'].filter(Boolean)));
 for (const id of entityIds) {
 const values = await tryFetch({ FIELD_NAME: fieldName, ENTITY_ID: String(id) });
 if (values && values.length > 0) return values;
 }

 const values = await tryFetch({ FIELD_NAME: fieldName });
 return values || [];
}

export async function fetchCoursesFromFields(entityTypeId: number): Promise<string[]> {
 try {
 const raw = await callBitrix('crm.item.fields', { entityTypeId });
 const fields = ((raw as any)?.fields || raw || {}) as PlainObject;
 const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.COURSE_NAME, BITRIX_FIELDS.COURSE_NAME);
 const values = extractEnumFromField(fieldDef);
 if (values.length > 0) return values.sort((a, b) => a.localeCompare(b, 'ru'));
 return await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.COURSE_NAME, `CRM_SPA_12_${entityTypeId}`);
 } catch {
 return [];
 }
}

async function fetchCoursesViaTypeFields(entityTypeId: number): Promise<string[]> {
 try {
 const raw = await callBitrix('crm.type.fields', { entityTypeId });
 const fields = ((raw as any)?.fields || raw || {}) as PlainObject;
 const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.COURSE_NAME, BITRIX_FIELDS.COURSE_NAME);
 return extractEnumFromField(fieldDef).sort((a, b) => a.localeCompare(b, 'ru'));
 } catch {
 return [];
 }
}

async function fetchCategoryFromFields(entityTypeId: number): Promise<string[]> {
 try {
 const raw = await callBitrix('crm.item.fields', { entityTypeId });
 const fields = ((raw as any)?.fields || raw || {}) as PlainObject;
 const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.CATEGORY, BITRIX_FIELDS.CATEGORY);
 const values = extractEnumFromField(fieldDef);
 if (values.length > 0) return values;
 const fallback = await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.CATEGORY, `CRM_SPA_12_${entityTypeId}`);
 return fallback.length > 0 ? fallback : ['ИТР', 'Обычный'];
 } catch {
 return ['ИТР', 'Обычный'];
 }
}

export async function fetchCategoryValues(): Promise<string[]> {
 const entityTypeId = await findSmartProcessEntityTypeId();
 return await fetchCategoryFromFields(entityTypeId);
}

export async function fetchCoursesList(): Promise<string[]> {
 const entityTypeId = await findSmartProcessEntityTypeId();
 const itemFields = await fetchCoursesFromFields(entityTypeId);
 if (itemFields.length > 0) return itemFields;
 const typeFields = await fetchCoursesViaTypeFields(entityTypeId);
 if (typeFields.length > 0) return typeFields;
 return await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.COURSE_NAME, `CRM_SPA_12_${entityTypeId}`);
}

export async function resolveSmartProcessEnumId(params: {
 entityTypeId: number;
 fieldRawName: string;
 fieldCamelName: string;
 value: string;
}): Promise<string | undefined> {
 const normalizedValue = normalizePlain(params.value).toLowerCase();
 if (!normalizedValue) return undefined;
 try {
 const raw = await callBitrix('crm.item.fields', { entityTypeId: params.entityTypeId });
 const fields = ((raw as any)?.fields || raw || {}) as PlainObject;
 const fieldDef = findFieldByName(fields, params.fieldRawName, params.fieldCamelName);
 const items = Array.isArray((fieldDef as PlainObject | null)?.items) ? ((fieldDef as PlainObject).items as any[]) : [];
 const match = items.find(item => normalizePlain(item?.VALUE || item?.value).toLowerCase() === normalizedValue);
 return match ? normalizePlain(match.ID || match.id) : undefined;
 } catch {
 return undefined;
 }
}

export async function createSmartProcessItem(params: {
 entityTypeId: number;
 dealId: string;
 companyId: string;
 fields: Record<string, unknown>;
}): Promise<string> {
 const variants: Array<Record<string, unknown>> = [
 { parentId2: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
 { PARENT_ID_2: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
 { parentId1: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
 { PARENT_ID_1: params.dealId, companyId: params.companyId, COMPANY_ID: params.companyId },
 { companyId: params.companyId, COMPANY_ID: params.companyId },
 ];

 let lastError: unknown = null;
 for (const relationFields of variants) {
 try {
 const result = await callBitrix('crm.item.add', {
 entityTypeId: params.entityTypeId,
 fields: { ...params.fields, ...relationFields },
 });
 return String((result as any)?.item?.id || result || '');
 } catch (error) {
 lastError = error;
 }
 }

 throw lastError instanceof Error ? lastError : new Error('Failed to create smart-process item');
}

export async function updateSmartProcessItem(params: {
 entityTypeId: number;
 itemId: string;
 fields: Record<string, unknown>;
}): Promise<void> {
 await callBitrix('crm.item.update', {
 entityTypeId: params.entityTypeId,
 id: params.itemId,
 fields: params.fields,
 });
}

export async function fetchCompanyDirectorySnapshotFromBitrix(): Promise<{
 rows: Array<Record<string, unknown>>;
 companiesCount: number;
 contractsCount: number;
}> {
 const [companiesRaw, contractsRaw] = await Promise.all([
 callBitrix('crm.company.list', { order: { ID: 'ASC' }, select: ['ID', 'TITLE', 'PHONE', 'EMAIL', 'UF_*'] }),
 callBitrix('crm.item.list', { entityTypeId: Number(import.meta.env.VITE_BITRIX_CONTRACT_ENTITY_TYPE_ID || '1060'), order: { id: 'ASC' }, select: ['id', 'title', 'companyId', 'COMPANY_ID', '*', 'uf*'] }),
 ]);

 const companies = extractListRows(companiesRaw);
 const contracts = extractListRows(contractsRaw);
 const rows = companies.map(company => {
 const bitrixId = normalizePlain(company.ID || company.id);
 const related = contracts.filter(item => normalizePlain(item.companyId || item.COMPANY_ID) === bitrixId);
 const primary = related[0] || null;
 const status = normalizePlain(primary?.stageId || primary?.STAGE_ID || primary?.status || '');
 const contractStart = normalizeDateValue(primary?.ufCrm1060_1772570000 || primary?.UF_CRM_1060_1772570000 || primary?.beginDate);
 const contractEnd = normalizeDateValue(primary?.ufCrm1060_1772570001 || primary?.UF_CRM_1060_1772570001 || primary?.closeDate);
 return {
 bitrix_company_id: bitrixId,
 name: normalizePlain(company.TITLE || company.title),
 bin_iin: normalizePlain(company.UF_CRM_BIN_IIN || company.UF_CRM_1772589149 || company.ufCrm1772589149),
 bin_iin_digits: normalizeDigits(company.UF_CRM_BIN_IIN || company.UF_CRM_1772589149 || company.ufCrm1772589149),
 phone: Array.isArray(company.PHONE) ? normalizePlain((company.PHONE[0] as any)?.VALUE) : normalizePlain(company.PHONE),
 email: Array.isArray(company.EMAIL) ? normalizePlain((company.EMAIL[0] as any)?.VALUE) : normalizePlain(company.EMAIL),
 city: normalizePlain(company.CITY || company.UF_CRM_CITY || company.UF_CRM_1772560175),
 has_contract: related.length > 0,
 contract_count: related.length,
 contract_bitrix_id: normalizePlain(primary?.id || primary?.ID),
 contract_title: normalizePlain(primary?.title || primary?.TITLE),
 contract_number: normalizePlain(primary?.title || primary?.TITLE),
 contract_date: normalizeDateValue(primary?.createdTime || primary?.CREATED_TIME),
 contract_start: contractStart,
 contract_end: contractEnd,
 contract_status: status,
 contract_is_active: isContractStatusActive(status),
 };
 });
 return { rows, companiesCount: companies.length, contractsCount: contracts.length };
}

export async function syncQuestionnaireToBitrix(payload: Record<string, unknown>) {
 const { data, error } = await supabase.functions.invoke('sync-questionnaire-to-bitrix', {
 body: payload,
 });
 if (error) {
 throw new Error(error.message || 'Sync failed');
 }
 const result = (data || {}) as { error?: string };
 if (result.error) throw new Error(result.error);
 return data;
}
