import type { PaymentOrderExtractedFields } from './cloudinary';

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

function parseOcrApiCandidates(rawValue: string): string[] {
  return String(rawValue || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => v.replace(/\/+$/, ''));
}

function resolveOcrApiUrl(): string {
  const raw = String(import.meta.env.VITE_PAYMENT_OCR_API_URL || '').trim();
  const candidates = parseOcrApiCandidates(raw);
  if (candidates.length === 0) return '';

  const valid = candidates.filter(candidate => {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  });
  if (valid.length === 0) return '';

  const browserHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const browserIsLocal = isLocalHost(browserHost);

  if (browserIsLocal) {
    const localCandidate = valid.find(candidate => {
      try {
        return isLocalHost(new URL(candidate).hostname);
      } catch {
        return false;
      }
    });
    return localCandidate || valid[0];
  }

  const publicCandidate = valid.find(candidate => {
    try {
      return !isLocalHost(new URL(candidate).hostname);
    } catch {
      return false;
    }
  });
  return publicCandidate || valid[0];
}

const OCR_API_URL = resolveOcrApiUrl();

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
