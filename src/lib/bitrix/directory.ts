import { callBitrix } from './client';
import { CONTRACT_ENTITY_TYPE_ID } from './config';
import { resolveCompanyBinFieldCodes, getBitrixFieldValue, firstNonEmptyBitrixFieldValue, pickFirstNonEmpty } from './fields';
import { normalizeDigits, normalizePlain, normalizeDateValue } from './utils';
import { listAllBitrixCompanies } from './company';
import { listAllBitrixSmartItems } from './smartProcess';

export interface CompanyDirectorySyncRow {
  bitrix_company_id: string;
  name: string;
  bin_iin: string;
  bin_iin_digits: string;
  phone: string;
  email: string;
  city: string;
  has_contract: boolean;
  contract_count: number;
  contract_bitrix_id: string;
  contract_title: string;
  contract_number: string;
  contract_date: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_status: string;
  contract_is_active: boolean;
}

function decodeUnicodeEscapes(value: string): string {
  return String(value || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

export function isContractStatusActive(status: string): boolean {
  const value = status.trim().toLowerCase();
  if (!value) return false;
  return /(действ|актив|active|valid|в работе)/i.test(value);
}

export async function resolveContractFieldMap(entityTypeId: number): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    const entries = Object.entries(fields).map(([key, val]) => {
      const field = (val || {}) as Record<string, unknown>;
      const rawTitle = String(field.title || field.formLabel || field.LIST_LABEL || '');
      const upperName = String(field.upperName || field.FIELD_NAME || key || '').trim();
      const keyProbe = `${key} ${upperName}`.toLowerCase();
      const isUserField = /^uf_/i.test(key) || /^uf_/i.test(upperName);
      return {
        key,
        upperName,
        title: decodeUnicodeEscapes(rawTitle).toLowerCase().trim(),
        keyProbe,
        isUserField,
      };
    });

    const findByTitleOrKey = (
      titlePatterns: RegExp[],
      keyPatterns: RegExp[],
      opts?: { preferUserFields?: boolean; disallowSystemFallback?: boolean }
    ): string => {
      const userEntries = entries.filter(e => e.isUserField);
      const allEntries = opts?.preferUserFields
        ? [...userEntries, ...entries.filter(e => !e.isUserField)]
        : entries;
      const source = opts?.disallowSystemFallback ? userEntries : allEntries;

      const byTitle = source.find(entry => titlePatterns.some(p => p.test(entry.title)));
      if (byTitle) return byTitle.upperName || byTitle.key || '';

      const byKey = source.find(entry => keyPatterns.some(p => p.test(entry.keyProbe)));
      if (byKey) return byKey.upperName || byKey.key || '';
      return '';
    };

    map.company = findByTitleOrKey(
      [/компан/, /клиент/, /client/, /company/],
      [/(^|_)company(_id)?($|_)/, /client/]
    );
    map.number = findByTitleOrKey(
      [/номер.*договор/, /^договор\s*№?/, /contract.*number/],
      [/(contract|dogovor).*(number|num|nomer)/, /(number|num|nomer).*(contract|dogovor)/]
    );
    map.contractDate = findByTitleOrKey(
      [/дата.*договор/, /contract.*date/],
      [/(contract|dogovor).*(date|data)/],
      { preferUserFields: true, disallowSystemFallback: true }
    );
    map.startDate = findByTitleOrKey(
      [/дата.*нач/, /действ.*с/, /date.*start/, /start.*date/],
      [/(start|begin|from|date_start|date_begin)/],
      { preferUserFields: true, disallowSystemFallback: true }
    );
    map.endDate = findByTitleOrKey(
      [/дата.*оконч/, /действ.*по/, /date.*end/, /end.*date/],
      [/(end|finish|to|expire|close|date_end|date_close)/],
      { preferUserFields: true, disallowSystemFallback: true }
    );
    map.status = findByTitleOrKey(
      [/^статус$/, /contract.*status/, /состояние/],
      [/(^|_)(status|stage)(_|$)/]
    );

    if (!map.company) map.company = 'companyId';
    if (!map.status) map.status = 'stageId';
  } catch {
    // best effort, caller handles empty map
  }
  return map;
}

export function extractPhone(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as Record<string, unknown>;
    return normalizePlain(first?.VALUE || first?.value || first?.VALUE_NUMBER);
  }
  return normalizePlain(value);
}

export function extractEmail(value: unknown): string {
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as Record<string, unknown>;
    return normalizePlain(first?.VALUE || first?.value);
  }
  return normalizePlain(value);
}

export type ContractSnapshot = {
  id: string;
  title: string;
  number: string;
  contractDate: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  isActive: boolean;
};

export function choosePrimaryContract(contracts: ContractSnapshot[]): ContractSnapshot | null {
  if (contracts.length === 0) return null;

  const sorted = [...contracts].sort((a, b) => {
    const activeCmp = Number(b.isActive) - Number(a.isActive);
    if (activeCmp !== 0) return activeCmp;
    const aDate = a.endDate || a.startDate || a.contractDate || '';
    const bDate = b.endDate || b.startDate || b.contractDate || '';
    return bDate.localeCompare(aDate);
  });
  return sorted[0];
}

export async function fetchCompanyDirectorySnapshotFromBitrix(): Promise<{
  rows: CompanyDirectorySyncRow[];
  companiesCount: number;
  contractsCount: number;
}> {
  const [companiesRaw, contractsRaw, binFieldCodes, contractFieldMap] = await Promise.all([
    listAllBitrixCompanies(),
    listAllBitrixSmartItems(CONTRACT_ENTITY_TYPE_ID),
    resolveCompanyBinFieldCodes(),
    resolveContractFieldMap(CONTRACT_ENTITY_TYPE_ID),
  ]);

  const companyById = new Map<string, CompanyDirectorySyncRow>();
  for (const row of companiesRaw) {
    const bitrixId = normalizePlain(row.ID || row.id);
    if (!bitrixId) continue;

    const binValue = pickFirstNonEmpty(row, binFieldCodes);
    const binDigits = normalizeDigits(binValue);

    companyById.set(bitrixId, {
      bitrix_company_id: bitrixId,
      name: normalizePlain(row.TITLE || row.title),
      bin_iin: normalizePlain(binValue),
      bin_iin_digits: binDigits,
      phone: extractPhone(row.PHONE || row.phone),
      email: extractEmail(row.EMAIL || row.email),
      city: normalizePlain(row.CITY || row.UF_CRM_CITY || row.UF_CRM_1772560175),
      has_contract: false,
      contract_count: 0,
      contract_bitrix_id: '',
      contract_title: '',
      contract_number: '',
      contract_date: null,
      contract_start: null,
      contract_end: null,
      contract_status: '',
      contract_is_active: false,
    });
  }

  const contractsByCompanyId = new Map<string, ContractSnapshot[]>();
  for (const item of contractsRaw) {
    const contractId = normalizePlain(item.id || item.ID);
    const title = normalizePlain(item.title || item.TITLE);
    const companyId = normalizePlain(
      item.companyId ||
      item.COMPANY_ID ||
      (contractFieldMap.company ? getBitrixFieldValue(item, contractFieldMap.company) : '')
    );
    if (!contractId || !companyId) continue;

    const number = normalizePlain(
      (contractFieldMap.number ? getBitrixFieldValue(item, contractFieldMap.number) : '') ||
      firstNonEmptyBitrixFieldValue(item, ['number', 'contractNumber', 'contract_number']) ||
      title
    );
    // Important: for smart-process contracts we should trust only mapped date fields.
    // Generic fallback keys may resolve to unrelated system fields and produce
    // identical fake date ranges for many companies.
    const contractDate = normalizeDateValue(
      contractFieldMap.contractDate ? getBitrixFieldValue(item, contractFieldMap.contractDate) : null
    );
    const startDate = normalizeDateValue(
      contractFieldMap.startDate ? getBitrixFieldValue(item, contractFieldMap.startDate) : null
    );
    const endDate = normalizeDateValue(
      contractFieldMap.endDate ? getBitrixFieldValue(item, contractFieldMap.endDate) : null
    );
    const status = normalizePlain(
      (contractFieldMap.status ? getBitrixFieldValue(item, contractFieldMap.status) : '') ||
      firstNonEmptyBitrixFieldValue(item, ['status', 'stageId'])
    ) || '';

    const isActiveByDate = Boolean(
      startDate &&
      endDate &&
      startDate <= endDate &&
      startDate <= new Date().toISOString().slice(0, 10) &&
      endDate >= new Date().toISOString().slice(0, 10)
    );
    const isActive = isContractStatusActive(status) || isActiveByDate;

    const contract: ContractSnapshot = {
      id: contractId,
      title,
      number,
      contractDate,
      startDate,
      endDate,
      status,
      isActive,
    };

    const list = contractsByCompanyId.get(companyId) || [];
    list.push(contract);
    contractsByCompanyId.set(companyId, list);
  }

  for (const [companyId, contracts] of contractsByCompanyId.entries()) {
    const target = companyById.get(companyId);
    if (!target) continue;
    const primary = choosePrimaryContract(contracts);

    target.has_contract = contracts.length > 0;
    target.contract_count = contracts.length;
    if (primary) {
      target.contract_bitrix_id = primary.id;
      target.contract_title = primary.title;
      target.contract_number = primary.number;
      target.contract_date = primary.contractDate;
      target.contract_start = primary.startDate;
      target.contract_end = primary.endDate;
      target.contract_status = primary.status;
      target.contract_is_active = primary.isActive;
    }
  }

  const rows = Array.from(companyById.values());
  return {
    rows,
    companiesCount: companiesRaw.length,
    contractsCount: contractsRaw.length,
  };
}
