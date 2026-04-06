import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { uploadPaymentOrder } from '../lib/cloudinary';
import { RefreshCw, ExternalLink, Building2, Users, FileText, Copy, Power, PowerOff, Clock, Pencil, Check, X, Link2 } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import ParticipantsTable from '../components/ParticipantsTable';
import CertificatesTable from '../components/CertificatesTable';
import CourseCostSummaryTable from '../components/CourseCostSummaryTable';
import ProtocolsTable from '../components/ProtocolsTable';
import PrintedDocumentsTable from '../components/PrintedDocumentsTable';
import BitrixSyncModal from '../components/BitrixSyncModal';
import { supabase } from '../lib/supabase';
import { buildCourseCostSummarySet } from '../lib/courseCostSummary';
import { buildProtocolDraftRows, reconcileProtocolsFromCertificates } from '../lib/protocolGeneration';
import { getPublicFormUrl } from '../lib/publicFormUrl';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { fetchCoursesList } from '../lib/bitrix';
import type { QuestionnaireLink, Company, Deal, Participant, Certificate, GeneratedDocument, Protocol } from '../types';
import { APP_ROLE_LABELS, getProfileDisplayName, loadProfileDirectory, type ProfileDirectoryEntry } from '../lib/profileDirectory';

type Tab = 'participants' | 'certificates' | 'course_costs' | 'protocols' | 'printed_documents';

function getRecordValue(record: unknown, key: string): string {
  return String((record as Record<string, unknown>)[key] ?? '');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalizeAmountInput(value: string): number | null {
  const normalized = String(value || '').replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function TopSectionCard({
  icon,
  title,
  description,
  actions,
  children,
  className = '',
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm ${className}`.trim()}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-5 text-gray-900">{title}</h2>
            <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2 justify-end">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

function SummaryBadge({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white/90 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function CompactField({
  label,
  children,
  className = '',
  valueClassName = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-slate-50/80 px-3 py-2.5 ${className}`.trim()}>
      <div className="text-[11px] leading-4 text-gray-500">{label}</div>
      <div className={`mt-1.5 text-sm font-medium leading-5 text-gray-900 ${valueClassName}`.trim()}>
        {children}
      </div>
    </div>
  );
}

export default function QuestionnairePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, profile } = useAuth();
  const currentUserId = user?.id || '';
  const currentUserEmail = user?.email || '';
  const currentProfileEmail = profile?.email || '';
  const currentProfileFullName = profile?.full_name || '';
  const currentProfileRole = profile?.role || null;

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireLink | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<ProfileDirectoryEntry | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [generatedDocuments, setGeneratedDocuments] = useState<GeneratedDocument[]>([]);
  const [availableCourses, setAvailableCourses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('participants');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [companyEditing, setCompanyEditing] = useState(false);
  const [companyDraft, setCompanyDraft] = useState<Partial<Company>>({});
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingPaymentStatus, setSavingPaymentStatus] = useState(false);
  const [uploadingPaymentOrder, setUploadingPaymentOrder] = useState(false);
  const [linkEditing, setLinkEditing] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState('');
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const paymentOrderInputRef = useRef<HTMLInputElement | null>(null);
  const courseCostSummaries = buildCourseCostSummarySet(certificates);

  const loadData = useCallback(async () => {
    if (!id) return;

    const [qRes, companiesRes, dealsRes] = await Promise.all([
      supabase.from('questionnaires').select('*').eq('id', id).maybeSingle(),
      supabase.from('companies').select('*').eq('questionnaire_id', id).order('updated_at', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('deals').select('*').eq('questionnaire_id', id).order('updated_at', { ascending: false }).order('created_at', { ascending: false }),
    ]);

    if (qRes.error || !qRes.data) {
      setCreatorProfile(null);
      navigate('/dashboard');
      return;
    }

    let nextCreatorProfile: ProfileDirectoryEntry | null = null;
    const creatorId = String(qRes.data.created_by || '').trim();
    if (creatorId) {
      const creatorProfiles = await loadProfileDirectory([creatorId]);
      nextCreatorProfile = creatorProfiles[0] || null;
    }

    if (!nextCreatorProfile && creatorId && creatorId === currentUserId && currentProfileRole) {
      nextCreatorProfile = {
        user_id: currentUserId,
        email: currentProfileEmail || currentUserEmail,
        full_name: currentProfileFullName,
        role: currentProfileRole,
      };
    }

    const companyRows = companiesRes.data || [];
    const dealRows = dealsRes.data || [];

    const resolvedCompany =
      companyRows.find((c: Company) =>
        Boolean((c.name || '').trim()) ||
        Boolean((c.phone || '').trim()) ||
        Boolean((c.email || '').trim()) ||
        Boolean((c.bin_iin || '').trim()) ||
        Boolean((c.city || '').trim()) ||
        Boolean((c.bitrix_company_id || '').trim())
      ) ||
      companyRows[0] ||
      null;

    const resolvedDeal = dealRows.find((d: Deal) => !!d.bitrix_deal_id) || dealRows[0] || null;
    const resolvedDealWithUrl = resolvedDeal?.bitrix_deal_id
      ? {
          ...resolvedDeal,
          deal_url: resolvedDeal.deal_url || `https://hsecompany.bitrix24.kz/crm/deal/details/${resolvedDeal.bitrix_deal_id}/`,
        }
      : resolvedDeal;

    setQuestionnaire(qRes.data);
    setCreatorProfile(nextCreatorProfile);
    setCompany(resolvedCompany);
    setDeal(resolvedDealWithUrl);

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
    const resolvedCertificates = certData || [];
    setCertificates(resolvedCertificates);

    const { data: rawProtocols } = await supabase
      .from('protocols')
      .select('*')
      .eq('questionnaire_id', id)
      .order('course_name')
      .order('category_label');

    const draftProtocols = buildProtocolDraftRows({
      questionnaireId: id,
      dealId: resolvedDealWithUrl?.id || null,
      companyId: resolvedCompany?.id || null,
      certificates: resolvedCertificates,
      storedProtocols: (rawProtocols || []) as Protocol[],
    });
    setProtocols(draftProtocols);

    try {
      const reconciled = await reconcileProtocolsFromCertificates({
        questionnaireId: id,
        dealId: resolvedDealWithUrl?.id || null,
        companyId: resolvedCompany?.id || null,
        certificates: resolvedCertificates,
      });
      setProtocols(reconciled.protocols);
      setCertificates(reconciled.certificates);
    } catch (error) {
      console.warn('Protocol reconcile fallback', error);
    }

    const { data: docsData } = await supabase
      .from('generated_documents')
      .select('*')
      .eq('questionnaire_id', id)
      .order('generated_at', { ascending: false });
    setGeneratedDocuments(docsData || []);

    setLoading(false);
  }, [currentProfileEmail, currentProfileFullName, currentProfileRole, currentUserEmail, currentUserId, id, navigate]);

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

  useEffect(() => {
    if (!titleEditing) {
      setTitleDraft(questionnaire?.title || '');
    }
  }, [questionnaire?.title, titleEditing]);

  async function saveCompany() {
    if (!company) return;
    setSavingCompany(true);
    const { error } = await supabase.from('companies').update({
      ...companyDraft,
      updated_at: new Date().toISOString(),
    }).eq('id', company.id);
    if (error) showToast('error', 'Ошибка сохранения');
    else showToast('success', 'Данные компании сохранены');
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
    if (error) {
      showToast('error', 'Ошибка создания');
      return;
    }
    loadData();
  }

  async function handleAdminPaymentOrderSelect(file: File) {
    setUploadingPaymentOrder(true);
    try {
      const uploaded = await uploadPaymentOrder(file);
      setCompanyDraft(prev => ({
        ...prev,
        payment_order_url: uploaded.secure_url,
        payment_order_name: file.name,
        payment_order_storage_bucket: uploaded.storage_bucket || '',
        payment_order_storage_path: uploaded.storage_path || '',
        payment_order_uploaded_at: new Date().toISOString(),
      }));
      showToast('success', 'Платежное поручение загружено');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить платежное поручение';
      showToast('error', message);
    } finally {
      setUploadingPaymentOrder(false);
      if (paymentOrderInputRef.current) paymentOrderInputRef.current.value = '';
    }
  }

  function clearPaymentOrderDraft() {
    setCompanyDraft(prev => ({
      ...prev,
      payment_order_url: '',
      payment_order_name: '',
      payment_order_storage_bucket: '',
      payment_order_storage_path: '',
      payment_order_uploaded_at: null,
      payment_order_number: '',
      payment_order_date: null,
      payment_order_amount: null,
      payment_is_paid: false,
    }));
  }

  async function togglePaymentStatus(nextValue: boolean) {
    if (!company) return;
    setSavingPaymentStatus(true);
    const { error } = await supabase
      .from('companies')
      .update({
        payment_is_paid: nextValue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', company.id);

    if (error) {
      showToast('error', 'Не удалось обновить статус оплаты');
      setSavingPaymentStatus(false);
      return;
    }

    setCompany(prev => (prev ? { ...prev, payment_is_paid: nextValue } : prev));
    showToast('success', nextValue ? 'Статус оплаты: оплачено' : 'Статус оплаты: не оплачено');
    setSavingPaymentStatus(false);
  }

  async function toggleActive() {
    if (!questionnaire) return;
    await supabase.from('questionnaires').update({ is_active: !questionnaire.is_active }).eq('id', questionnaire.id);
    showToast('success', questionnaire.is_active ? 'Ссылка деактивирована' : 'Ссылка активирована');
    loadData();
  }

  async function saveQuestionnaireTitle() {
    if (!questionnaire) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      showToast('warning', 'Введите название анкеты');
      return;
    }

    setSavingTitle(true);
    const updatedAt = new Date().toISOString();
    const { error } = await supabase
      .from('questionnaires')
      .update({
        title: nextTitle,
        updated_at: updatedAt,
      })
      .eq('id', questionnaire.id);

    if (error) {
      showToast('error', 'Не удалось сохранить название анкеты');
      setSavingTitle(false);
      return;
    }

    setQuestionnaire(prev => (prev ? { ...prev, title: nextTitle, updated_at: updatedAt } : prev));
    setTitleEditing(false);
    setSavingTitle(false);
    showToast('success', 'Название анкеты сохранено');
  }

  async function saveExpiry() {
    if (!questionnaire) return;
    const expires_at = expiryDraft ? new Date(expiryDraft + 'T23:59:59').toISOString() : null;
    await supabase.from('questionnaires').update({ expires_at }).eq('id', questionnaire.id);
    showToast('success', 'Срок действия обновлен');
    setLinkEditing(false);
    loadData();
  }

  async function clearExpiry() {
    if (!questionnaire) return;
    await supabase.from('questionnaires').update({ expires_at: null }).eq('id', questionnaire.id);
    showToast('success', 'Срок действия снят');
    setLinkEditing(false);
    loadData();
  }

  function getFormUrl() {
    return getPublicFormUrl(questionnaire?.secret_token);
  }

  async function copyFormUrl() {
    await navigator.clipboard.writeText(getFormUrl());
    showToast('success', 'Ссылка скопирована');
  }

  function startCompanyEditing() {
    if (!company) return;
    setCompanyDraft({ ...company });
    setCompanyEditing(true);
  }

  function cancelCompanyEditing() {
    setCompanyEditing(false);
    setCompanyDraft({});
  }

  function renderCompanyActions(editLabel = 'Редактировать') {
    if (company) {
      if (companyEditing) {
        return (
          <>
            <button
              type="button"
              onClick={() => void saveCompany()}
              disabled={savingCompany}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:opacity-60"
            >
              <Check size={14} />
              {savingCompany ? 'Сохраняем...' : 'Сохранить'}
            </button>
            <button
              type="button"
              onClick={cancelCompanyEditing}
              disabled={savingCompany}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-60"
            >
              <X size={14} />
              Отмена
            </button>
          </>
        );
      }

      return (
        <button
          type="button"
          onClick={startCompanyEditing}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
        >
          <Pencil size={14} />
          {editLabel}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={createCompanyRecord}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
      >
        <Building2 size={14} />
        Добавить компанию
      </button>
    );
  }

  const secondaryButtonClass =
    'inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50';

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
  const uniqueCoursesCount = new Set(
    participants.flatMap(participant => (participant.courses || []).map(course => String(course.course_name || '').trim()).filter(Boolean))
  ).size;
  const totalCourseRequests = participants.reduce((sum, participant) => sum + (participant.courses?.length || 0), 0);
  const canSyncToBitrix = Boolean(company && participants.length > 0);
  const responsibleRole = creatorProfile?.role || (questionnaire.created_by === currentUserId ? currentProfileRole : null);
  const responsibleName = getProfileDisplayName(
    creatorProfile,
    questionnaire.created_by === currentUserId ? (currentProfileEmail || currentUserEmail) : ''
  );
  const paymentSource = companyEditing ? companyDraft : company;
  const paymentOrderUrl = String(paymentSource?.payment_order_url || '').trim();
  const paymentOrderName = String(paymentSource?.payment_order_name || '').trim();
  const paymentOrderNumber = String(paymentSource?.payment_order_number || '').trim();
  const paymentOrderDate = String(paymentSource?.payment_order_date || '').trim();
  const paymentOrderAmount = paymentSource?.payment_order_amount ?? null;
  const paymentUploadedAt = String(paymentSource?.payment_order_uploaded_at || '').trim();
  const paymentIsPaid = Boolean(paymentSource?.payment_is_paid);

  return (
    <DashboardLayout
      breadcrumbs={[
        { label: 'Анкеты', to: '/dashboard' },
        { label: questionnaire.title || 'Без названия' },
      ]}
    >
      <div className="min-w-0 space-y-3">
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-slate-50 p-4 shadow-sm">
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.95fr)]">
            <div className="min-w-0 space-y-3">
              {titleEditing ? (
                <div className="flex flex-wrap items-start gap-2">
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={event => setTitleDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') void saveQuestionnaireTitle();
                      if (event.key === 'Escape') {
                        setTitleEditing(false);
                        setTitleDraft(questionnaire.title || '');
                      }
                    }}
                    placeholder="Название анкеты"
                    className="min-w-[280px] flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-2xl font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <button
                    type="button"
                    onClick={() => void saveQuestionnaireTitle()}
                    disabled={savingTitle}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Check size={15} />
                    {savingTitle ? 'Сохраняем...' : 'Сохранить'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTitleEditing(false);
                      setTitleDraft(questionnaire.title || '');
                    }}
                    disabled={savingTitle}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-60"
                  >
                    <X size={15} />
                    Отмена
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start gap-3">
                    <h1 className="max-w-3xl break-words text-[30px] font-bold tracking-tight text-gray-900">
                      {questionnaire.title || 'Без названия'}
                    </h1>
                    <button
                      type="button"
                      onClick={() => {
                        setTitleDraft(questionnaire.title || '');
                        setTitleEditing(true);
                      }}
                      className={`${secondaryButtonClass} shrink-0 self-start`}
                    >
                      <Pencil size={14} />
                      Изменить название
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-gray-500">
                    Короткая сводка по анкете: статус, ссылка, сделка Bitrix24 и данные клиента.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  questionnaire.is_active && !isExpired
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-gray-200 bg-gray-50 text-gray-500'
                }`}>
                  {questionnaire.is_active && !isExpired ? 'Активна' : 'Неактивна'}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  questionnaire.payment_order_optional
                    ? 'border-slate-200 bg-slate-50 text-slate-700'
                    : 'border-blue-200 bg-blue-50 text-blue-700'
                }`}>
                  {questionnaire.payment_order_optional ? 'Платежка не обязательна' : 'Платежка обязательна'}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  questionnaire.submitted_at
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                }`}>
                  {questionnaire.submitted_at ? 'Заполнена клиентом' : 'Ожидает заполнения'}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                  questionnaire.expires_at
                    ? isExpired
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}>
                  <Clock size={12} />
                  {questionnaire.expires_at ? `Срок: ${formatDate(questionnaire.expires_at)}` : 'Без срока'}
                </span>
              </div>

              <div className="grid max-w-3xl gap-2 sm:grid-cols-3">
                <SummaryBadge label="Сотрудники" value={participants.length} />
                <SummaryBadge label="Курсы" value={uniqueCoursesCount} />
                <SummaryBadge label="Заявки" value={totalCourseRequests} />
              </div>

              {!canSyncToBitrix && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Чтобы отправить анкету в Bitrix24, заполните компанию и добавьте хотя бы одного сотрудника.
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-3 xl:items-end">
              <div className="flex w-full min-w-0 flex-col gap-3 xl:max-w-[370px]">
                <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap xl:justify-end">
                  <button
                    onClick={toggleActive}
                    className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-medium transition-all ${
                      questionnaire.is_active
                        ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {questionnaire.is_active ? <><PowerOff size={14} /> Деактивировать</> : <><Power size={14} /> Активировать</>}
                  </button>
                  {canSyncToBitrix && (
                    <button
                      onClick={() => setShowSyncModal(true)}
                      className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-blue-700"
                    >
                      {deal?.bitrix_deal_id ? <><RefreshCw size={14} /> Обновить в Битрикс24</> : <><RefreshCw size={14} /> Отправить в Битрикс24</>}
                    </button>
                  )}
                </div>

                <div className="rounded-2xl border border-blue-100 bg-gradient-to-l from-blue-100/70 via-blue-50 to-white px-4 py-3 text-center shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-600">Ответственный</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{responsibleName}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {responsibleRole ? APP_ROLE_LABELS[responsibleRole] : 'Не указан'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 xl:grid-cols-2">
          <TopSectionCard
            icon={<Link2 size={18} />}
            title="Управление ссылкой"
            description="Публичная форма и статус заполнения"
            className="h-full"
            actions={linkEditing ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveExpiry()}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-all hover:bg-blue-700"
                >
                  <Check size={14} />
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLinkEditing(false);
                    setExpiryDraft(questionnaire.expires_at?.split('T')[0] || '');
                  }}
                  className={secondaryButtonClass}
                >
                  <X size={14} />
                  Отмена
                </button>
                <button type="button" onClick={() => void clearExpiry()} className={secondaryButtonClass}>
                  Снять срок
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={copyFormUrl} className={secondaryButtonClass}>
                  <Copy size={14} />
                  Скопировать
                </button>
                <button
                  type="button"
                  onClick={() => window.open(getFormUrl(), '_blank')}
                  className={secondaryButtonClass}
                >
                  <ExternalLink size={14} />
                  Открыть форму
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLinkEditing(true);
                    setExpiryDraft(questionnaire.expires_at?.split('T')[0] || '');
                  }}
                  className={secondaryButtonClass}
                >
                  <Pencil size={14} />
                  Изменить срок
                </button>
              </>
            )}
          >
            {linkEditing ? (
              <CompactField label="Дата окончания действия" className="min-h-[86px]">
                <div className="space-y-2">
                  <input
                    type="date"
                    value={expiryDraft}
                    onChange={e => setExpiryDraft(e.target.value)}
                    className="w-full max-w-sm rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div className="text-xs text-gray-500">Оставьте поле пустым, если ссылка должна быть бессрочной.</div>
                </div>
              </CompactField>
            ) : (
              <CompactField label="Публичная ссылка" valueClassName="font-mono text-xs text-gray-700">
                <div className="truncate" title={getFormUrl()}>
                  {getFormUrl()}
                </div>
              </CompactField>
            )}

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <CompactField label="Создана">{formatDateTime(questionnaire.created_at)}</CompactField>
              <CompactField label="Заполнена клиентом">
                {questionnaire.submitted_at ? formatDateTime(questionnaire.submitted_at) : 'Еще не заполнена'}
              </CompactField>
              <CompactField label="Срок действия">
                {questionnaire.expires_at ? formatDateTime(questionnaire.expires_at) : 'Бессрочно'}
              </CompactField>
            </div>
          </TopSectionCard>

          <TopSectionCard
            icon={<FileText size={18} />}
            title="Сделка в Битрикс24"
            description="Связанная сделка и статус синхронизации"
            className="h-full"
            actions={deal?.deal_url ? (
              <a
                href={deal.deal_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-all hover:bg-blue-100"
              >
                <ExternalLink size={14} />
                Открыть в Битрикс24
              </a>
            ) : null}
          >
            {deal?.bitrix_deal_id ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <CompactField label="ID сделки">#{deal.bitrix_deal_id}</CompactField>
                <CompactField label="ID компании">{deal.bitrix_company_id || '—'}</CompactField>
                <CompactField label="Статус синхронизации">{deal.sync_status || '—'}</CompactField>
                <CompactField label="Обновлена">{formatDateTime(deal.updated_at)}</CompactField>
                <CompactField label="Название сделки" className="sm:col-span-2" valueClassName="break-words">
                  {deal.deal_title || '—'}
                </CompactField>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-slate-50/70 px-4 py-5 text-sm text-gray-500">
                Сделка еще не создана в Bitrix24. Используйте кнопку отправки в верхней панели.
              </div>
            )}
          </TopSectionCard>

          <TopSectionCard
            icon={<Building2 size={18} />}
            title="Информация о компании"
            description="Основные реквизиты клиента"
            className="h-full"
            actions={renderCompanyActions('Редактировать')}
          >
            {company ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { key: 'name', label: 'Название компании' },
                  { key: 'bin_iin', label: 'БИН/ИИН компании' },
                  { key: 'phone', label: 'Телефон' },
                  { key: 'city', label: 'Город' },
                  { key: 'email', label: 'Email' },
                  { key: 'bitrix_company_id', label: 'ID компании в Битрикс' },
                ].map(({ key, label }) => (
                  <CompactField key={key} label={label} valueClassName="break-words">
                    {companyEditing ? (
                      <input
                        value={getRecordValue(companyDraft, key)}
                        onChange={e => setCompanyDraft(prev => ({ ...prev, [key]: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    ) : (
                      getRecordValue(company, key) || '—'
                    )}
                  </CompactField>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-slate-50/70 px-4 py-5 text-sm text-gray-500">
                Клиент еще не заполнил форму, поэтому данные компании пока отсутствуют.
              </div>
            )}
          </TopSectionCard>

          <TopSectionCard
            icon={<FileText size={18} />}
            title="Оплата и документы"
            description={questionnaire.payment_order_optional ? 'Платежка для этой анкеты не обязательна' : 'Платежное поручение и статус оплаты'}
            className="h-full"
            actions={company ? renderCompanyActions('Редактировать оплату') : undefined}
          >
            {!company ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-slate-50/70 px-4 py-5 text-sm text-gray-500">
                Блок оплаты появится после заполнения данных компании.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <CompactField label="Платежное поручение" className="sm:col-span-2" valueClassName="text-sm font-medium">
                  {companyEditing ? (
                    <div className="space-y-2">
                      {paymentOrderUrl ? (
                        <>
                          <a
                            href={paymentOrderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline"
                          >
                            {paymentOrderName || 'Открыть файл'}
                          </a>
                          <div className="text-xs text-gray-600">
                            {paymentUploadedAt ? `Загружено: ${formatDateTime(paymentUploadedAt)}` : 'Файл уже прикреплен'}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-gray-500">
                          {questionnaire.payment_order_optional ? 'Файл можно не прикладывать.' : 'Файл еще не загружен.'}
                        </div>
                      )}

                      <input
                        ref={paymentOrderInputRef}
                        type="file"
                        accept=".pdf,image/*"
                        className="hidden"
                        onChange={event => {
                          const file = event.target.files?.[0];
                          if (file) void handleAdminPaymentOrderSelect(file);
                        }}
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => paymentOrderInputRef.current?.click()}
                          disabled={uploadingPaymentOrder}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
                        >
                          {paymentOrderUrl ? 'Заменить файл' : 'Загрузить файл'}
                        </button>
                        {paymentOrderUrl && (
                          <button
                            type="button"
                            onClick={clearPaymentOrderDraft}
                            disabled={uploadingPaymentOrder}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 transition-all hover:bg-red-50 disabled:opacity-50"
                          >
                            Удалить файл
                          </button>
                        )}
                      </div>

                      {uploadingPaymentOrder && <div className="text-xs text-blue-600">Загружаем платежное поручение...</div>}
                    </div>
                  ) : paymentOrderUrl ? (
                    <div className="space-y-1">
                      <a
                        href={paymentOrderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {paymentOrderName || 'Открыть файл'}
                      </a>
                      <div className="text-xs text-gray-600">
                        {paymentUploadedAt ? `Загружено: ${formatDateTime(paymentUploadedAt)}` : 'Файл прикреплен'}
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-500">
                      {questionnaire.payment_order_optional ? 'Платежное поручение не требуется.' : 'Файл не загружен.'}
                    </span>
                  )}
                </CompactField>

                <CompactField label="Номер, дата и сумма">
                  {companyEditing ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={paymentOrderNumber}
                        onChange={event => setCompanyDraft(prev => ({ ...prev, payment_order_number: event.target.value }))}
                        placeholder="Номер"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <input
                        type="date"
                        value={paymentOrderDate}
                        onChange={event => setCompanyDraft(prev => ({ ...prev, payment_order_date: event.target.value || null }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <input
                        value={paymentOrderAmount == null ? '' : String(paymentOrderAmount)}
                        onChange={event => setCompanyDraft(prev => ({
                          ...prev,
                          payment_order_amount: normalizeAmountInput(event.target.value),
                        }))}
                        placeholder="Сумма"
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  ) : (
                    <span>
                      № {paymentOrderNumber || '—'} · {paymentOrderDate || '—'} · {paymentOrderAmount ?? '—'}
                    </span>
                  )}
                </CompactField>

                <CompactField label="Статус оплаты">
                  <div className="space-y-2">
                    <label className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      paymentIsPaid
                        ? 'border-green-200 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-gray-50 text-gray-700'
                    }`}>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={paymentIsPaid}
                        onChange={(e) => {
                          if (companyEditing) {
                            setCompanyDraft(prev => ({ ...prev, payment_is_paid: e.target.checked }));
                            return;
                          }
                          void togglePaymentStatus(e.target.checked);
                        }}
                        disabled={
                          companyEditing
                            ? uploadingPaymentOrder || !paymentOrderUrl
                            : savingPaymentStatus || !paymentOrderUrl
                        }
                      />
                      <span>{paymentIsPaid ? 'Оплачено' : 'Не оплачено'}</span>
                    </label>
                    {!paymentOrderUrl && (
                      <div className="text-xs text-gray-500">
                        {questionnaire.payment_order_optional
                          ? 'Платежка необязательна, поэтому статус можно не отмечать.'
                          : 'Сначала загрузите платежное поручение.'}
                      </div>
                    )}
                  </div>
                </CompactField>
              </div>
            )}
          </TopSectionCard>
        </div>

        <div>
          <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200">
            {([
              { key: 'participants', label: 'Сотрудники', icon: <Users size={15} />, count: participants.length },
              { key: 'certificates', label: 'Удостоверения и сертификаты', icon: <FileText size={15} />, count: certificates.length },
              { key: 'course_costs', label: 'Сумма стоимости курсов', icon: <FileText size={15} />, count: courseCostSummaries.separate.rows.length },
              { key: 'protocols', label: 'Протоколы', icon: <FileText size={15} />, count: protocols.length },
              { key: 'printed_documents', label: 'Распечатанные документы', icon: <FileText size={15} />, count: generatedDocuments.length },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3 py-2 text-[13px] font-medium border-b-2 transition-all -mb-px ${
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
              companyName={company?.name || ''}
              participants={participants}
              bitrixDealId={deal?.bitrix_deal_id || null}
              bitrixCompanyId={company?.bitrix_company_id || null}
              certificates={certificates}
              onRefresh={loadData}
            />
          )}
          {tab === 'course_costs' && (
            <CourseCostSummaryTable summaries={courseCostSummaries} />
          )}
          {tab === 'protocols' && (
            <ProtocolsTable
              questionnaireId={id!}
              dealId={deal?.id || null}
              companyId={company?.id || null}
              companyName={company?.name || ''}
              bitrixDealId={deal?.bitrix_deal_id || null}
              bitrixCompanyId={company?.bitrix_company_id || null}
              protocols={protocols}
              certificates={certificates}
              onRefresh={loadData}
            />
          )}
          {tab === 'printed_documents' && (
            <PrintedDocumentsTable
              documents={generatedDocuments}
              certificates={certificates}
              bitrixDealId={deal?.bitrix_deal_id || null}
              bitrixCompanyId={company?.bitrix_company_id || null}
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
          dealAmount={courseCostSummaries.combined.grandTotal}
          onClose={() => setShowSyncModal(false)}
          onDone={() => {
            setShowSyncModal(false);
            loadData();
          }}
        />
      )}
    </DashboardLayout>
  );
}


