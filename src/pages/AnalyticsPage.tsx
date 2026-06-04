import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BarChart3, Clock, Filter, TrendingUp, Users } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatDuration, durationBetween } from '../lib/questionnaireWorkflow';
import { loadProfileDirectory, getProfileDisplayName, type ProfileDirectoryEntry } from '../lib/profileDirectory';
import type { Certificate, Company, QuestionnaireLink } from '../types';

type PeriodKey = '1d' | '2d' | '3d' | 'week' | 'month' | 'quarter' | 'half_year' | 'year';

type AnalyticsCompany = Pick<Company, 'questionnaire_id' | 'name'>;

type AnalyticsCertificate = Pick<Certificate, 'questionnaire_id' | 'participant_id' | 'course_name'>;

type CoordinatorOption = {
  userId: string;
  label: string;
};

const PERIODS: Array<{ key: PeriodKey; label: string; days: number }> = [
  { key: '1d', label: '1 день', days: 1 },
  { key: '2d', label: '2 дня', days: 2 },
  { key: '3d', label: '3 дня', days: 3 },
  { key: 'week', label: 'Неделя', days: 7 },
  { key: 'month', label: 'Месяц', days: 30 },
  { key: 'quarter', label: 'Квартал', days: 90 },
  { key: 'half_year', label: 'Полугодие', days: 183 },
  { key: 'year', label: 'Год', days: 365 },
];

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}

function getCoordinatorId(questionnaire: QuestionnaireLink): string {
  return String(
    questionnaire.completed_by ||
    questionnaire.processing_started_by ||
    questionnaire.accepted_by ||
    questionnaire.created_by ||
    ''
  ).trim();
}

function isInternalCompany(name: string): boolean {
  const normalized = name.toLocaleLowerCase('ru-RU');
  return normalized.includes('hse') || normalized.includes('нse') || normalized.includes('хсе');
}

function StatCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-gray-500">{title}</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
          <div className="mt-1 text-xs text-gray-500">{hint}</div>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-2.5 text-blue-600">{icon}</div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { user, profile } = useAuth();
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireLink[]>([]);
  const [companies, setCompanies] = useState<AnalyticsCompany[]>([]);
  const [certificates, setCertificates] = useState<AnalyticsCertificate[]>([]);
  const [profiles, setProfiles] = useState<ProfileDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [regionFilter, setRegionFilter] = useState('all');
  const [coordinatorFilter, setCoordinatorFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [companyScopeFilter, setCompanyScopeFilter] = useState<'all' | 'internal' | 'external'>('all');
  const currentUserId = user?.id || '';
  const canSeeAllQuestionnaires = profile?.role === 'admin' || profile?.questionnaire_access === 'all';

  const loadData = useCallback(async () => {
    setLoading(true);

    let questionnairesQuery = supabase
      .from('questionnaires')
      .select('*')
      .order('created_at', { ascending: false });

    if (!canSeeAllQuestionnaires && currentUserId) {
      questionnairesQuery = questionnairesQuery.eq('created_by', currentUserId);
    }

    const questionnairesRes = await questionnairesQuery;

    const nextQuestionnaires = (questionnairesRes.data || []) as QuestionnaireLink[];
    const questionnaireIds = nextQuestionnaires.map(questionnaire => questionnaire.id);
    const coordinatorIds = Array.from(new Set(nextQuestionnaires.map(getCoordinatorId).filter(Boolean)));
    const [companiesRes, certificatesRes, nextProfiles] = await Promise.all([
      questionnaireIds.length > 0
        ? supabase.from('companies').select('questionnaire_id, name').in('questionnaire_id', questionnaireIds)
        : Promise.resolve({ data: [], error: null }),
      questionnaireIds.length > 0
        ? supabase.from('certificates').select('questionnaire_id, participant_id, course_name').in('questionnaire_id', questionnaireIds)
        : Promise.resolve({ data: [], error: null }),
      loadProfileDirectory(coordinatorIds),
    ]);

    setQuestionnaires(nextQuestionnaires);
    setCompanies((companiesRes.data || []) as AnalyticsCompany[]);
    setCertificates((certificatesRes.data || []) as AnalyticsCertificate[]);
    setProfiles(nextProfiles);
    setLoading(false);
  }, [canSeeAllQuestionnaires, currentUserId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const profileByUserId = useMemo(() => {
    return new Map(profiles.map(profile => [profile.user_id, profile]));
  }, [profiles]);

  const companyByQuestionnaireId = useMemo(() => {
    const result = new Map<string, AnalyticsCompany>();
    for (const company of companies) {
      if (!result.has(company.questionnaire_id)) {
        result.set(company.questionnaire_id, company);
      }
    }
    return result;
  }, [companies]);

  const periodStart = useMemo(() => {
    const selected = PERIODS.find(item => item.key === period) || PERIODS[3];
    const date = new Date();
    date.setDate(date.getDate() - selected.days);
    return date;
  }, [period]);

  const regionOptions = useMemo(() => {
    return Array.from(new Set(questionnaires.map(item => item.region_name).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'ru-RU'));
  }, [questionnaires]);

  const coordinatorOptions = useMemo<CoordinatorOption[]>(() => {
    const ids = Array.from(new Set(questionnaires.map(getCoordinatorId).filter(Boolean)));
    return ids
      .map(userId => ({
        userId,
        label: getProfileDisplayName(profileByUserId.get(userId) || null, userId),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ru-RU'));
  }, [profileByUserId, questionnaires]);

  const courseOptions = useMemo(() => {
    return Array.from(new Set(certificates.map(item => String(item.course_name || '').trim()).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'ru-RU'));
  }, [certificates]);

  const filteredQuestionnaires = useMemo(() => {
    return questionnaires.filter(questionnaire => {
      const referenceDate = questionnaire.completed_at || questionnaire.submitted_at || questionnaire.created_at;
      if (new Date(referenceDate) < periodStart) return false;

      if (regionFilter !== 'all' && questionnaire.region_name !== regionFilter) return false;

      const coordinatorId = getCoordinatorId(questionnaire);
      if (coordinatorFilter !== 'all' && coordinatorId !== coordinatorFilter) return false;

      const company = companyByQuestionnaireId.get(questionnaire.id);
      const internal = isInternalCompany(String(company?.name || ''));
      if (companyScopeFilter === 'internal' && !internal) return false;
      if (companyScopeFilter === 'external' && internal) return false;

      if (courseFilter !== 'all') {
        const hasCourse = certificates.some(certificate =>
          certificate.questionnaire_id === questionnaire.id &&
          String(certificate.course_name || '').trim() === courseFilter
        );
        if (!hasCourse) return false;
      }

      return true;
    });
  }, [certificates, companyByQuestionnaireId, companyScopeFilter, coordinatorFilter, courseFilter, periodStart, questionnaires, regionFilter]);

  const completedQuestionnaires = useMemo(() => {
    return filteredQuestionnaires.filter(questionnaire => {
      if (!questionnaire.completed_at) return false;
      return new Date(questionnaire.completed_at) >= periodStart;
    });
  }, [filteredQuestionnaires, periodStart]);

  const completedCount = completedQuestionnaires.length;
  const overdueCount = completedQuestionnaires.filter(item => item.completed_in_time === false || item.is_overdue).length;
  const inTimeCount = completedCount - overdueCount;
  const avgSeconds = completedCount > 0
    ? Math.round(completedQuestionnaires.reduce((sum, item) => {
      if (typeof item.total_processing_seconds === 'number') return sum + item.total_processing_seconds;
      if (item.submitted_at && item.completed_at) {
        return sum + Math.max(0, Math.round((new Date(item.completed_at).getTime() - new Date(item.submitted_at).getTime()) / 1000));
      }
      return sum;
    }, 0) / completedCount)
    : null;

  const regionRows = useMemo(() => {
    const buckets = new Map<string, { region: string; incoming: number; completed: number; overdue: number }>();
    for (const questionnaire of filteredQuestionnaires) {
      const region = String(questionnaire.region_name || 'Не указан').trim() || 'Не указан';
      const bucket = buckets.get(region) || { region, incoming: 0, completed: 0, overdue: 0 };
      if (questionnaire.submitted_at && new Date(questionnaire.submitted_at) >= periodStart) bucket.incoming++;
      if (questionnaire.completed_at && new Date(questionnaire.completed_at) >= periodStart) bucket.completed++;
      if ((questionnaire.completed_in_time === false || questionnaire.is_overdue) && questionnaire.completed_at) bucket.overdue++;
      buckets.set(region, bucket);
    }
    return Array.from(buckets.values()).sort((left, right) => right.incoming - left.incoming);
  }, [filteredQuestionnaires, periodStart]);

  const coordinatorRows = useMemo(() => {
    const buckets = new Map<string, {
      userId: string;
      name: string;
      completed: number;
      overdue: number;
      totalAcceptSeconds: number;
      acceptCount: number;
      totalProcessingSeconds: number;
      processingCount: number;
    }>();

    for (const questionnaire of completedQuestionnaires) {
      const userId = getCoordinatorId(questionnaire) || 'unknown';
      const bucket = buckets.get(userId) || {
        userId,
        name: userId === 'unknown' ? 'Не указан' : getProfileDisplayName(profileByUserId.get(userId) || null, userId),
        completed: 0,
        overdue: 0,
        totalAcceptSeconds: 0,
        acceptCount: 0,
        totalProcessingSeconds: 0,
        processingCount: 0,
      };

      bucket.completed++;
      if (questionnaire.completed_in_time === false || questionnaire.is_overdue) bucket.overdue++;
      if (questionnaire.submitted_at && questionnaire.accepted_at) {
        bucket.totalAcceptSeconds += Math.max(0, Math.round((new Date(questionnaire.accepted_at).getTime() - new Date(questionnaire.submitted_at).getTime()) / 1000));
        bucket.acceptCount++;
      }
      if (questionnaire.processing_started_at && questionnaire.completed_at) {
        bucket.totalProcessingSeconds += Math.max(0, Math.round((new Date(questionnaire.completed_at).getTime() - new Date(questionnaire.processing_started_at).getTime()) / 1000));
        bucket.processingCount++;
      }
      buckets.set(userId, bucket);
    }

    return Array.from(buckets.values())
      .map(bucket => {
        const inTimePercent = bucket.completed > 0 ? ((bucket.completed - bucket.overdue) / bucket.completed) * 100 : 0;
        const avgProcessingSeconds = bucket.processingCount > 0 ? bucket.totalProcessingSeconds / bucket.processingCount : 0;
        const speedScore = avgProcessingSeconds > 0 ? Math.max(0, Math.min(100, 100 - (avgProcessingSeconds / 86400) * 100)) : 100;
        return {
          ...bucket,
          avgAcceptSeconds: bucket.acceptCount > 0 ? Math.round(bucket.totalAcceptSeconds / bucket.acceptCount) : null,
          avgProcessingSeconds: bucket.processingCount > 0 ? Math.round(avgProcessingSeconds) : null,
          inTimePercent,
          efficiency: Math.round(inTimePercent * 0.7 + speedScore * 0.3),
        };
      })
      .sort((left, right) => right.completed - left.completed);
  }, [completedQuestionnaires, profileByUserId]);

  const courseRows = useMemo(() => {
    const completedIds = new Set(completedQuestionnaires.map(item => item.id));
    const buckets = new Map<string, { course: string; employees: Set<string>; rows: number }>();
    for (const certificate of certificates) {
      if (!certificate.questionnaire_id || !completedIds.has(certificate.questionnaire_id)) continue;
      const course = String(certificate.course_name || 'Не указан').trim() || 'Не указан';
      if (courseFilter !== 'all' && course !== courseFilter) continue;
      const bucket = buckets.get(course) || { course, employees: new Set<string>(), rows: 0 };
      bucket.rows++;
      if (certificate.participant_id) bucket.employees.add(certificate.participant_id);
      buckets.set(course, bucket);
    }
    return Array.from(buckets.values())
      .map(bucket => ({ course: bucket.course, employees: bucket.employees.size || bucket.rows }))
      .sort((left, right) => right.employees - left.employees);
  }, [certificates, completedQuestionnaires, courseFilter]);

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Аналитика' }]}>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Аналитика заявок</h1>
          <p className="mt-1 text-sm text-gray-500">
            Сроки обработки, эффективность координаторов, регионы / отделы и обученные сотрудники по курсам.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50"
        >
          <TrendingUp size={16} />
          Обновить
        </button>
      </div>

      <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Filter size={16} />
          Фильтры
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="flex flex-col gap-1.5 text-sm text-gray-600">
            <span>Период</span>
            <select value={period} onChange={event => setPeriod(event.target.value as PeriodKey)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {PERIODS.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-gray-600">
            <span>Регион / отдел</span>
            <select value={regionFilter} onChange={event => setRegionFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="all">Все регионы / отделы</option>
              {regionOptions.map(region => <option key={region} value={region}>{region}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-gray-600">
            <span>Координатор</span>
            <select value={coordinatorFilter} onChange={event => setCoordinatorFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="all">Все координаторы</option>
              {coordinatorOptions.map(option => <option key={option.userId} value={option.userId}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-gray-600">
            <span>Курс</span>
            <select value={courseFilter} onChange={event => setCourseFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="all">Все курсы</option>
              {courseOptions.map(course => <option key={course} value={course}>{course}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-gray-600">
            <span>ТОО</span>
            <select value={companyScopeFilter} onChange={event => setCompanyScopeFilter(event.target.value as 'all' | 'internal' | 'external')} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="all">Все заявки</option>
              <option value="internal">Внутренние</option>
              <option value="external">Внешние</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-16 text-center shadow-sm">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Выполнено заявок" value={completedCount} hint="По дате завершения" icon={<BarChart3 size={18} />} />
            <StatCard title="Среднее время" value={formatDuration(avgSeconds)} hint="От поступления до завершения" icon={<Clock size={18} />} />
            <StatCard title="В срок" value={inTimeCount} hint={formatPercent(completedCount ? (inTimeCount / completedCount) * 100 : 0)} icon={<TrendingUp size={18} />} />
            <StatCard title="Просрочено" value={overdueCount} hint="Есть просрочка по сроку или завершена поздно" icon={<Clock size={18} />} />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-gray-900">Регион / отдел</h2>
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Регион / отдел</th>
                      <th className="px-3 py-2 text-left">Поступило</th>
                      <th className="px-3 py-2 text-left">Завершено</th>
                      <th className="px-3 py-2 text-left">Просрочено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionRows.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">Нет данных за период.</td></tr>
                    ) : regionRows.map(row => (
                      <tr key={row.region} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-900">{row.region}</td>
                        <td className="px-3 py-2 text-gray-600">{row.incoming}</td>
                        <td className="px-3 py-2 text-gray-600">{row.completed}</td>
                        <td className="px-3 py-2 text-gray-600">{row.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-base font-semibold text-gray-900">Обученные сотрудники по курсам</h2>
              <div className="space-y-2">
                {courseRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">Нет данных по завершенным заявкам.</div>
                ) : courseRows.slice(0, 10).map(row => (
                  <div key={row.course} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-3 py-2">
                    <span className="min-w-0 truncate text-sm font-medium text-gray-900">{row.course}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      <Users size={12} />
                      {row.employees}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Эффективность координаторов</h2>
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Координатор</th>
                    <th className="px-3 py-2 text-left">Выполнено</th>
                    <th className="px-3 py-2 text-left">Принятие</th>
                    <th className="px-3 py-2 text-left">Обработка</th>
                    <th className="px-3 py-2 text-left">В срок</th>
                    <th className="px-3 py-2 text-left">Коэффициент</th>
                  </tr>
                </thead>
                <tbody>
                  {coordinatorRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-500">Нет завершенных заявок за период.</td></tr>
                  ) : coordinatorRows.map(row => (
                    <tr key={row.userId} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                      <td className="px-3 py-2 text-gray-600">{row.completed}</td>
                      <td className="px-3 py-2 text-gray-600">{formatDuration(row.avgAcceptSeconds)}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {row.avgProcessingSeconds ? formatDuration(row.avgProcessingSeconds) : durationBetween(null, null)}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{formatPercent(row.inTimePercent)}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          {row.efficiency}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
