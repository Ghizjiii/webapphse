import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, Save, UserPlus } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getFreshAccessToken, supabase } from '../lib/supabase';
import { APP_ROLE_LABELS } from '../lib/profileDirectory';
import type { AppProfile, AppRole, BitrixEmployee, QuestionnaireAccessScope } from '../types';

type CreateUserForm = {
  email: string;
  password: string;
  full_name: string;
  role: AppRole;
  region_bitrix_item_id: string;
  questionnaire_access: QuestionnaireAccessScope;
  bitrix_user_id: string;
};

type RegionOption = {
  bitrix_item_id: string;
  name: string;
};

const ROLE_OPTIONS: AppRole[] = ['admin', 'coordinator', 'department_head', 'user'];

const QUESTIONNAIRE_ACCESS_LABELS: Record<QuestionnaireAccessScope, string> = {
  own: 'Только свои заявки',
  all: 'Все заявки',
};

const QUESTIONNAIRE_ACCESS_OPTIONS: QuestionnaireAccessScope[] = ['own', 'all'];

function sortProfiles(left: AppProfile, right: AppProfile): number {
  const roleWeight: Record<AppRole, number> = {
    admin: 0,
    coordinator: 1,
    department_head: 2,
    user: 3,
  };
  const byRole = roleWeight[left.role] - roleWeight[right.role];
  if (byRole !== 0) return byRole;
  return String(left.email || '').localeCompare(String(right.email || ''), 'ru');
}

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [profiles, setProfiles] = useState<AppProfile[]>([]);
  const [bitrixEmployees, setBitrixEmployees] = useState<BitrixEmployee[]>([]);
  const [regionOptions, setRegionOptions] = useState<RegionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingEmployees, setSyncingEmployees] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [passwordSavingUserId, setPasswordSavingUserId] = useState<string | null>(null);
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState<CreateUserForm>({
    email: '',
    password: '',
    full_name: '',
    role: 'coordinator',
    region_bitrix_item_id: '',
    questionnaire_access: 'own',
    bitrix_user_id: '',
  });

  const employeeOptions = useMemo(
    () =>
      [...bitrixEmployees].sort((left, right) => {
        const activeDiff = Number(right.active) - Number(left.active);
        if (activeDiff !== 0) return activeDiff;
        return String(left.full_name || '').localeCompare(String(right.full_name || ''), 'ru');
      }),
    [bitrixEmployees],
  );

  const sortedRegionOptions = useMemo(
    () =>
      [...regionOptions].sort((left, right) =>
        String(left.name || '').localeCompare(String(right.name || ''), 'ru'),
      ),
    [regionOptions],
  );

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    const [profilesRes, employeesRes, regionsRes] = await Promise.all([
      supabase.from('app_profiles').select('*'),
      supabase.from('bitrix_employees').select('*'),
      supabase
        .from('ref_bitrix_list_items')
        .select('bitrix_item_id, name')
        .eq('list_key', 'REGIONS')
        .order('sort_order')
        .order('name'),
    ]);

    if (profilesRes.error) {
      showToast('error', profilesRes.error.message);
    } else {
      setProfiles(((profilesRes.data || []) as AppProfile[]).sort(sortProfiles));
    }

    if (employeesRes.error) {
      showToast('error', employeesRes.error.message);
    } else {
      setBitrixEmployees((employeesRes.data || []) as BitrixEmployee[]);
    }

    if (regionsRes.error) {
      showToast('error', regionsRes.error.message);
    } else {
      const nextRegions = (regionsRes.data || [])
        .map(item => ({
          bitrix_item_id: String(item.bitrix_item_id || '').trim(),
          name: String(item.name || '').trim(),
        }))
        .filter(item => item.bitrix_item_id && item.name);
      setRegionOptions(nextRegions);
    }

    if (showSpinner) setLoading(false);
  }, [showToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function updateProfileRow(userId: string, patch: Partial<AppProfile>) {
    setProfiles(current =>
      current
        .map(profile => (profile.user_id === userId ? { ...profile, ...patch } : profile))
        .sort(sortProfiles),
    );
  }

  function getRegionPatch(regionBitrixItemId: string) {
    const selectedRegion = sortedRegionOptions.find(region => region.bitrix_item_id === regionBitrixItemId) || null;

    return {
      region_bitrix_item_id: selectedRegion?.bitrix_item_id || '',
      region_name: selectedRegion?.name || '',
    };
  }

  function getQuestionnaireAccessForRole(role: AppRole, access: QuestionnaireAccessScope): QuestionnaireAccessScope {
    return role === 'admin' ? 'all' : access;
  }

  async function getAccessToken() {
    return await getFreshAccessToken();

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token || '';

    if (!accessToken) {
      throw new Error('Сессия истекла. Войдите заново.');
    }

    return accessToken;
  }

  async function syncBitrixEmployees() {
    if (syncingEmployees) return;

    setSyncingEmployees(true);
    try {
      const accessToken = await getAccessToken();
      const { data, error } = await supabase.functions.invoke('bitrix-users-sync', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error || 'Ошибка синхронизации'));
      }

      showToast('success', `Сотрудники Bitrix обновлены: ${Number(data?.count || 0)}`);
      await loadData(false);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Ошибка синхронизации сотрудников Bitrix');
    } finally {
      setSyncingEmployees(false);
    }
  }

  async function createUser() {
    if (creating) return;
    if (!form.email.trim() || !form.password.trim()) {
      showToast('warning', 'Укажите email и пароль');
      return;
    }

    setCreating(true);
    try {
      const accessToken = await getAccessToken();
      const bitrixEmployee = employeeOptions.find(item => item.bitrix_user_id === form.bitrix_user_id) || null;
      const selectedRegion = sortedRegionOptions.find(item => item.bitrix_item_id === form.region_bitrix_item_id) || null;
      const { data, error } = await supabase.functions.invoke('admin-users', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          action: 'create-user',
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          role: form.role,
          region_bitrix_item_id: selectedRegion?.bitrix_item_id || '',
          region_name: selectedRegion?.name || '',
          questionnaire_access: getQuestionnaireAccessForRole(form.role, form.questionnaire_access),
          bitrix_user_id: bitrixEmployee?.bitrix_user_id || '',
          bitrix_user_name: bitrixEmployee?.full_name || '',
        },
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error || 'Ошибка создания пользователя'));
      }

      showToast('success', 'Пользователь создан');
      setForm({
        email: '',
        password: '',
        full_name: '',
        role: 'coordinator',
        region_bitrix_item_id: '',
        questionnaire_access: 'own',
        bitrix_user_id: '',
      });
      await loadData(false);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Ошибка создания пользователя');
    } finally {
      setCreating(false);
    }
  }

  async function saveProfile(profile: AppProfile) {
    if (savingUserId) return;

    setSavingUserId(profile.user_id);
    try {
      const accessToken = await getAccessToken();
      const bitrixEmployee = employeeOptions.find(item => item.bitrix_user_id === (profile.bitrix_user_id || '')) || null;
      const { data, error } = await supabase.functions.invoke('admin-users', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          action: 'update-user',
          user_id: profile.user_id,
          email: profile.email,
          full_name: profile.full_name.trim(),
          role: profile.role,
          is_active: profile.is_active,
          region_bitrix_item_id: profile.region_bitrix_item_id || '',
          region_name: profile.region_name || '',
          questionnaire_access: getQuestionnaireAccessForRole(profile.role, profile.questionnaire_access || 'own'),
          bitrix_user_id: bitrixEmployee?.bitrix_user_id || '',
          bitrix_user_name: bitrixEmployee?.full_name || '',
        },
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error || 'Save profile failed'));
      }

      showToast('success', 'Профиль обновлён');
      await loadData(false);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Ошибка сохранения профиля');
    } finally {
      setSavingUserId(null);
    }
  }

  async function updatePassword(profileUserId: string) {
    if (passwordSavingUserId) return;

    const nextPassword = String(passwordDrafts[profileUserId] || '').trim();
    if (!nextPassword) {
      showToast('warning', 'Укажите новый пароль');
      return;
    }

    setPasswordSavingUserId(profileUserId);
    try {
      const accessToken = await getAccessToken();
      const { data, error } = await supabase.functions.invoke('admin-users', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          action: 'set-password',
          user_id: profileUserId,
          password: nextPassword,
        },
      });

      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error || 'Ошибка обновления пароля'));
      }

      setPasswordDrafts(current => ({ ...current, [profileUserId]: '' }));
      showToast('success', 'Пароль обновлён');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Ошибка обновления пароля');
    } finally {
      setPasswordSavingUserId(null);
    }
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Анкеты', to: '/dashboard' }, { label: 'Пользователи' }]}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Пользователи и привязка Bitrix</h1>
            <p className="mt-1 text-sm text-gray-500">
              Администратор управляет логинами приложения и сопоставляет каждого координатора с сотрудником Bitrix.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void syncBitrixEmployees()}
            disabled={syncingEmployees}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCw size={15} className={syncingEmployees ? 'animate-spin' : ''} />
            {syncingEmployees ? 'Синхронизация...' : 'Выгрузить сотрудников Bitrix'}
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Создать пользователя</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            <input
              type="email"
              value={form.email}
              onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
              placeholder="Email"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={form.password}
              onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
              placeholder="Пароль"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={form.full_name}
              onChange={event => setForm(current => ({ ...current, full_name: event.target.value }))}
              placeholder="ФИО"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={form.role}
              onChange={event => {
                const nextRole = event.target.value as AppRole;
                setForm(current => ({
                  ...current,
                  role: nextRole,
                  questionnaire_access: getQuestionnaireAccessForRole(nextRole, current.questionnaire_access),
                }));
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {ROLE_OPTIONS.map(role => (
                <option key={role} value={role}>
                  {APP_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <select
              value={form.region_bitrix_item_id}
              onChange={event => setForm(current => ({ ...current, region_bitrix_item_id: event.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Без региона / отдела</option>
              {sortedRegionOptions.map(region => (
                <option key={region.bitrix_item_id} value={region.bitrix_item_id}>
                  {region.name}
                </option>
              ))}
            </select>
            <select
              value={getQuestionnaireAccessForRole(form.role, form.questionnaire_access)}
              onChange={event =>
                setForm(current => ({
                  ...current,
                  questionnaire_access: event.target.value as QuestionnaireAccessScope,
                }))
              }
              disabled={form.role === 'admin'}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
            >
              {QUESTIONNAIRE_ACCESS_OPTIONS.map(access => (
                <option key={access} value={access}>
                  {QUESTIONNAIRE_ACCESS_LABELS[access]}
                </option>
              ))}
            </select>
            <select
              value={form.bitrix_user_id}
              onChange={event => setForm(current => ({ ...current, bitrix_user_id: event.target.value }))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Без привязки Bitrix</option>
              {employeeOptions.map(employee => (
                <option key={employee.bitrix_user_id} value={employee.bitrix_user_id}>
                  {employee.full_name} {employee.active ? '' : '(неактивен)'}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void createUser()}
            disabled={creating}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-slate-800 disabled:opacity-60"
          >
            <UserPlus size={15} />
            {creating ? 'Создаём...' : 'Создать пользователя'}
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="text-base font-semibold text-gray-900">Пользователи приложения</div>
            <div className="mt-1 text-sm text-gray-500">
              При отправке данных в Bitrix ответственным будет выбран сотрудник из колонки привязки.
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : profiles.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">Пользователи ещё не созданы.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">ФИО</th>
                    <th className="px-4 py-3 text-left font-medium">Роль</th>
                    <th className="px-4 py-3 text-left font-medium">Регион / отдел</th>
                    <th className="px-4 py-3 text-left font-medium">Права</th>
                    <th className="px-4 py-3 text-left font-medium">Активен</th>
                    <th className="px-4 py-3 text-left font-medium">Сотрудник Bitrix</th>
                    <th className="px-4 py-3 text-left font-medium">Новый пароль</th>
                    <th className="px-4 py-3 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map(profile => {
                    const isCurrentUser = profile.user_id === user?.id;

                    return (
                      <tr key={profile.user_id} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-3 text-gray-900">
                          <div>{profile.email}</div>
                          {profile.bitrix_user_id && (
                            <div className="mt-1 text-xs text-gray-500">Bitrix ID: {profile.bitrix_user_id}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={profile.full_name || ''}
                            onChange={event => updateProfileRow(profile.user_id, { full_name: event.target.value })}
                            className="w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={profile.role}
                            onChange={event => {
                              const nextRole = event.target.value as AppRole;
                              updateProfileRow(profile.user_id, {
                                role: nextRole,
                                questionnaire_access: getQuestionnaireAccessForRole(
                                  nextRole,
                                  profile.questionnaire_access || 'own',
                                ),
                              });
                            }}
                            disabled={isCurrentUser}
                            className="w-48 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                          >
                            {ROLE_OPTIONS.map(role => (
                              <option key={role} value={role}>
                                {APP_ROLE_LABELS[role]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={profile.region_bitrix_item_id || ''}
                            onChange={event => updateProfileRow(profile.user_id, getRegionPatch(event.target.value))}
                            className="w-52 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Без региона / отдела</option>
                            {sortedRegionOptions.map(region => (
                              <option key={region.bitrix_item_id} value={region.bitrix_item_id}>
                                {region.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={getQuestionnaireAccessForRole(profile.role, profile.questionnaire_access || 'own')}
                            onChange={event =>
                              updateProfileRow(profile.user_id, {
                                questionnaire_access: event.target.value as QuestionnaireAccessScope,
                              })
                            }
                            disabled={profile.role === 'admin'}
                            className="w-44 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-gray-100"
                          >
                            {QUESTIONNAIRE_ACCESS_OPTIONS.map(access => (
                              <option key={access} value={access}>
                                {QUESTIONNAIRE_ACCESS_LABELS[access]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={profile.is_active}
                              onChange={event => updateProfileRow(profile.user_id, { is_active: event.target.checked })}
                              disabled={isCurrentUser}
                            />
                            {profile.is_active ? 'Да' : 'Нет'}
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={profile.bitrix_user_id || ''}
                            onChange={event => updateProfileRow(profile.user_id, { bitrix_user_id: event.target.value || null })}
                            className="w-72 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Без привязки</option>
                            {employeeOptions.map(employee => (
                              <option key={employee.bitrix_user_id} value={employee.bitrix_user_id}>
                                {employee.full_name} {employee.active ? '' : '(неактивен)'}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              value={passwordDrafts[profile.user_id] || ''}
                              onChange={event =>
                                setPasswordDrafts(current => ({ ...current, [profile.user_id]: event.target.value }))
                              }
                              placeholder="Новый пароль"
                              className="w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => void updatePassword(profile.user_id)}
                              disabled={passwordSavingUserId === profile.user_id}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                              <KeyRound size={14} />
                              Сменить
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void saveProfile(profile)}
                            disabled={savingUserId === profile.user_id}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:opacity-60"
                          >
                            <Save size={14} />
                            Сохранить
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
