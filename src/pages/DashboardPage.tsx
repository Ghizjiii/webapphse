import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Link as LinkIcon, Copy, Power, PowerOff, Clock, CheckCircle2, Archive, RefreshCw, Trash2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { QuestionnaireLink, Company } from '../types';
import CreateLinkModal from '../components/CreateLinkModal';
import ConfirmModal from '../components/ConfirmModal';

interface QuestionnaireRow {
  questionnaire: QuestionnaireLink;
  company: Company | null;
  participantCount: number;
}

type ParticipantQuestionnaireRef = {
  questionnaire_id: string | null;
};

type DealQuestionnaireSyncRef = {
  questionnaire_id: string;
  sync_status: 'pending' | 'in_progress' | 'success' | 'error' | null;
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<QuestionnaireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
    const [companiesRes, participantsRes, dealsRes] = await Promise.all([
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
        .from('deals')
        .select('questionnaire_id, sync_status')
        .in('questionnaire_id', questionnaireIds),
    ]);

    if (companiesRes.error || participantsRes.error || dealsRes.error) {
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

    const dealSyncStatusByQuestionnaire = new Map<string, DealQuestionnaireSyncRef['sync_status']>();
    for (const deal of (dealsRes.data || []) as DealQuestionnaireSyncRef[]) {
      if (!deal.questionnaire_id) continue;
      dealSyncStatusByQuestionnaire.set(deal.questionnaire_id, deal.sync_status);
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
      };
    });

    setRows(result);
    setLoading(false);
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  function getFormUrl(token: string) {
    return `${window.location.origin}/form/${token}`;
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

  async function handleCreate(data: { title: string; expires_at: string | null }) {
    const { error } = await supabase.from('questionnaires').insert({
      title: data.title,
      expires_at: data.expires_at,
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left px-5 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Название / Компания</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Статус</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Сотрудников</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Создана</th>
                <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider">Срок</th>
                <th className="px-4 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ questionnaire: q, company, participantCount }) => {
                const cfg = STATUS_CONFIG[q.status] || STATUS_CONFIG.active;
                return (
                  <tr
                    key={q.id}
                    className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/dashboard/questionnaire/${q.id}`)}
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-900">{q.title || 'Без названия'}</div>
                      {company && <div className="text-gray-500 text-xs mt-0.5">{company.name}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.className}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-600">{participantCount}</td>
                    <td className="px-4 py-4 text-gray-500">{formatDate(q.created_at)}</td>
                    <td className="px-4 py-4 text-gray-500">
                      {q.expires_at ? (
                        <span className={new Date(q.expires_at) < new Date() ? 'text-red-500' : ''}>
                          {formatDate(q.expires_at)}
                        </span>
                      ) : <span className="text-gray-400">Бессрочно</span>}
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
