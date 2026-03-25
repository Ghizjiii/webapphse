import type { RefCompanyDirectory } from '../../types';

export interface LocalParticipant {
  id: string;
  isPersisted?: boolean;
  last_name: string;
  first_name: string;
  patronymic: string;
  position: string;
  category: string;
  courses: string[];
  photo_url: string;
  photoFile?: File;
  photoPreview?: string;
  uploading?: boolean;
}

export interface ValidationErrors {
  company_name?: string;
  company_phone?: string;
  company_bin?: string;
  contract?: string;
  payment_order?: string;
  payment_order_number?: string;
  payment_order_date?: string;
  payment_order_amount?: string;
  participants?: string;
}

export const PARTICIPANT_REQUIRED_FIELD_LABELS = {
  photo: 'фото',
  last_name: 'фамилия',
  first_name: 'имя',
  patronymic: 'отчество',
  position: 'должность',
  category: 'категория',
  courses: 'курсы',
} as const;

export type LinkStatus = 'loading' | 'valid' | 'invalid' | 'expired' | 'inactive' | 'submitted';
export type PaymentOrderStage = 'idle' | 'uploading' | 'recognizing' | 'checking' | 'done' | 'error';

export const DUPLICATE_PAYMENT_ORDER_ERROR =
  'Этот счет уже был загружен ранее для этой компании (BIN/ИИН, номер, дата и сумма совпадают). Загрузите другой счет.';

export function createLocalParticipant(): LocalParticipant {
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
    isPersisted: false,
    last_name: '',
    first_name: '',
    patronymic: '',
    position: '',
    category: '',
    courses: [],
    photo_url: '',
  };
}

export function hasParticipantPhoto(participant: LocalParticipant): boolean {
  return Boolean(participant.photoFile || participant.photoPreview || participant.photo_url);
}

export function isParticipantRowStarted(participant: LocalParticipant): boolean {
  return Boolean(
    participant.isPersisted ||
    participant.last_name.trim() ||
    participant.first_name.trim() ||
    participant.patronymic.trim() ||
    participant.position.trim() ||
    participant.category.trim() ||
    participant.courses.length > 0 ||
    hasParticipantPhoto(participant)
  );
}

export function getParticipantMissingFields(participant: LocalParticipant): Array<keyof typeof PARTICIPANT_REQUIRED_FIELD_LABELS> {
  const missing: Array<keyof typeof PARTICIPANT_REQUIRED_FIELD_LABELS> = [];
  if (!hasParticipantPhoto(participant)) missing.push('photo');
  if (!participant.last_name.trim()) missing.push('last_name');
  if (!participant.first_name.trim()) missing.push('first_name');
  if (!participant.patronymic.trim()) missing.push('patronymic');
  if (!participant.position.trim()) missing.push('position');
  if (!participant.category.trim()) missing.push('category');
  if (participant.courses.length === 0) missing.push('courses');
  return missing;
}

export function normalizeDigits(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function normalizePaymentOrderNumber(value: string): string {
  const cleaned = String(value || '')
    .replace(/№/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  if (/^\d+$/.test(cleaned)) {
    return String(Number(cleaned));
  }

  return cleaned;
}

export function isPaymentOrderDuplicateError(err: unknown): boolean {
  const error = err as { code?: string; message?: string; details?: string; hint?: string };
  const code = String(error?.code || '');
  const raw = `${String(error?.message || '')} ${String(error?.details || '')} ${String(error?.hint || '')}`.toLowerCase();
  return code === '23505' && /payment_order|companies_payment_order|business_key|registry/.test(raw);
}

export function parsePaymentOrderAmount(value: string): number | null {
  const cleaned = String(value || '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '');

  if (!cleaned) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed * 100) / 100;
}

function parseIsoDate(value: string | null | undefined): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isContractActiveByDates(startRaw: string | null | undefined, endRaw: string | null | undefined): boolean | null {
  const start = parseIsoDate(startRaw);
  const end = parseIsoDate(endRaw);
  if (!start && !end) return null;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (start && todayStart < start) return false;
  if (end && todayStart > end) return false;
  return true;
}

export function applyDirectoryMatchToCompany(match: RefCompanyDirectory | null) {
  if (!match) {
    return {
      companyName: '',
      companyPhone: '',
      companyEmail: '',
      companyCity: '',
    };
  }

  return {
    companyName: match.name || '',
    companyPhone: match.phone || '',
    companyEmail: match.email || '',
    companyCity: match.city || '',
  };
}
