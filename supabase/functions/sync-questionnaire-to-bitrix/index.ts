import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

type PlainObject = Record<string, unknown>;

type CompanyPayload = {
 id: string;
 name: string;
 phone: string;
 email: string;
 city: string;
 bin_iin: string;
 payment_order_url?: string;
 payment_order_name?: string;
 payment_is_paid?: boolean;
};

type ParticipantCourse = { course_name: string };
type ParticipantPayload = {
 id: string;
 last_name: string;
 first_name: string;
 patronymic: string;
 position: string;
 category: string;
 photo_url?: string;
 courses?: ParticipantCourse[];
};

type DealPayload = {
 id?: string | null;
 bitrix_deal_id?: string | null;
 bitrix_company_id?: string | null;
};

const allowedOriginEnv = Deno.env.get('ALLOWED_ORIGIN') || '';
const bitrixWebhookUrl = Deno.env.get('BITRIX_WEBHOOK_URL') || Deno.env.get('BITRIX_WEBHOOK') || '';
const bitrixDealPaymentField = String(Deno.env.get('BITRIX_DEAL_PAYMENT_FIELD') || '').trim();
const bitrixDealPaymentFileField = String(Deno.env.get('BITRIX_DEAL_PAYMENT_FILE_FIELD') || '').trim();
const bitrixDealPaymentStatusField = String(Deno.env.get('BITRIX_DEAL_PAYMENT_STATUS_FIELD') || '').trim();
const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const BITRIX_FIELDS = {
 LAST_NAME: 'ufCrm12_1772560668',
 FIRST_NAME: 'ufCrm12_1772560711',
 MIDDLE_NAME: 'ufCrm12_1772560721',
 POSITION: 'ufCrm12_1772560767',
 CATEGORY: 'ufCrm12_1772560781',
 COURSE_NAME: 'ufCrm12_1772560835',
} as const;

const BITRIX_FIELDS_RAW = {
 CATEGORY: 'UF_CRM_12_1772560781',
 COURSE_NAME: 'UF_CRM_12_1772560835',
} as const;

const COMPANY_BIN_FIELDS = ['UF_CRM_BIN_IIN', 'UF_CRM_1772589149', 'UF_CRM_1772598092', 'UF_CRM_1772598149'];
const PHOTO_FIELD_CANDIDATES = ['UF_CRM_12_1772578817', 'ufCrm12_1772578817'];

function normalizeOriginRule(value: string): string {
 const trimmed = String(value || '').trim();
 if (!trimmed) return '';
 if (trimmed === '*') return '*';
 return trimmed.replace(/\/+$/, '');
}

function isOriginRuleMatch(requestOrigin: string, rule: string): boolean {
 const normalizedRequestOrigin = normalizeOriginRule(requestOrigin);
 const normalizedRule = normalizeOriginRule(rule);
 if (!normalizedRequestOrigin || !normalizedRule) return false;
 if (normalizedRule === '*') return true;
 if (normalizedRule === normalizedRequestOrigin) return true;
 if (!normalizedRule.includes('*')) return false;
 try {
 const req = new URL(normalizedRequestOrigin);
 const hasScheme = normalizedRule.includes('://');
 const protocolPrefix = hasScheme ? `${req.protocol}//` : '';
 const hostPattern = hasScheme ? normalizedRule.split('://')[1] : normalizedRule;
 const normalizedHostPattern = hostPattern.startsWith('*.') ? hostPattern.slice(2) : hostPattern;
 if (!normalizedHostPattern) return false;
 if (hasScheme && !normalizedRule.startsWith(protocolPrefix)) return false;
 return req.hostname === normalizedHostPattern || req.hostname.endsWith(`.${normalizedHostPattern}`);
 } catch {
 return false;
 }
}

function resolveAllowedOrigin(requestOrigin: string): string {
 const configured = allowedOriginEnv.split(',').map(normalizeOriginRule).filter(Boolean);
 if (configured.length === 0) return requestOrigin || '*';
 if (requestOrigin && configured.some(rule => isOriginRuleMatch(requestOrigin, rule))) return requestOrigin;
 const firstExact = configured.find(v => v && !v.includes('*'));
 return firstExact || '*';
}

function corsHeaders(req: Request): Record<string, string> {
 return {
 'Access-Control-Allow-Origin': resolveAllowedOrigin(req.headers.get('origin') || ''),
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
 Vary: 'Origin',
 };
}

function normalizePlain(value: unknown): string {
 return String(value || '').trim();
}

function normalizeDigits(value: unknown): string {
 return String(value || '').replace(/\D/g, '');
}

function extensionFromContentType(contentType: string): string {
 const value = contentType.toLowerCase();
 if (value.includes('pdf')) return 'pdf';
 if (value.includes('png')) return 'png';
 if (value.includes('webp')) return 'webp';
 if (value.includes('jpeg') || value.includes('jpg')) return 'jpg';
 return '';
}

function sanitizeFileName(name: string): string {
 return String(name || '').trim().replace(/[\\/:*?<>|]/g, '').replace(/\s+/g, ' ').replace(/\.+$/, '').trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function fetchFileAsBase64(url: string): Promise<{ base64: string; contentType: string }> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to fetch file: HTTP ${response.status}`);
  return {
    base64: bytesToBase64(new Uint8Array(await response.arrayBuffer())),
    contentType: String(response.headers.get('content-type') || '').trim(),
  };
}

async function callBitrix(method: string, params: PlainObject): Promise<any> {
  if (!bitrixWebhookUrl) throw new Error('BITRIX_WEBHOOK_URL is not configured');
  const url = `${bitrixWebhookUrl.replace(/\/+$/, '')}/${method}.json`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) as PlainObject : {};
  if (!response.ok) throw new Error(`Bitrix HTTP ${response.status} at ${method}: ${raw || 'empty response'}`);
  if (data.error) throw new Error(`Bitrix ${method} failed: ${String(data.error_description || data.error)}`);
  return data.result;
}

async function findSmartProcessEntityTypeId(): Promise<number> {
  try {
    const result = await callBitrix('crm.type.list', {});
    const types = Array.isArray(result?.types) ? result.types : [];
    const found = types.find((item: Record<string, unknown>) => {
      const title = String(item.title || '').toLowerCase();
      return title.includes('удостоверения и сертификаты') || title.includes('сертификаты');
    });
    return Number(found?.entityTypeId || 1056);
  } catch {
    return 1056;
  }
}

async function resolveSmartProcessEnumId(entityTypeId: number, fieldRawName: string, fieldCamelName: string, value: string): Promise<string | undefined> {
  const normalized = normalizePlain(value).toLowerCase();
  if (!normalized) return undefined;
  try {
    const raw = await callBitrix('crm.item.fields', { entityTypeId });
    const fields = (raw?.fields || raw || {}) as PlainObject;
    for (const [key, entry] of Object.entries(fields)) {
      const field = (entry || {}) as PlainObject;
      const upperName = String(field.upperName || field.UPPER_NAME || field.fieldName || field.FIELD_NAME || '').toUpperCase();
      if (key.toLowerCase() !== fieldRawName.toLowerCase() && key.toLowerCase() !== fieldCamelName.toLowerCase() && upperName !== fieldRawName.toUpperCase()) continue;
      const items = Array.isArray(field.items) ? field.items as Array<Record<string, unknown>> : [];
      const match = items.find(item => normalizePlain(item.VALUE || item.value).toLowerCase() === normalized);
      return match ? normalizePlain(match.ID || match.id) : undefined;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function listAllBitrixCompanies(): Promise<PlainObject[]> {
  const out: PlainObject[] = [];
  for (let page = 0; page < 120; page++) {
    const start = page * 50;
    const chunk = await callBitrix('crm.company.list', { order: { ID: 'ASC' }, start, select: ['ID', 'TITLE', 'PHONE', 'EMAIL', 'UF_*'] });
    const rows = Array.isArray(chunk) ? chunk : Array.isArray(chunk?.items) ? chunk.items : [];
    if (rows.length === 0) break;
    out.push(...rows as PlainObject[]);
    if (rows.length < 50) break;
  }
  return out;
}

async function findExistingCompanyIdByBin(binIin: string, companyName = ''): Promise<string | null> {
  const targetDigits = normalizeDigits(binIin);
  if (!targetDigits) return null;
  const companies = await listAllBitrixCompanies();
  const matches = companies.filter(company => {
    const values = COMPANY_BIN_FIELDS.map(code => normalizeDigits((company as Record<string, unknown>)[code] || (company as Record<string, unknown>)[code.toLowerCase()]));
    return values.some(value => value && (value === targetDigits || value.replace(/^0+/, '') === targetDigits.replace(/^0+/, '')));
  });
  if (matches.length === 0) return null;
  const normalizedName = normalizePlain(companyName).toLowerCase();
  matches.sort((a, b) => {
    const aName = normalizePlain((a as Record<string, unknown>).TITLE || (a as Record<string, unknown>).title).toLowerCase();
    const bName = normalizePlain((b as Record<string, unknown>).TITLE || (b as Record<string, unknown>).title).toLowerCase();
    const aExact = Number(normalizedName && aName === normalizedName);
    const bExact = Number(normalizedName && bName === normalizedName);
    if (aExact !== bExact) return bExact - aExact;
    return Number(normalizePlain((a as Record<string, unknown>).ID || (a as Record<string, unknown>).id)) - Number(normalizePlain((b as Record<string, unknown>).ID || (b as Record<string, unknown>).id));
  });
  return normalizePlain((matches[0] as Record<string, unknown>).ID || (matches[0] as Record<string, unknown>).id) || null;
}

function buildCompanyFields(company: CompanyPayload): PlainObject {
  const digits = normalizeDigits(company.bin_iin);
  const fields: PlainObject = {
    TITLE: company.name,
    PHONE: company.phone ? [{ VALUE: company.phone, VALUE_TYPE: 'WORK' }] : [],
    EMAIL: company.email ? [{ VALUE: company.email, VALUE_TYPE: 'WORK' }] : [],
    INDUSTRY: '',
  };
  for (const code of COMPANY_BIN_FIELDS) fields[code] = digits || company.bin_iin;
  return fields;
}

async function createOrUpdateCompany(existingBitrixCompanyId: string | null | undefined, company: CompanyPayload): Promise<string> {
  const foundByBin = await findExistingCompanyIdByBin(company.bin_iin, company.name);
  const targetId = foundByBin || normalizePlain(existingBitrixCompanyId);
  const fields = buildCompanyFields(company);
  if (targetId) {
    await callBitrix('crm.company.update', { id: targetId, fields });
    return targetId;
  }
  const created = await callBitrix('crm.company.add', { fields });
  return String(created || '');
}

async function attachPaymentFileToDeal(bitrixDealId: string, paymentOrderUrl: string, paymentOrderName = '') {
  if (!bitrixDealPaymentFileField || !paymentOrderUrl) return;
  const file = await fetchFileAsBase64(paymentOrderUrl);
  let fileName = sanitizeFileName(paymentOrderName);
  if (!fileName) {
    const ext = extensionFromContentType(file.contentType);
    fileName = `payment_order${ext ? `.${ext}` : ''}`;
  }
  await callBitrix('crm.deal.update', {
    id: bitrixDealId,
    fields: {
      [bitrixDealPaymentFileField]: {
        fileData: [fileName, file.base64],
      },
    },
  });
}

async function createOrUpdateDeal(existingBitrixDealId: string | null | undefined, bitrixCompanyId: string, company: CompanyPayload, dealTitle: string): Promise<string> {
  const fields: PlainObject = {
    TITLE: dealTitle,
    COMPANY_ID: bitrixCompanyId,
  };
  if (!existingBitrixDealId) fields.STAGE_ID = 'NEW';
  if (company.city) {
    fields['UF_CRM_1772560175'] = company.city;
    fields['UF_CRM_CITY'] = company.city;
  }
  if (bitrixDealPaymentField && company.payment_order_url) fields[bitrixDealPaymentField] = company.payment_order_url;
  if (bitrixDealPaymentStatusField && typeof company.payment_is_paid === 'boolean') {
    fields[bitrixDealPaymentStatusField] = company.payment_is_paid ? 'Y' : 'N';
  }
  if (existingBitrixDealId) {
    await callBitrix('crm.deal.update', { id: existingBitrixDealId, fields });
    await attachPaymentFileToDeal(existingBitrixDealId, String(company.payment_order_url || ''), String(company.payment_order_name || ''));
    return existingBitrixDealId;
  }
  const created = await callBitrix('crm.deal.add', { fields });
  const dealId = String(created || '');
  await attachPaymentFileToDeal(dealId, String(company.payment_order_url || ''), String(company.payment_order_name || ''));
  return dealId;
}

async function createSmartProcessItem(entityTypeId: number, dealId: string, companyId: string, fields: PlainObject): Promise<string> {
  const variants: Array<Record<string, unknown>> = [
    { parentId2: dealId, companyId, COMPANY_ID: companyId },
    { PARENT_ID_2: dealId, companyId, COMPANY_ID: companyId },
    { parentId1: dealId, companyId, COMPANY_ID: companyId },
    { PARENT_ID_1: dealId, companyId, COMPANY_ID: companyId },
    { companyId, COMPANY_ID: companyId },
  ];
  let lastError: unknown = null;
  for (const relation of variants) {
    try {
      const result = await callBitrix('crm.item.add', { entityTypeId, fields: { ...fields, ...relation } });
      return String(result?.item?.id || result || '');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Failed to create smart-process item');
}

async function deleteSmartProcessItem(entityTypeId: number, itemId: string): Promise<void> {
  await callBitrix('crm.item.delete', { entityTypeId, id: itemId });
}

async function attachPhotoToSmartItem(entityTypeId: number, itemId: string, photoUrl: string, participantName: string): Promise<void> {
  if (!photoUrl) return;
  const file = await fetchFileAsBase64(photoUrl);
  const ext = extensionFromContentType(file.contentType) || 'jpg';
  const fileName = `${sanitizeFileName(participantName) || `photo_${Date.now().toString(36)}`}.${ext}`;
  for (const key of PHOTO_FIELD_CANDIDATES) {
    try {
      await callBitrix('crm.item.update', {
        entityTypeId,
        id: itemId,
        fields: {
          [key]: { fileData: [fileName, file.base64] },
        },
      });
      return;
    } catch {
      // try next key
    }
  }
  throw new Error('Failed to attach photo');
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);

  if (!allowedOriginEnv) {
    return new Response(JSON.stringify({ error: 'ALLOWED_ORIGIN is not configured' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase service role env is not configured' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json() as {
      questionnaireId?: string;
      company?: CompanyPayload;
      participants?: ParticipantPayload[];
      dealId?: string | null;
      existingDeal?: DealPayload | null;
    };
    const questionnaireId = normalizePlain(body.questionnaireId);
    const company = (body.company || null) as CompanyPayload | null;
    const participants = Array.isArray(body.participants) ? body.participants : [];
    const dealId = normalizePlain(body.dealId);
    const existingDeal = (body.existingDeal || null) as DealPayload | null;

    if (!questionnaireId || !company) {
      return new Response(JSON.stringify({ error: 'questionnaireId and company are required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const allCourses = [...new Set(participants.flatMap(p => (p.courses || []).map(c => c.course_name)).filter(Boolean))];
    const participantsCount = participants.length;
    const uniqueCoursesCount = allCourses.length;
    const totalCourseRequests = participants.reduce((sum, p) => sum + (p.courses?.length || 0), 0);
    const titlePrefix = [company.name, company.city].filter(Boolean).join(' - ');
    const dealTitle = [titlePrefix, `${participantsCount} сотрудников, ${uniqueCoursesCount} курсов, ${totalCourseRequests} заявок на курсы`].filter(Boolean).join(' - ');
    const entityTypeId = await findSmartProcessEntityTypeId();
    const isUpdate = Boolean(existingDeal?.bitrix_deal_id);

    const bitrixCompanyId = await createOrUpdateCompany(existingDeal?.bitrix_company_id || null, company);
    const bitrixDealId = await createOrUpdateDeal(existingDeal?.bitrix_deal_id || null, bitrixCompanyId, company, dealTitle);
    const dealUrl = `https://hsecompany.bitrix24.kz/crm/deal/details/${bitrixDealId}/`;

    await supabaseAdmin.from('companies').update({ bitrix_company_id: bitrixCompanyId, updated_at: new Date().toISOString() }).eq('id', company.id);

    if (dealId) {
      await supabaseAdmin.from('deals').update({ bitrix_deal_id: bitrixDealId, bitrix_company_id: bitrixCompanyId, deal_title: dealTitle, deal_url: dealUrl, sync_status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', dealId);
    } else {
      await supabaseAdmin.from('deals').upsert({ questionnaire_id: questionnaireId, company_id: company.id, bitrix_deal_id: bitrixDealId, bitrix_company_id: bitrixCompanyId, deal_title: dealTitle, deal_url: dealUrl, sync_status: 'in_progress' }, { onConflict: 'questionnaire_id' });
    }

    if (isUpdate) {
      const { data: oldCerts } = await supabaseAdmin.from('certificates').select('id, bitrix_item_id').eq('questionnaire_id', questionnaireId).not('bitrix_item_id', 'is', null);
      const deleteIds = Array.from(new Set((oldCerts || []).map(item => normalizePlain((item as Record<string, unknown>).bitrix_item_id)).filter(value => /^\d+$/.test(value))));
      for (const itemId of deleteIds) {
        try {
          await deleteSmartProcessItem(entityTypeId, itemId);
        } catch {
          // ignore
        }
      }
      await supabaseAdmin.from('certificates').delete().eq('questionnaire_id', questionnaireId);
    }

    let created = 0;
    let photoFailures = 0;
    const photoFailureSamples: string[] = [];

    for (const participant of participants) {
      const courses = participant.courses && participant.courses.length > 0 ? participant.courses : [{ course_name: '' }];
      for (const course of courses) {
        const categoryValue = (await resolveSmartProcessEnumId(entityTypeId, BITRIX_FIELDS_RAW.CATEGORY, BITRIX_FIELDS.CATEGORY, participant.category || '')) || participant.category;
        const courseValue = (await resolveSmartProcessEnumId(entityTypeId, BITRIX_FIELDS_RAW.COURSE_NAME, BITRIX_FIELDS.COURSE_NAME, course.course_name || '')) || course.course_name;
        const fields: PlainObject = {
          TITLE: [participant.last_name, participant.first_name, course.course_name].filter(Boolean).join(' - '),
          [BITRIX_FIELDS.LAST_NAME]: participant.last_name || '',
          [BITRIX_FIELDS.FIRST_NAME]: participant.first_name || '',
          [BITRIX_FIELDS.MIDDLE_NAME]: participant.patronymic || '',
          [BITRIX_FIELDS.POSITION]: participant.position || '',
          [BITRIX_FIELDS.CATEGORY]: categoryValue || '',
          [BITRIX_FIELDS.COURSE_NAME]: courseValue || '',
        };
        const bitrixItemId = await createSmartProcessItem(entityTypeId, bitrixDealId, bitrixCompanyId, fields);

        if (participant.photo_url) {
          const fullName = [participant.last_name, participant.first_name, participant.patronymic].filter(Boolean).join(' ');
          try {
            await attachPhotoToSmartItem(entityTypeId, bitrixItemId, String(participant.photo_url), fullName);
          } catch (error) {
            photoFailures++;
            if (photoFailureSamples.length < 3) {
              photoFailureSamples.push(`${fullName || participant.id}: ${error instanceof Error ? error.message : String(error || 'photo error')}`);
            }
          }
        }

        const { error: certError } = await supabaseAdmin.from('certificates').insert({
          questionnaire_id: questionnaireId,
          company_id: company.id,
          participant_id: participant.id,
          bitrix_item_id: bitrixItemId,
          last_name: participant.last_name,
          first_name: participant.first_name,
          middle_name: participant.patronymic,
          position: participant.position,
          category: participant.category,
          course_name: course.course_name,
          sync_status: 'synced',
        });
        if (certError) throw certError;
        created++;
      }
    }

    await supabaseAdmin.from('deals').update({ sync_status: 'success', synced_at: new Date().toISOString(), deal_url: dealUrl, bitrix_deal_id: bitrixDealId, bitrix_company_id: bitrixCompanyId }).eq('questionnaire_id', questionnaireId);
    await supabaseAdmin.from('questionnaires').update({ status: 'synced' }).eq('id', questionnaireId);

    return new Response(JSON.stringify({ success: true, isUpdate, dealTitle, created, photoFailures, photoFailureSamples }), { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
});
