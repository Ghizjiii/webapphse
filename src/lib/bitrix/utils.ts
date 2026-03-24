export function decodeUnicodeEscapes(value: string): string {
  return String(value || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

export function sanitizeFileName(name: string): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/[\\/:*?"<>|]+/g, '_');
}

export function extensionFromContentType(contentType: string): string {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('pdf')) return 'pdf';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('excel') || ct.includes('spreadsheetml') || ct.includes('sheet')) return 'xlsx';
  if (ct.includes('csv')) return 'csv';
  return '';
}

export function fileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const fromPath = decodeURIComponent(u.pathname.split('/').pop() || '').trim();
    return sanitizeFileName(fromPath);
  } catch {
    return '';
  }
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

export function normalizePlain(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeDateValue(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const datePart = raw.includes('T') ? raw.split('T')[0] : raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

  const m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

export function extractListRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  const wrapped = payload as Record<string, unknown>;
  if (Array.isArray(wrapped?.items)) return wrapped.items as Array<Record<string, unknown>>;
  if (Array.isArray(wrapped?.result)) return wrapped.result as Array<Record<string, unknown>>;
  return [];
}
