export interface IssuerCompanyProfile {
  canonicalName: string;
  protocolPrefix: 'HSE' | 'EDU';
  directorFullName: string;
  directorShortName: string;
}

const HSE_COMPANY: IssuerCompanyProfile = {
  canonicalName: 'HSE Company',
  protocolPrefix: 'HSE',
  directorFullName: '\u0428\u0430\u043c\u0441\u0443\u0442\u0434\u0438\u043d\u043e\u0432 \u0418\u043b\u044c\u0434\u0430\u0440 \u0417\u0430\u043a\u0438\u0435\u0432\u0438\u0447',
  directorShortName: '\u0428\u0430\u043c\u0441\u0443\u0442\u0434\u0438\u043d\u043e\u0432 \u0418.\u0417.',
};

const SAFETY_EDUCATION_GROUP: IssuerCompanyProfile = {
  canonicalName: 'Safety Education Group',
  protocolPrefix: 'EDU',
  directorFullName: '\u041c\u0443\u0444\u0442\u0430\u0445\u0438\u0435\u0432\u0430 \u041a\u0430\u043c\u0438\u044f \u0410\u0436\u043c\u0443\u0445\u0430\u043d\u043e\u0432\u043d\u0430',
  directorShortName: '\u041c\u0443\u0444\u0442\u0430\u0445\u0438\u0435\u0432\u0430 \u041a.\u0410.',
};

function normalizeIssuerName(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u00ab\u00bb"']/g, '')
    .replace(/\b(?:too|\u0442\u043e\u043e)\b/giu, '')
    .replace(/[^a-z\u0430-\u044f\u0451]+/giu, ' ')
    .trim();
}

export function resolveIssuerCompanyProfile(
  issuerCompany: string | null | undefined,
): IssuerCompanyProfile {
  const normalized = normalizeIssuerName(issuerCompany);
  if (normalized.includes('safety education group')) return SAFETY_EDUCATION_GROUP;
  return HSE_COMPANY;
}

export function issuerCompanyGroupingKey(issuerCompany: string | null | undefined): string {
  return resolveIssuerCompanyProfile(issuerCompany).protocolPrefix;
}

export function formatProtocolNumber(
  protocolNumber: string | number | null | undefined,
  issuerCompany: string | null | undefined,
): string {
  const rawNumber = String(protocolNumber ?? '').trim();
  if (!rawNumber) return '';

  const numberWithoutPrefix = rawNumber.replace(/^(?:HSE|EDU)\s+/i, '').trim();
  const { protocolPrefix } = resolveIssuerCompanyProfile(issuerCompany);
  return `${protocolPrefix} ${numberWithoutPrefix}`;
}
