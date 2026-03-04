const WEBHOOK = import.meta.env.VITE_BITRIX_WEBHOOK as string;
const ENTITY_TYPE_ID = 1;

export const BITRIX_FIELDS = {
  LAST_NAME: 'ufCrm121772560668',
  FIRST_NAME: 'ufCrm121772560711',
  MIDDLE_NAME: 'ufCrm121772560721',
  POSITION: 'ufCrm121772560767',
  CATEGORY: 'ufCrm121772560781',
  COURSE_NAME: 'ufCrm121772560835',
  COURSE_START_DATE: 'ufCrm121772561081',
  DOCUMENT_EXPIRY_DATE: 'ufCrm121772561142',
  COMMISSION_CHAIR: 'ufCrm121772561169',
  PROTOCOL: 'ufCrm121772561202',
  DOCUMENT_NUMBER: 'ufCrm121772561299',
  COMMISSION_MEMBER_1: 'ufCrm121772561371',
  COMMISSION_MEMBER_2: 'ufCrm121772561385',
  COMMISSION_MEMBER_3: 'ufCrm121772561392',
  COMMISSION_MEMBER_4: 'ufCrm121772561401',
  COMMISSION_MEMBERS: 'ufCrm121772561415',
  QUALIFICATION: 'ufCrm121772561427',
  MANAGER: 'ufCrm121772561434',
  IS_PRINTED: 'ufCrm121772561447',
  EMPLOYEE_STATUS: 'ufCrm121772561489',
};

export const BITRIX_FIELDS_RAW = {
  LAST_NAME: 'UF_CRM_12_1772560668',
  FIRST_NAME: 'UF_CRM_12_1772560711',
  MIDDLE_NAME: 'UF_CRM_12_1772560721',
  POSITION: 'UF_CRM_12_1772560767',
  CATEGORY: 'UF_CRM_12_1772560781',
  COURSE_NAME: 'UF_CRM_12_1772560835',
  PHOTO: 'UF_CRM_12_1772578817',
};

export const PHOTO_FIELD_KEY = 'ufCrm121772578817';

const SMART_PROCESS_ENTITY_TYPE_ID = 1056;

async function callBitrix(method: string, params: Record<string, unknown>) {
  const response = await fetch(`${WEBHOOK}/${method}.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.result;
}

export async function findSmartProcessEntityTypeId(): Promise<number> {
  try {
    const result = await callBitrix('crm.type.list', {});
    const types = result?.types || [];
    const found = types.find((t: { title?: string; entityTypeId?: number }) => {
      const title = (t.title || '').toLowerCase();
      return title.includes('удостоверен') || title.includes('сертификат');
    });
    if (found) return found.entityTypeId;
    return SMART_PROCESS_ENTITY_TYPE_ID;
  } catch {
    return SMART_PROCESS_ENTITY_TYPE_ID;
  }
}

export async function fetchUserFieldEnumValues(fieldName: string, entityId?: string): Promise<string[]> {
  const tryFetch = async (f: Record<string, string>) => {
    try {
      const result = await callBitrix('crm.userfield.list', {
        order: { SORT: 'ASC' },
        filter: f,
      });
      const fields = Array.isArray(result) ? result : (result?.result || result?.fields || []);
      for (const field of fields) {
        const items = field.LIST || field.list || field.ENUM || field.enum || [];
        if (items.length > 0) {
          return items
            .map((item: { VALUE?: string; value?: string; DISPLAY_VALUE?: string }) =>
              item.VALUE || item.value || item.DISPLAY_VALUE || '')
            .filter(Boolean) as string[];
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const entitiesToTry = [
    ...(entityId ? [entityId] : []),
    'CRM_SPA_12_1056',
    'CRM_1056',
    'CRM_12',
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  for (const eid of entitiesToTry) {
    const result = await tryFetch({ FIELD_NAME: fieldName, ENTITY_ID: eid });
    if (result && result.length > 0) return result;
  }

  const withoutEntity = await tryFetch({ FIELD_NAME: fieldName });
  if (withoutEntity && withoutEntity.length > 0) return withoutEntity;

  return [];
}

function extractEnumFromField(fieldDef: Record<string, unknown>): string[] {
  const tryArr = (arr: unknown): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item: Record<string, unknown>) =>
        String(item.VALUE || item.value || item.DISPLAY_VALUE || item.label || ''))
      .filter(v => v && v !== 'undefined' && v !== 'null');
  };

  const settings = fieldDef.settings as Record<string, unknown> | undefined;
  const sources = [
    fieldDef.LIST,
    fieldDef.list,
    fieldDef.items,
    fieldDef.ENUM,
    settings?.LIST,
    settings?.list,
    settings?.DISPLAY_VALUES,
  ];

  for (const src of sources) {
    const vals = tryArr(src);
    if (vals.length > 0) return vals;
  }
  return [];
}

function findFieldByName(fields: Record<string, unknown>, rawName: string, camelName: string): Record<string, unknown> | null {
  const lowerRaw = rawName.toLowerCase();
  const lowerCamel = camelName.toLowerCase();

  for (const [key, val] of Object.entries(fields)) {
    if (!val || typeof val !== 'object') continue;
    const lowerKey = key.toLowerCase();
    if (lowerKey === lowerRaw || lowerKey === lowerCamel) {
      return val as Record<string, unknown>;
    }
    const fieldObj = val as Record<string, unknown>;
    const upperName = String(fieldObj.upperName || fieldObj.UPPER_NAME || fieldObj.fieldName || fieldObj.FIELD_NAME || '').toUpperCase();
    if (upperName === rawName.toUpperCase()) {
      return fieldObj;
    }
  }
  return null;
}

export async function fetchCoursesFromFields(entityTypeId: number): Promise<string[]> {
  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.COURSE_NAME, BITRIX_FIELDS.COURSE_NAME);
    if (fieldDef) {
      const vals = extractEnumFromField(fieldDef);
      if (vals.length > 0) return vals.sort();
    }

    const values = await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.COURSE_NAME, `CRM_SPA_12_${entityTypeId}`);
    if (values.length > 0) return values;

    return [];
  } catch {
    return [];
  }
}

export async function fetchCoursesViaTypeFields(entityTypeId: number): Promise<string[]> {
  try {
    const raw = await callBitrix('crm.type.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.COURSE_NAME, BITRIX_FIELDS.COURSE_NAME);
    if (fieldDef) {
      const vals = extractEnumFromField(fieldDef);
      if (vals.length > 0) return vals.sort();
    }
    return [];
  } catch {
    return [];
  }
}

export async function fetchCategoryFromFields(entityTypeId: number): Promise<string[]> {
  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields: Record<string, unknown> = raw?.fields || raw || {};

    const fieldDef = findFieldByName(fields, BITRIX_FIELDS_RAW.CATEGORY, BITRIX_FIELDS.CATEGORY);
    if (fieldDef) {
      const vals = extractEnumFromField(fieldDef);
      if (vals.length > 0) return vals;
    }

    const values = await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.CATEGORY, `CRM_SPA_12_${entityTypeId}`);
    if (values.length > 0) return values;

    return ['ИТР', 'Обычный'];
  } catch {
    return ['ИТР', 'Обычный'];
  }
}

export async function fetchCategoryValues(): Promise<string[]> {
  try {
    const entityTypeId = await findSmartProcessEntityTypeId();
    return await fetchCategoryFromFields(entityTypeId);
  } catch {
    return ['ИТР', 'Обычный'];
  }
}

export async function fetchCoursesList(): Promise<string[]> {
  try {
    const entityTypeId = await findSmartProcessEntityTypeId();

    const fromItemFields = await fetchCoursesFromFields(entityTypeId);
    if (fromItemFields.length > 0) return fromItemFields;

    const fromTypeFields = await fetchCoursesViaTypeFields(entityTypeId);
    if (fromTypeFields.length > 0) return fromTypeFields;

    const fromUserFields = await fetchUserFieldEnumValues(BITRIX_FIELDS_RAW.COURSE_NAME, `CRM_SPA_12_${entityTypeId}`);
    if (fromUserFields.length > 0) return fromUserFields;

    return [];
  } catch {
    return [];
  }
}

export async function fetchCategoryList(): Promise<string[]> {
  return fetchCategoryValues();
}

export async function createCompany(companyData: {
  name: string;
  phone: string;
  email: string;
  bin_iin: string;
}): Promise<string> {
  const result = await callBitrix('crm.company.add', {
    fields: {
      TITLE: companyData.name,
      PHONE: [{ VALUE: companyData.phone, VALUE_TYPE: 'WORK' }],
      EMAIL: companyData.email ? [{ VALUE: companyData.email, VALUE_TYPE: 'WORK' }] : [],
      UF_CRM_BIN_IIN: companyData.bin_iin,
    },
  });
  return String(result);
}

export async function updateCompany(bitrixCompanyId: string, companyData: {
  name: string;
  phone: string;
  email: string;
  bin_iin: string;
}): Promise<void> {
  await callBitrix('crm.company.update', {
    id: bitrixCompanyId,
    fields: {
      TITLE: companyData.name,
      PHONE: [{ VALUE: companyData.phone, VALUE_TYPE: 'WORK' }],
      EMAIL: companyData.email ? [{ VALUE: companyData.email, VALUE_TYPE: 'WORK' }] : [],
      UF_CRM_BIN_IIN: companyData.bin_iin,
    },
  });
}

export async function createDeal(dealData: {
  title: string;
  companyId: string;
  city?: string;
}): Promise<string> {
  const fields: Record<string, unknown> = {
    TITLE: dealData.title,
    COMPANY_ID: dealData.companyId,
    STAGE_ID: 'NEW',
  };
  if (dealData.city) fields['UF_CRM_CITY'] = dealData.city;
  const result = await callBitrix('crm.deal.add', { fields });
  return String(result);
}

export async function updateDeal(bitrixDealId: string, dealData: {
  title: string;
  companyId: string;
  city?: string;
}): Promise<void> {
  const fields: Record<string, unknown> = {
    TITLE: dealData.title,
    COMPANY_ID: dealData.companyId,
  };
  if (dealData.city) fields['UF_CRM_CITY'] = dealData.city;
  await callBitrix('crm.deal.update', { id: bitrixDealId, fields });
}

export async function attachPhotoToSmartItem(params: {
  entityTypeId: number;
  itemId: string;
  photoUrl: string;
  participantName: string;
}): Promise<void> {
  try {
    const response = await fetch(params.photoUrl);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const mimeType = blob.type || 'image/jpeg';
    const ext = mimeType.split('/')[1] || 'jpg';
    const safeName = params.participantName.replace(/\s+/g, ' ').trim();
    const fileName = `${safeName} обучающийся.${ext}`;

    await callBitrix('crm.item.update', {
      entityTypeId: params.entityTypeId,
      id: params.itemId,
      fields: {
        [PHOTO_FIELD_KEY]: { fileData: [fileName, `data:${mimeType};base64,${base64}`] },
      },
    });
  } catch {
    // photo attachment is optional, ignore errors
  }
}

export async function createSmartProcessItem(params: {
  entityTypeId: number;
  dealId: string;
  companyId: string;
  fields: Record<string, unknown>;
}): Promise<string> {
  const result = await callBitrix('crm.item.add', {
    entityTypeId: params.entityTypeId,
    fields: {
      ...params.fields,
      PARENT_ID_1: params.dealId,
      COMPANY_ID: params.companyId,
    },
  });
  return String(result?.item?.id || result);
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

export async function deleteSmartProcessItem(params: {
  entityTypeId: number;
  itemId: string;
}): Promise<void> {
  await callBitrix('crm.item.delete', {
    entityTypeId: params.entityTypeId,
    id: params.itemId,
  });
}

export { SMART_PROCESS_ENTITY_TYPE_ID, ENTITY_TYPE_ID, callBitrix };
