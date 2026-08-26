import type {
  PaymentOrderAcceptedBeneficiary,
  PaymentOrderBeneficiaryCheck,
  PaymentOrderExtractedFields,
} from './cloudinary';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map(item => String(item || '').trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function asRecordArray(value: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is Record<string, unknown> => (
    item !== null && typeof item === 'object' && !Array.isArray(item)
  ));
  return items.length > 0 ? items : undefined;
}

function asAcceptedBeneficiaries(value: unknown): PaymentOrderAcceptedBeneficiary[] | undefined {
  const records = asRecordArray(value);
  if (!records) return undefined;
  const items = records
    .map(record => {
      const name = String(record.name || '').trim();
      const bin = String(record.bin || '').trim();
      const accounts = asStringArray(record.accounts);
      if (!name || !bin || !accounts?.length) return null;
      return { name, bin, accounts };
    })
    .filter((item): item is PaymentOrderAcceptedBeneficiary => item !== null);
  return items.length > 0 ? items : undefined;
}

function asBeneficiaryChecks(value: unknown): PaymentOrderBeneficiaryCheck[] | undefined {
  const records = asRecordArray(value);
  if (!records) return undefined;
  const items = records
    .map(record => {
      const name = String(record.name || '').trim();
      const bin = String(record.bin || '').trim();
      const accounts = asStringArray(record.accounts);
      if (!name || !bin || !accounts?.length) return null;
      const item: PaymentOrderBeneficiaryCheck = {
        name,
        bin,
        accounts,
      };
      if (typeof record.bin_matched === 'boolean') item.bin_matched = record.bin_matched;
      if (typeof record.account_matched === 'boolean') item.account_matched = record.account_matched;
      return item;
    })
    .filter((item): item is PaymentOrderBeneficiaryCheck => item !== null);
  return items.length > 0 ? items : undefined;
}

export async function extractPaymentOrderFields(file: File): Promise<PaymentOrderExtractedFields> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase OCR proxy is not configured');
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-payment-order`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: formData,
  });

  const responseText = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = String(
      data?.detail ||
      data?.error ||
      responseText ||
      `OCR extraction failed (HTTP ${res.status})`
    ).trim();
    throw new Error(detail.slice(0, 400));
  }

  const extracted = (data?.extracted || {}) as Record<string, unknown>;
  return {
    payment_order_bin_iin: String(extracted.payment_order_bin_iin || '').trim() || undefined,
    payment_order_payer_name: String(extracted.payment_order_payer_name || '').trim() || undefined,
    payment_order_number: String(extracted.payment_order_number || '').trim() || undefined,
    payment_order_date: String(extracted.payment_order_date || '').trim() || undefined,
    payment_order_amount: String(extracted.payment_order_amount || '').trim() || undefined,
    payment_order_beneficiary_valid:
      typeof extracted.payment_order_beneficiary_valid === 'boolean'
        ? extracted.payment_order_beneficiary_valid
        : undefined,
    payment_order_beneficiary_bin: String(extracted.payment_order_beneficiary_bin || '').trim() || undefined,
    payment_order_beneficiary_account: String(extracted.payment_order_beneficiary_account || '').trim() || undefined,
    payment_order_beneficiary_name: String(extracted.payment_order_beneficiary_name || '').trim() || undefined,
    payment_order_beneficiary_bin_matched:
      typeof extracted.payment_order_beneficiary_bin_matched === 'boolean'
        ? extracted.payment_order_beneficiary_bin_matched
        : undefined,
    payment_order_beneficiary_account_matched:
      typeof extracted.payment_order_beneficiary_account_matched === 'boolean'
        ? extracted.payment_order_beneficiary_account_matched
        : undefined,
    payment_order_beneficiary_reason: String(extracted.payment_order_beneficiary_reason || '').trim() || undefined,
    payment_order_detected_bins: asStringArray(extracted.payment_order_detected_bins),
    payment_order_detected_accounts: asStringArray(extracted.payment_order_detected_accounts),
    payment_order_beneficiary_checks: asBeneficiaryChecks(extracted.payment_order_beneficiary_checks),
    payment_order_accepted_beneficiaries: asAcceptedBeneficiaries(extracted.payment_order_accepted_beneficiaries),
  };
}
