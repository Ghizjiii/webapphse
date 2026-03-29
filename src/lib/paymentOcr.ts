import type { PaymentOrderExtractedFields } from './cloudinary';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

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
    payment_order_number: String(extracted.payment_order_number || '').trim() || undefined,
    payment_order_date: String(extracted.payment_order_date || '').trim() || undefined,
    payment_order_amount: String(extracted.payment_order_amount || '').trim() || undefined,
  };
}
