import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RefreshCw, ExternalLink, Building2, Users, FileText, Copy, Power, PowerOff, Clock } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import ParticipantsTable from '../components/ParticipantsTable';
import CertificatesTable from '../components/CertificatesTable';
import BitrixSyncModal from '../components/BitrixSyncModal';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { fetchCoursesList } from '../lib/bitrix';
import type { QuestionnaireLink, Company, Deal, Participant, Certificate } from '../types';

type Tab = 'participants' | 'certificates';

export default function QuestionnairePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireLink | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [availableCourses, setAvailableCourses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('participants');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [companyEditing, setCompanyEditing] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<Partial<Company>>({});
  const [savingCompany, setSavingCompany] = useState(false);
  const [linkEditing, setLinkEditing] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;

    const [qRes, cRes, dRes] = await Promise.all([
      supabase.from('questionnaires').select('*').eq('id', id).maybeSingle(),
      supabase.from('companies').select('*').eq('questionnaire_id', id).maybeSingle(),
      supabase.from('deals').select('*').eq('questionnaire_id', id).maybeSingle(),
    ]);

    if (qRes.error || !qRes.data) { navigate('/dashboard'); return; }

    setQuestionnaire(qRes.data);
    setCompany(cRes.data);
    setDeal(dRes.data);

    const { data: partData } = await supabase
      .from('participants')
      .select('*')
      .eq('questionnaire_id', id)
      .order('sort_order', { ascending: true });

    const { data: coursesData } = await supabase
      .from('participant_courses')
      .select('*')
      .eq('questionnaire_id', id);

    const participantsWithCourses = (partData || []).map(p => ({
      ...p,
      courses: (coursesData || []).filter(c => c.participant_id === p.id),
    }));
    setParticipants(participantsWithCourses);

    const { data: certData } = await supabase
      .from('certificates')
      .select('*')
      .eq('questionnaire_id', id)
      .order('created_at', { ascending: false });
    setCertificates(certData || []);

    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    loadData();
    supabase.from('ref_courses').select('name').order('sort_order').order('name').then(({ data }) => {
      if (data && data.length > 0) {
        setAvailableCourses(data.map((r: { name: string }) => r.name));
      } else {
        fetchCoursesList().then(setAvailableCourses);
      }
    });
  }, [loadData]);

  async function saveCompany() {
    if (!company) return;
    setSavingCompany(true);
    const { error } = await supabase.from('companies').update({
      ...companyDraft,
      updated_at: new Date().toISOString(),
    }).eq('id', company.id);
    if (error) { showToast('error', 'Ошибка сохранения'); }
    else { showToast('success', 'Данные компании сохранены'); }
    setSavingCompany(false);
    setCompanyEditing(false);
    loadData();
  }

  async function createCompanyRecord() {
    if (!id) return;
    const { error } = await supabase.from('companies').insert({
      questionnaire_id: id,
      name: '',
      phone: '',
      email: '',
      bin_iin: '',
      city: '',
    });
    if (error) { showToast('error', 'Ошибка создания'); return; }
    loadData();
  }

  async function toggleActive() {
    if (!questionnaire) return;
    await supabase.from('questionnaires').update({ is_active: !questionnaire.is_active }).eq('id', questionnaire.id);
    showToast('success', questionnaire.is_active ? 'Ссылка деактивирована' : 'Ссылка активирована');
    loadData();
  }

  async function saveExpiry() {
    if (!questionnaire) return;
    const expires_at = expiryDraft ? new Date(expiryDraft + 'T23:59:59').toISOString() : null;
    await supabase.from('questionnaires').update({ expires_at }).eq('id', questionnaire.id);
    showToast('success', 'Срок действия обновлён');
    setLinkEditing(false);
    loadData();
  }

  function getFormUrl() {
    return `${window.location.origin}/form/${questionnaire?.secret_token}`;
  }

  async function copyFormUrl() {
    await navigator.clipboard.writeText(getFormUrl());
    showToast('success', 'Ссылка скопирована');
  }

  if (loading) {
    return (
      <DashboardLayout breadcrumbs={[{ label: 'Анкеты', to: '/dashboard' }, { label: '...' }]}>
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!questionnaire) return null;

  const isExpired = questionnaire.expires_at && new Date(questionnaire.expires_at) < new Date();

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: 'Анкеты', to: '/dashboard' },
        { label: questionnaire.title || 'Без названия' },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{questionnaire.title || 'Без названия'}</h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                questionnaire.is_active && !isExpired
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-gray-50 text-gray-500 border-gray-200'
              }`}>
                {questionnaire.is_active && !isExpired ? 'Активна' : 'Неактивна'}
              </span>
              {questionnaire.expires_at && (
                <span className={`text-xs flex items-center gap-1 ${isExpired ? 'text-red-500' : 'text-gray-500'}`}>
                  <Clock size={12} /> Срок: {new Date(questionnaire.expires_at).toLocaleDateString('ru-RU')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            <button
              onClick={copyFormUrl}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-all"
            >
              <Copy size={14} /> Скопировать ссылку
            </button>
            <button
              onClick={() => window.open(getFormUrl(), '_blank')}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-all"
            >
              <ExternalLink size={14} /> Открыть форму
            </button>
            <button
              onClick={toggleActive}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                questionnaire.is_active
                  ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
              }`}
            >
              {questionnaire.is_active ? <><PowerOff size={14} /> Деактивировать</> : <><Power size={14} /> Активировать</>}
            </button>
            {deal?.bitrix_deal_id && deal?.deal_url && (
              <a
                href={deal.deal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-all"
              >
                <ExternalLink size={14} /> Сделка #{deal.bitrix_deal_id}
              </a>
            )}
            {company && participants.length > 0 && (
              <button
                onClick={() => setShowSyncModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
              >
                {deal?.bitrix_deal_id ? <><RefreshCw size={14} /> Обновить в Битрикс24</> : <><RefreshCw size={14} /> Отправить в Битрикс24</>}
              </button>
            )}
          </div>
        </div>

        {/* Link management */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide flex items-center gap-2">
              <Clock size={15} className="text-gray-400" /> Управление ссылкой
            </h2>
            <button onClick={() => { setLinkEditing(p => !p); setExpiryDraft(questionnaire.expires_at?.split('T')[0] || ''); }}
              className="text-xs text-blue-600 hover:underline"
            >
              {linkEditing ? 'Отмена' : 'Изменить срок'}
            </button>
          </div>
          {linkEditing ? (
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={expiryDraft}
                onChange={e => setExpiryDraft(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button onClick={saveExpiry} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all">
                Сохранить
              </button>
              <button onClick={() => { if (questionnaire) { supabase.from('questionnaires').update({ expires_at: null }).eq('id', questionnaire.id).then(() => { setLinkEditing(false); loadData(); }); } }}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-all"
              >
                Снять срок
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <input
                readOnly
                value={getFormUrl()}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-gray-600 bg-gray-50 text-xs font-mono"
              />
              <button onClick={copyFormUrl} className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all">
                <Copy size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Deal info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide flex items-center gap-2">
              <FileText size={15} className="text-gray-400" /> Сделка в Битрикс24
            </h2>
            {deal?.deal_url && (
              <a
                href={deal.deal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-sm font-medium transition-all"
              >
                <ExternalLink size={13} /> Открыть в Битрикс24
              </a>
            )}
          </div>
          {deal?.bitrix_deal_id ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">ID сделки</div>
                <div className="font-semibold text-gray-900">#{deal.bitrix_deal_id}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">ID компании</div>
                <div className="font-medium text-gray-900">{deal.bitrix_company_id || '—'}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-gray-500 mb-0.5">Название сделки</div>
                <div className="font-medium text-gray-900">{deal.deal_title || '—'}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">
              Сделка ещё не создана в Битрикс24. Нажмите «Отправить в Битрикс24» чтобы создать.
            </div>
          )}
        </div>

        {/* Company info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide flex items-center gap-2">
              <Building2 size={15} className="text-gray-400" /> Информация о компании
            </h2>
            <div className="flex items-center gap-2">
              {deal?.deal_url && (
                <a
                  href={deal.deal_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Открыть сделку в Битрикс24"
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-gray-200"
                >
                  <ExternalLink size={15} />
                </a>
              )}
              {company ? (
                <button
                  onClick={() => {
                    if (companyEditing) { saveCompany(); }
                    else { setCompanyDraft({ ...company }); setCompanyEditing(true); }
                  }}
                  disabled={savingCompany}
                  className={`text-sm font-medium transition-all px-3 py-1.5 rounded-lg ${
                    companyEditing
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {savingCompany ? 'Сохраняем...' : companyEditing ? 'Сохранить' : 'Редактировать'}
                </button>
              ) : (
                <button onClick={createCompanyRecord} className="text-sm font-medium text-blue-600 hover:underline">
                  Добавить компанию
                </button>
              )}
            </div>
          </div>

          {company ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { key: 'name', label: 'Название компании' },
                { key: 'phone', label: 'Телефон' },
                { key: 'email', label: 'Email' },
                { key: 'bin_iin', label: 'БИН/ИИН' },
                { key: 'city', label: 'Город' },
                { key: 'bitrix_company_id', label: 'ID компании в Битрикс' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <div className="text-xs text-gray-500 mb-1">{label}</div>
                  {companyEditing ? (
                    <input
                      value={String((companyDraft as Record<string, unknown>)[key] ?? '')}
                      onChange={e => setCompanyDraft(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  ) : (
                    <div className="text-sm font-medium text-gray-900">
                      {String((company as Record<string, unknown>)[key] || '—')}
                    </div>
                  )}
                </div>
              ))}
              {deal?.bitrix_deal_id && (
                <div>
                  <div className="text-xs text-gray-500 mb-1">ID сделки в Битрикс</div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-gray-900">#{deal.bitrix_deal_id}</div>
                    {deal.deal_url && (
                      <a
                        href={deal.deal_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-700 transition-colors"
                        title="Открыть сделку"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-400 py-2">Клиент ещё не заполнил форму</div>
          )}
        </div>

        {/* Tabs */}
        <div>
          <div className="flex gap-1 border-b border-gray-200 mb-5">
            {([
              { key: 'participants', label: 'Сотрудники', icon: <Users size={15} />, count: participants.length },
              { key: 'certificates', label: 'Удостоверения и сертификаты', icon: <FileText size={15} />, count: certificates.length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${
                  tab === t.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.icon} {t.label}
                <span className={`px-2 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {tab === 'participants' && (
            <ParticipantsTable
              questionnaireId={id!}
              companyId={company?.id || null}
              participants={participants}
              availableCourses={availableCourses}
              onRefresh={loadData}
            />
          )}
          {tab === 'certificates' && (
            <CertificatesTable
              questionnaireId={id!}
              dealId={deal?.id || null}
              companyId={company?.id || null}
              certificates={certificates}
              onRefresh={loadData}
            />
          )}
        </div>
      </div>

      {showSyncModal && company && (
        <BitrixSyncModal
          questionnaireId={id!}
          company={company}
          participants={participants}
          dealId={deal?.id || null}
          existingDeal={deal}
          onClose={() => setShowSyncModal(false)}
          onDone={() => { setShowSyncModal(false); loadData(); }}
        />
      )}
    </DashboardLayout>
  );
}
