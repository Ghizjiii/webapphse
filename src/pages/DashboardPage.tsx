import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Link as LinkIcon, Copy, Power, PowerOff, Clock, CheckCircle2, Archive, RefreshCw, Trash2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { QuestionnaireLink, Company } from '../types';
import { APP_ROLE_LABELS, getProfileDisplayName, loadProfileDirectory, type ProfileDirectoryEntry } from '../lib/profileDirectory';
import { getPublicFormUrl } from '../lib/publicFormUrl';
import CreateLinkModal from '../components/CreateLinkModal';
import ConfirmModal from '../components/ConfirmModal';

interface QuestionnaireRow {
  questionnaire: QuestionnaireLink;
  company: Company | null;
  participantCount: number;
  requestCount: number;
  totalAmount: number;
  creatorProfile: ProfileDirectoryEntry | null;
}

type ParticipantQuestionnaireRef = {
  questionnaire_id: string | null;
};

type ParticipantCourseQuestionnaireRef = {
  questionnaire_id: string | null;
};

type DealQuestionnaireSyncRef = {
  questionnaire_id: string;
  sync_status: 'pending' | 'in_progress' | 'success' | 'error' | null;
};

type CertificateAmountRef = {
  questionnaire_id: string | null;
  price: number | string | null;
};

const STATUS_CONFIG = {
  active: { label: 'Активна', icon: <Power size={12} />, className: 'bg-green-50 text-green-700 border-green-200' },
  submitted: { label: 'Заполнена', icon: <CheckCircle2 size={12} />, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  archived: { label: 'Архив', icon: <Archive size={12} />, className: 'bg-gray-50 text-gray-600 border-gray-200' },
  synced: { label: 'В Битрикс', icon: <RefreshCw size={12} />, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  expired: { label: 'Истекла', icon: <Clock size={12} />, className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function hasMeaningfulCompanyData(company: Company): boolean {
  return Boolean(
    (company.name || '').trim() ||
    (company.phone || '').trim() ||
    (company.email || '').trim() ||
    (company.bin_iin || '').trim() ||
    (company.city || '').trim() ||
    (company.bitrix_company_id || '').trim()
  );
}

function resolveCompanyRecord(companies: Company[]): Company | null {
  return companies.find(hasMeaningfulCompanyData) || companies[0] || null;
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<QuestionnaireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | QuestionnaireLink['status']>('all');
  const [companySearch, setCompanySearch] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const currentUserId = user?.id || '';
  const currentUserEmail = user?.email || '';
  const currentProfileEmail = profile?.email || '';
  const currentProfileFullName = profile?.full_name || '';
  const currentProfileRole = profile?.role || null;

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: questionnaires, error } = await supabase
      .from('questionnaires')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      showToast('error', 'Ошибка загрузки данных');
      setLoading(false);
      return;
    }

    const questionnaireList = questionnaires || [];
    if (questionnaireList.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const questionnaireIds = questionnaireList.map(q => q.id);
    const creatorIds = Array.from(new Set(
      questionnaireList
        .map(q => String(q.created_by || '').trim())
        .filter(Boolean)
    ));

    const [companiesRes, participantsRes, participantCoursesRes, certificatesRes, dealsRes, creatorProfiles] = await Promise.all([
      supabase
        .from('companies')
        .select('*')
        .in('questionnaire_id', questionnaireIds)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('participants')
        .select('questionnaire_id')
        .in('questionnaire_id', questionnaireIds),
      supabase
        .from('participant_courses')
        .select('questionnaire_id')
        .in('questionnaire_id', questionnaireIds),
      supabase
        .from('certificates')
        .select('questionnaire_id, price')
        .in('questionnaire_id', questionnaireIds),
      supabase
        .from('deals')
        .select('questionnaire_id, sync_status')
        .in('questionnaire_id', questionnaireIds),
      loadProfileDirectory(creatorIds),
    ]);

    if (companiesRes.error || participantsRes.error || participantCoursesRes.error || certificatesRes.error || dealsRes.error) {
      showToast('error', 'Ошибка загрузки связанных данных');
      setLoading(false);
      return;
    }

    const companiesByQuestionnaire = new Map<string, Company[]>();
    for (const company of (companiesRes.data || []) as Company[]) {
      const list = companiesByQuestionnaire.get(company.questionnaire_id) || [];
      list.push(company);
      companiesByQuestionnaire.set(company.questionnaire_id, list);
    }

    const participantCountByQuestionnaire = new Map<string, number>();
    for (const participant of (participantsRes.data || []) as ParticipantQuestionnaireRef[]) {
      if (!participant.questionnaire_id) continue;
      participantCountByQuestionnaire.set(
        participant.questionnaire_id,
        (participantCountByQuestionnaire.get(participant.questionnaire_id) || 0) + 1
      );
    }

    const requestCountByQuestionnaire = new Map<string, number>();
    for (const course of (participantCoursesRes.data || []) as ParticipantCourseQuestionnaireRef[]) {
      if (!course.questionnaire_id) continue;
      requestCountByQuestionnaire.set(
        course.questionnaire_id,
        (requestCountByQuestionnaire.get(course.questionnaire_id) || 0) + 1
      );
    }

    const totalAmountByQuestionnaire = new Map<string, number>();
    for (const certificate of (certificatesRes.data || []) as CertificateAmountRef[]) {
      if (!certificate.questionnaire_id) continue;
      const parsedPrice = Number(certificate.price);
      if (!Number.isFinite(parsedPrice)) continue;

      totalAmountByQuestionnaire.set(
        certificate.questionnaire_id,
        (totalAmountByQuestionnaire.get(certificate.questionnaire_id) || 0) + parsedPrice
      );
    }

    const dealSyncStatusByQuestionnaire = new Map<string, DealQuestionnaireSyncRef['sync_status']>();
    for (const deal of (dealsRes.data || []) as DealQuestionnaireSyncRef[]) {
      if (!deal.questionnaire_id) continue;
      dealSyncStatusByQuestionnaire.set(deal.questionnaire_id, deal.sync_status);
    }

    const creatorByUserId = new Map<string, ProfileDirectoryEntry>();
    for (const creatorProfile of creatorProfiles) {
      creatorByUserId.set(creatorProfile.user_id, creatorProfile);
    }

    if (currentUserId && currentProfileRole && !creatorByUserId.has(currentUserId)) {
      creatorByUserId.set(currentUserId, {
        user_id: currentUserId,
        email: currentProfileEmail || currentUserEmail,
        full_name: currentProfileFullName,
        role: currentProfileRole,
      });
    }

    const result: QuestionnaireRow[] = questionnaireList.map(q => {
      const isExpired = q.expires_at && new Date(q.expires_at) < new Date();
      const syncStatus = dealSyncStatusByQuestionnaire.get(q.id);
      const status = isExpired && q.status === 'active'
        ? 'expired'
        : q.status === 'submitted' && syncStatus === 'success'
          ? 'synced'
          : q.status;

      return {
        questionnaire: { ...q, status },
        company: resolveCompanyRecord(companiesByQuestionnaire.get(q.id) || []),
        participantCount: participantCountByQuestionnaire.get(q.id) || 0,
        requestCount: requestCountByQuestionnaire.get(q.id) || 0,
        totalAmount: totalAmountByQuestionnaire.get(q.id) || 0,
        creatorProfile: q.created_by ? creatorByUserId.get(q.created_by) || null : null,
      };
    });

    setRows(result);
    setLoading(false);
  }, [currentProfileEmail, currentProfileFullName, currentProfileRole, currentUserEmail, currentUserId, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [companySearch, ownershipFilter, pageSize, statusFilter]);

  const normalizedCompanySearch = companySearch.trim().toLowerCase();
  const filteredRows = useMemo(
    () => rows.filter(({ questionnaire, company }) => {
      if (ownershipFilter === 'mine' && questionnaire.created_by !== currentUserId) {
        return false;
      }

      if (statusFilter !== 'all' && questionnaire.status !== statusFilter) {
        return false;
      }

      if (normalizedCompanySearch) {
        const companyName = String(company?.name || '').trim().toLowerCase();
        if (!companyName.includes(normalizedCompanySearch)) {
          return false;
        }
      }

      return true;
    }),
    [currentUserId, normalizedCompanySearch, ownershipFilter, rows, statusFilter],
  );

  useEffect(() => {
    const nextTotalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    if (currentPage > nextTotalPages) {
      setCurrentPage(nextTotalPages);
    }
  }, [filteredRows.length, pageSize, currentPage]);

  function getFormUrl(token: string) {
    return getPublicFormUrl(token);
  }

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(getFormUrl(token));
    showToast('success', 'Ссылка скопирована');
  }

  async function toggleActive(q: QuestionnaireLink) {
    const newActive = !q.is_active;
    await supabase.from('questionnaires').update({ is_active: newActive }).eq('id', q.id);
    showToast('success', newActive ? 'Ссылка активирована' : 'Ссылка деактивирована');
    loadData();
  }

  async function deleteQuestionnaire(id: string) {
    await supabase.from('questionnaires').delete().eq('id', id);
    showToast('success', 'Анкета удалена');
    setDeleteTarget(null);
    loadData();
  }

  function formatDate(str: string | null) {
    if (!str) return '—';
    return new Date(str).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatTime(str: string | null) {
    if (!str) return '—';
    return new Date(str).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function formatMoney(value: number) {
    return `${value.toLocaleString('ru-RU')} ₸`;
  }

  const hasActiveFilters = ownershipFilter !== 'all' || statusFilter !== 'all' || companySearch.trim() !== '';
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRows, currentPage, pageSize],
  );
  const paginationStart = filteredRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const paginationEnd = Math.min(currentPage * pageSize, filteredRows.length);

  function resetFilters() {
    setOwnershipFilter('all');
    setStatusFilter('all');
    setCompanySearch('');
  }

  function renderPaginationControls(borderClassName: string) {
    return (
      <div className={`flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between ${borderClassName}`}>
        <div className="text-sm text-gray-500">
          {hasActiveFilters && (
            <div className="mb-1 text-xs text-blue-600">После фильтрации: {filteredRows.length}</div>
          )}
          Показано {paginationStart}-{paginationEnd} из {rows.length}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <span>На странице</span>
            <select
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {[20, 50, 100].map(size => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Назад
            </button>
            <div className="text-sm text-gray-600">
              {currentPage} / {totalPages}
            </div>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Вперед
            </button>
          </div>
        </div>
      </div>
    );
  }

  async function handleCreate(data: { title: string; expires_at: string | null; payment_order_optional: boolean }) {
    const { error } = await supabase.from('questionnaires').insert({
      title: data.title,
      expires_at: data.expires_at,
      payment_order_optional: data.payment_order_optional,
      is_active: true,
      status: 'active',
      created_by: user?.id,
    });
    if (error) { showToast('error', 'Ошибка создания анкеты'); return; }
    showToast('success', 'Анкета создана');
    setShowCreateModal(false);
    loadData();
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Анкеты' }]}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Анкеты клиентов</h1>
          <p className="text-sm text-gray-500 mt-0.5">Управление ссылками для сбора данных</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
        >
          <Plus size={16} />
          Создать анкету
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-16 text-center">
            <LinkIcon size={40} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Нет анкет</p>
            <p className="text-gray-400 text-sm mt-1">Создайте первую анкету для клиента</p>
          </div>
        ) : (
          <>
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                  <span>Показывать</span>
                  <select
                    value={ownershipFilter}
                    onChange={(event) => setOwnershipFilter(event.target.value as 'all' | 'mine')}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">Все анкеты</option>
                    <option value="mine">Только мои</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                  <span>Статус</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as 'all' | QuestionnaireLink['status'])}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="all">Все статусы</option>
                    {Object.entries(STATUS_CONFIG).map(([statusKey, statusConfig]) => (
                      <option key={statusKey} value={statusKey}>
                        {statusConfig.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                  <span>Компания</span>
                  <input
                    value={companySearch}
                    onChange={(event) => setCompanySearch(event.target.value)}
                    placeholder="Поиск по названию компании"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600"
                >
                  Сбросить фильтры
                </button>
              )}
            </div>
          </div>
          {renderPaginationControls('border-b border-gray-100')}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider w-16">№</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Заявка / Название компании</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Статус</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Сотрудников</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Заявок</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Общая сумма</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Создана</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Срок</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Ответственный</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">
                    По выбранным фильтрам анкеты не найдены.
                  </td>
                </tr>
              ) : pagedRows.map(({ questionnaire: q, company, participantCount, requestCount, totalAmount, creatorProfile }, index) => {
                const cfg = STATUS_CONFIG[q.status] || STATUS_CONFIG.active;
                const rowNumber = (currentPage - 1) * pageSize + index + 1;
                const responsibleRole = creatorProfile?.role || (q.created_by === currentUserId ? currentProfileRole : null);
                const responsibleName = getProfileDisplayName(
                  creatorProfile,
                  q.created_by === currentUserId ? (currentProfileEmail || currentUserEmail) : ''
                );
                return (
                  <tr
                    key={q.id}
                    className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/dashboard/questionnaire/${q.id}`)}
                  >
                    <td className="px-5 py-4 text-gray-400 font-medium align-top">{rowNumber}</td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">{q.title || 'Без названия'}</div>
                      {company && <div className="text-gray-500 text-xs mt-0.5">{company.name}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.className}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{participantCount}</td>
                    <td className="px-4 py-4 text-gray-600">{requestCount}</td>
                    <td className="px-4 py-4">
                      {totalAmount > 0 ? (
                        <span className="font-medium text-gray-900 whitespace-nowrap">{formatMoney(totalAmount)}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-gray-500">
                      <div>{formatDate(q.created_at)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{formatTime(q.created_at)}</div>
                    </td>
                    <td className="px-4 py-4 text-gray-500">
                      {q.expires_at ? (
                        <span className={new Date(q.expires_at) < new Date() ? 'text-red-500' : ''}>
                          {formatDate(q.expires_at)}
                        </span>
                      ) : <span className="text-gray-400">Бессрочно</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-gray-900">{responsibleName}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {responsibleRole ? APP_ROLE_LABELS[responsibleRole] : 'Не указан'}
                      </div>
                    </td>
                    <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => copyLink(q.secret_token)}
                          title="Копировать ссылку"
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          onClick={() => toggleActive(q)}
                          title={q.is_active ? 'Деактивировать' : 'Активировать'}
                          className={`p-1.5 rounded-lg transition-all ${q.is_active ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                        >
                          {q.is_active ? <PowerOff size={15} /> : <Power size={15} />}
                        </button>
                        <button
                          onClick={() => setDeleteTarget(q.id)}
                          title="Удалить"
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {renderPaginationControls('border-t border-gray-100')}
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateLinkModal onClose={() => setShowCreateModal(false)} onCreate={handleCreate} />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Удалить анкету?"
          message="Все данные компании, сотрудников и документы будут удалены. Это действие необратимо."
          confirmLabel="Удалить"
          danger
          onConfirm={() => deleteQuestionnaire(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </DashboardLayout>
  );
}
