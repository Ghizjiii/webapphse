import { supabase } from './supabase';
import type { AppProfile, AppRole } from '../types';

export type ProfileDirectoryEntry = Pick<AppProfile, 'user_id' | 'email' | 'full_name' | 'role'>;

export const APP_ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Администратор',
  coordinator: 'Координатор',
  department_head: 'Руководитель отдела',
  user: 'Пользователь',
};

export function getProfileDisplayName(
  profile: ProfileDirectoryEntry | null | undefined,
  fallbackEmail = '',
): string {
  const fullName = String(profile?.full_name || '').trim();
  if (fullName) return fullName;

  const email = String(profile?.email || '').trim();
  if (email) return email;

  const fallback = String(fallbackEmail || '').trim();
  return fallback || 'Не указан';
}

export async function loadProfileDirectory(userIds: string[]): Promise<ProfileDirectoryEntry[]> {
  const requestedUserIds = Array.from(new Set(userIds.map(id => String(id || '').trim()).filter(Boolean)));
  if (requestedUserIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_app_profile_directory', {
    requested_user_ids: requestedUserIds,
  });

  if (error) {
    console.warn('get_app_profile_directory failed', error);
    return [];
  }

  return Array.isArray(data) ? (data as ProfileDirectoryEntry[]) : [];
}
