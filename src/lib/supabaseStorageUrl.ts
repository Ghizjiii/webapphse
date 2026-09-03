const SUPABASE_PUBLIC_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');

export function externalizeSupabaseStorageUrl(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (SUPABASE_PUBLIC_URL && ['kong', 'localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return `${SUPABASE_PUBLIC_URL}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return raw;
  } catch {
    return raw;
  }
}
