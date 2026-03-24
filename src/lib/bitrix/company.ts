import { callBitrix } from './client';
import {
  COMPANY_BIN_FIELD_CANDIDATES,
  resolveCompanyBinFieldCodes,
  buildCompanyBinFields,
  companyUfCamelFromUpper
} from './fields';
import { normalizeDigits, normalizePlain, extractListRows } from './utils';

export async function findExistingCompanyIdByBin(params: {
  binIin: string;
  companyName?: string;
  fieldCodes: string[];
}): Promise<string | null> {
  const binDigits = normalizeDigits(params.binIin);
  if (!binDigits) return null;

  const fieldCodes = Array.from(new Set(params.fieldCodes.filter(Boolean)));
  const searchValues = Array.from(new Set<string>([
    String(params.binIin || '').trim(),
    binDigits,
    binDigits.replace(/^0+/, ''),
  ].filter(Boolean)));

  const candidates = new Map<string, Record<string, unknown>>();
  const collect = (row: Record<string, unknown>) => {
    const id = normalizePlain(row.ID || row.id);
    if (!id) return;
    candidates.set(id, row);
  };

  for (const code of fieldCodes) {
    for (const value of searchValues) {
      try {
        const raw = await callBitrix('crm.company.list', {
          filter: { [code]: value },
          order: { ID: 'ASC' },
          select: ['ID', 'TITLE', 'UF_*'],
        });
        const rows = Array.isArray(raw)
          ? raw as Array<Record<string, unknown>>
          : (Array.isArray(raw?.items) ? raw.items as Array<Record<string, unknown>> : []);
        for (const row of rows) collect(row);
      } catch {
        // try next field/value pair
      }
    }
  }

  if (candidates.size === 0) {
    try {
      const allCompanies = await listAllBitrixCompanies();
      for (const row of allCompanies) {
        if (rowHasBinDigits(row, binDigits, fieldCodes)) collect(row);
      }
    } catch {
      // best effort
    }
  }

  if (candidates.size === 0) return null;

  const companyNameNorm = normalizePlain(params.companyName).toLowerCase();
  const rows = Array.from(candidates.values()).filter(row => rowHasBinDigits(row, binDigits, fieldCodes));
  if (rows.length === 0) return null;

  rows.sort((a, b) => {
    const aTitle = normalizePlain(a.TITLE || a.title).toLowerCase();
    const bTitle = normalizePlain(b.TITLE || b.title).toLowerCase();

    const aExact = Number(companyNameNorm !== '' && aTitle === companyNameNorm);
    const bExact = Number(companyNameNorm !== '' && bTitle === companyNameNorm);
    if (aExact !== bExact) return bExact - aExact;

    const aContains = Number(companyNameNorm !== '' && aTitle.includes(companyNameNorm));
    const bContains = Number(companyNameNorm !== '' && bTitle.includes(companyNameNorm));
    if (aContains !== bContains) return bContains - aContains;

    const aId = Number(normalizePlain(a.ID || a.id) || '0');
    const bId = Number(normalizePlain(b.ID || b.id) || '0');
    return aId - bId;
  });

  const best = rows[0];
  return normalizePlain(best.ID || best.id) || null;
}

export function rowHasBinDigits(row: Record<string, unknown>, expectedDigits: string, fieldCodes: string[]): boolean {
  const expectedNoZero = expectedDigits.replace(/^0+/, '');
  const keys = new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...fieldCodes]);
  for (const k of Array.from(keys)) {
    const upper = String(k).toUpperCase();
    if (upper.startsWith('UF_CRM_')) {
      keys.add(upper);
      keys.add(upper.toLowerCase());
      const camel = companyUfCamelFromUpper(upper);
      if (camel) keys.add(camel);
    }
  }

  const extractValues = (value: unknown): string[] => {
    if (value == null) return [];
    if (typeof value === 'string' || typeof value === 'number') return [String(value)];
    if (Array.isArray(value)) return value.flatMap(v => extractValues(v));
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(v => extractValues(v));
    return [];
  };

  for (const key of keys) {
    for (const raw of extractValues(row[key])) {
      const digits = String(raw || '').replace(/\D/g, '');
      if (!digits) continue;
      const noZero = digits.replace(/^0+/, '');
      if (digits === expectedDigits || noZero === expectedNoZero) return true;
    }
  }

  return false;
}

export async function verifyCompanyBinFilled(bitrixCompanyId: string, expected: string, fieldCodes: string[] = []): Promise<boolean> {
  const expectedNorm = String(expected || '').replace(/\D/g, '');
  if (!expectedNorm) return true;

  const keys = new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...fieldCodes]);
  for (const k of Array.from(keys)) {
    const upper = String(k).toUpperCase();
    if (upper.startsWith('UF_CRM_')) {
      keys.add(upper);
      const camel = companyUfCamelFromUpper(upper);
      if (camel) keys.add(camel);
    }
  }

  const expectedNoZero = expectedNorm.replace(/^0+/, '');

  const extractValues = (value: unknown): string[] => {
    if (value == null) return [];
    if (typeof value === 'string' || typeof value === 'number') return [String(value)];
    if (Array.isArray(value)) return value.flatMap(v => extractValues(v));
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      return Object.values(obj).flatMap(v => extractValues(v));
    }
    return [];
  };

  const matchesExpected = (data: Record<string, unknown>): boolean => {
    for (const key of keys) {
      const rawValues = extractValues(data[key]);
      for (const raw of rawValues) {
        const str = String(raw || '').trim();
        if (!str) continue;

        const norm = str.replace(/\D/g, '');
        if (!norm) return true;

        const normNoZero = norm.replace(/^0+/, '');
        if (norm === expectedNorm || normNoZero === expectedNoZero) return true;
      }
    }
    return false;
  };

  try {
    const select = ['ID', 'TITLE', 'UF_*', ...Array.from(keys)];
    const raw = await callBitrix('crm.company.get', { id: bitrixCompanyId, select });
    const data = (raw || {}) as Record<string, unknown>;
    if (matchesExpected(data)) return true;
  } catch {
    // try list fallback
  }

  try {
    const listRaw = await callBitrix('crm.company.list', {
      filter: { ID: bitrixCompanyId },
      select: ['ID', 'TITLE', 'UF_*', ...Array.from(keys)],
    });
    const row = Array.isArray(listRaw) ? listRaw[0] : Array.isArray(listRaw?.items) ? listRaw.items[0] : null;
    if (row && typeof row === 'object' && matchesExpected(row as Record<string, unknown>)) return true;
  } catch {
    // best effort
  }

  return false;
}

export async function fillCompanyBinWithRetries(params: {
  companyId: string;
  binIin: string;
  fieldCodes: string[];
}): Promise<void> {
  const binValue = String(params.binIin || '').trim();
  if (!binValue) return;

  const allCodes = Array.from(new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...params.fieldCodes]));
  const mergedFields = buildCompanyBinFields(binValue, allCodes);

  await callBitrix('crm.company.update', {
    id: params.companyId,
    fields: mergedFields,
  });

  for (let i = 0; i < 6; i++) {
    if (await verifyCompanyBinFilled(params.companyId, binValue, allCodes)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const digitOnly = String(binValue).replace(/\D/g, '');
  const numericValue = Number.isFinite(Number(digitOnly)) ? Number(digitOnly) : null;

  for (const code of allCodes) {
    const perCodeFields = buildCompanyBinFields(binValue, [code]);

    try {
      await callBitrix('crm.company.update', { id: params.companyId, fields: perCodeFields });
    } catch {
      // continue
    }

    if (digitOnly && digitOnly !== binValue) {
      const digitsFields = buildCompanyBinFields(digitOnly, [code]);
      try {
        await callBitrix('crm.company.update', { id: params.companyId, fields: digitsFields });
      } catch {
        // continue
      }
    }

    if (numericValue !== null) {
      const asNumber: Record<string, unknown> = {};
      for (const k of Object.keys(perCodeFields)) asNumber[k] = numericValue;
      try {
        await callBitrix('crm.company.update', { id: params.companyId, fields: asNumber });
      } catch {
        // continue
      }
    }

    for (let i = 0; i < 4; i++) {
      if (await verifyCompanyBinFilled(params.companyId, binValue, allCodes)) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  // Do not block full sync if Bitrix does not return UF field back in read methods.
}

export async function createCompany(companyData: {
  name: string;
  phone: string;
  email: string;
  bin_iin: string;
}): Promise<string> {
  const dynamicBinFields = await resolveCompanyBinFieldCodes();
  const allBinFields = Array.from(new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...dynamicBinFields]));

  const existingCompanyId = await findExistingCompanyIdByBin({
    binIin: companyData.bin_iin,
    companyName: companyData.name,
    fieldCodes: allBinFields,
  });

  if (existingCompanyId) {
    await updateCompany(existingCompanyId, companyData);
    return existingCompanyId;
  }

  const fields: Record<string, unknown> = {
    TITLE: companyData.name,
    PHONE: [{ VALUE: companyData.phone, VALUE_TYPE: 'WORK' }],
    EMAIL: companyData.email ? [{ VALUE: companyData.email, VALUE_TYPE: 'WORK' }] : [],
    INDUSTRY: '',
    ...buildCompanyBinFields(companyData.bin_iin, allBinFields),
  };

  const result = await callBitrix('crm.company.add', { fields });
  const companyId = String(result);

  await fillCompanyBinWithRetries({
    companyId,
    binIin: companyData.bin_iin,
    fieldCodes: allBinFields,
  });

  return companyId;
}

export async function updateCompany(bitrixCompanyId: string, companyData: {
  name: string;
  phone: string;
  email: string;
  bin_iin: string;
}): Promise<string> {
  const dynamicBinFields = await resolveCompanyBinFieldCodes();
  const allBinFields = Array.from(new Set<string>([...COMPANY_BIN_FIELD_CANDIDATES, ...dynamicBinFields]));

  let targetCompanyId = String(bitrixCompanyId || '').trim();
  const matchedByBin = await findExistingCompanyIdByBin({
    binIin: companyData.bin_iin,
    companyName: companyData.name,
    fieldCodes: allBinFields,
  });
  if (matchedByBin) targetCompanyId = matchedByBin;

  const fields: Record<string, unknown> = {
    TITLE: companyData.name,
    PHONE: [{ VALUE: companyData.phone, VALUE_TYPE: 'WORK' }],
    EMAIL: companyData.email ? [{ VALUE: companyData.email, VALUE_TYPE: 'WORK' }] : [],
    INDUSTRY: '',
    ...buildCompanyBinFields(companyData.bin_iin, allBinFields),
  };

  await callBitrix('crm.company.update', {
    id: targetCompanyId,
    fields,
  });

  await fillCompanyBinWithRetries({
    companyId: targetCompanyId,
    binIin: companyData.bin_iin,
    fieldCodes: allBinFields,
  });

  return targetCompanyId;
}

export async function listAllBitrixCompanies(): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  const batchSize = 50;
  const maxPages = 120;

  for (let page = 0; page < maxPages; page++) {
    const start = page * batchSize;
    const chunk = await callBitrix('crm.company.list', {
      order: { ID: 'ASC' },
      start,
      select: ['ID', 'TITLE', 'PHONE', 'EMAIL', 'UF_*'],
    });
    const rows = extractListRows(chunk);
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < batchSize) break;
  }
  return out;
}
