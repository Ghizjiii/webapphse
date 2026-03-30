import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? 'Missing Supabase env vars: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
    : null;

export const supabase = createClient(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'invalid-anon-key'
);

export async function getFreshAccessToken(graceMs = 60_000): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;

  if (error || !session?.access_token) {
    throw new Error('Сессия истекла. Войдите заново.');
  }

  const expiresAtMs = typeof session.expires_at === 'number' ? session.expires_at * 1000 : 0;
  if (!expiresAtMs || expiresAtMs - Date.now() > graceMs) {
    return session.access_token;
  }

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  const refreshedToken = refreshedData.session?.access_token || '';

  if (refreshError || !refreshedToken) {
    throw new Error('Сессия истекла. Войдите заново.');
  }

  return refreshedToken;
}
