import type { PaymentOrderExtractedFields } from './cloudinary';

const OCR_API_URL = String(import.meta.env.VITE_PAYMENT_OCR_API_URL || '').replace(/\/+$/, '');

export async function extractPaymentOrderFields(file: File): Promise<PaymentOrderExtractedFields> {
  if (!OCR_API_URL) {
    throw new Error('OCR API URL is not configured (VITE_PAYMENT_OCR_API_URL)');
  }

  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${OCR_API_URL}/extract-payment-order`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String(data?.detail || data?.error || 'OCR extraction failed');
    throw new Error(detail);
  }

  const extracted = (data?.extracted || {}) as Record<string, unknown>;
  return {
    payment_order_bin_iin: String(extracted.payment_order_bin_iin || '').trim() || undefined,
    payment_order_number: String(extracted.payment_order_number || '').trim() || undefined,
    payment_order_date: String(extracted.payment_order_date || '').trim() || undefined,
    payment_order_amount: String(extracted.payment_order_amount || '').trim() || undefined,
  };
}
