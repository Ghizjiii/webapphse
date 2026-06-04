import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Plus, Trash2, BookOpen, Tag, Save, Building2, Search, ExternalLink, Clock, FileBadge2, Award, CheckCircle2, ClipboardCheck, ShieldCheck, Banknote, MapPinned, Users, Shield, Hash } from 'lucide-react';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import DashboardLayout from '../components/DashboardLayout';
import { getFreshAccessToken, supabase } from '../lib/supabase';
import {
  BITRIX_REFERENCE_LISTS,
} from '../lib/bitrix';
import { parseProtocolSequenceNumber, protocolCategoryLabel, protocolNumberSequenceKey } from '../lib/protocolGeneration';
import { useToast } from '../context/ToastContext';
import { formatDurationLabel } from '../lib/documentValidity';
import type {
  Protocol,
  ProtocolCategoryScope,
  RefBitrixListItem,
  RefCompanyDirectory,
  RefCoursePrice,
  RefDocumentValidityRule,
  ReferenceSyncStatus,
  RefProtocolNumeratorSetting,
} from '../types';

type Tab =
  | 'categories'
  | 'courses'
  | 'course-prices'
  | 'my-companies'
  | 'document-validity'
  | 'document-types'
  | 'grade'
  | 'employee-status'
  | 'marker-pass'
  | 'type-learn'
  | 'commis-concl'
  | 'electrical-safety-admission'
  | 'electrical-safety-group'
  | 'regions'
  | 'cities'
  | 'commission-members'
  | 'commission-my-companies'
  | 'protocol-numerator'
  | 'companies';

type TabGroup = 'main' | 'secondary' | 'numerator';

interface RefItem {
  id: string;
  name: string;
  bitrix_value: string;
  sort_order: number;
}

interface ReferenceTableRow {
  id: string;
  [key: string]: string;
}

interface ReferenceTableColumn {
  key: string;
  label: string;
  render?: (row: ReferenceTableRow, index: number) => ReactNode;
  className?: string;
}

interface ProtocolNumeratorRow {
  course_name: string;
  category_scope: ProtocolCategoryScope;
  category_label: string;
  start_number: number;
  last_number: number | null;
  next_number: number;
  assigned_count: number;
}

function toRefItems(items: RefBitrixListItem[]): RefItem[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    bitrix_value: item.bitrix_value,
    sort_order: item.sort_order,
  }));
}

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function getBitrixListItemDetails(item: RefBitrixListItem): Record<string, unknown> {
  return item.details_json && typeof item.details_json === 'object'
    ? item.details_json
    : {};
}

function getBitrixListItemDetailValue(item: RefBitrixListItem, key: string): string {
  const value = getBitrixListItemDetails(item)[key];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Еще не синхронизировалось';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function buildSyncStatusKey(status: ReferenceSyncStatus | null): string {
  if (!status) return '';
  return `${status.last_success_at || ''}|${status.updated_at || ''}|${status.last_status || ''}`;
}

export default function ReferencePage() {
  const { showToast } = useToast();
  const [tabGroup, setTabGroup] = useState<TabGroup>('main');
  const [tab, setTab] = useState<Tab>('courses');
  const [categories, setCategories] = useState<RefItem[]>([]);
  const [courses, setCourses] = useState<RefItem[]>([]);
  const [coursePrices, setCoursePrices] = useState<RefCoursePrice[]>([]);
  const [bitrixListItems, setBitrixListItems] = useState<RefBitrixListItem[]>([]);
  const [companiesDirectory, setCompaniesDirectory] = useState<RefCompanyDirectory[]>([]);
  const [documentValidityRules, setDocumentValidityRules] = useState<RefDocumentValidityRule[]>([]);
  const [protocolNumeratorSettings, setProtocolNumeratorSettings] = useState<RefProtocolNumeratorSetting[]>([]);
  const [protocolHistory, setProtocolHistory] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [coursePriceSearch, setCoursePriceSearch] = useState('');
  const [documentRuleSearch, setDocumentRuleSearch] = useState('');
  const [protocolNumeratorSearch, setProtocolNumeratorSearch] = useState('');
  const [protocolHistorySearch, setProtocolHistorySearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingProtocolNumeratorKey, setSavingProtocolNumeratorKey] = useState('');
  const [syncStatus, setSyncStatus] = useState<ReferenceSyncStatus | null>(null);
  const syncStatusKeyRef = useRef('');
  const lastResumeCheckAtRef = useRef(0);

  const documentTypeItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'DOCUMENT_TYPE')),
    [bitrixListItems]
  );
  const myCompaniesItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'MY_COMPANIES')),
    [bitrixListItems]
  );
  const gradeItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'GRADE')),
    [bitrixListItems]
  );
  const employeeStatusItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'EMPLOYEE_STATUS')),
    [bitrixListItems]
  );
  const markerPassItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'MARKER_PASS')),
    [bitrixListItems]
  );
  const typeLearnItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'TYPE_LEARN')),
    [bitrixListItems]
  );
  const commisConclItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'COMMIS_CONCL')),
    [bitrixListItems]
  );
  const electricalSafetyAdmissionRows = useMemo<ReferenceTableRow[]>(
    () => bitrixListItems
      .filter(item => item.list_key === 'ELECTRICAL_SAFETY_ADMISSION')
      .map(item => ({
        id: item.id,
        name: item.name,
        category: getBitrixListItemDetailValue(item, 'category'),
      })),
    [bitrixListItems]
  );
  const electricalSafetyGroupRows = useMemo<ReferenceTableRow[]>(
    () => bitrixListItems
      .filter(item => item.list_key === 'ELECTRICAL_SAFETY_GROUP')
      .map(item => ({
        id: item.id,
        name: item.name,
        text_in_document: getBitrixListItemDetailValue(item, 'text_in_document'),
      })),
    [bitrixListItems]
  );
  const regionItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'REGIONS')),
    [bitrixListItems]
  );
  const cityItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'CITIES')),
    [bitrixListItems]
  );
  const commissionMemberRows = useMemo<ReferenceTableRow[]>(
    () => bitrixListItems
      .filter(item => item.list_key === 'COMMISSION_MEMBERS')
      .map(item => ({
        id: item.id,
        name: item.name,
        city: getBitrixListItemDetailValue(item, 'city'),
        my_company: getBitrixListItemDetailValue(item, 'my_company'),
        main_text: getBitrixListItemDetailValue(item, 'main_text'),
      })),
    [bitrixListItems]
  );
  const commissionMyCompaniesItems = useMemo(
    () => toRefItems(bitrixListItems.filter(item => item.list_key === 'COMMISSION_MY_COMPANIES')),
    [bitrixListItems]
  );
  const protocolNumeratorRows = useMemo<ProtocolNumeratorRow[]>(() => {
    const settingsMap = new Map<string, RefProtocolNumeratorSetting>();
    for (const row of protocolNumeratorSettings) {
      settingsMap.set(
        protocolNumberSequenceKey({
          courseName: row.course_name,
          categoryScope: row.category_scope,
        }),
        row,
      );
    }

    const counters = new Map<string, { lastNumber: number | null; assignedCount: number }>();
    for (const row of protocolHistory) {
      const key = protocolNumberSequenceKey({
        courseName: row.course_name,
        categoryScope: row.category_scope,
      });
      const current = counters.get(key) || { lastNumber: null, assignedCount: 0 };
      const parsedNumber = parseProtocolSequenceNumber(row.protocol_number);
      counters.set(key, {
        lastNumber: parsedNumber == null
          ? current.lastNumber
          : current.lastNumber == null
            ? parsedNumber
            : Math.max(current.lastNumber, parsedNumber),
        assignedCount: current.assignedCount + (String(row.protocol_number || '').trim() ? 1 : 0),
      });
    }

    const courseNames = Array.from(new Set([
      ...courses.map(item => String(item.name || '').trim()),
      ...protocolNumeratorSettings.map(item => String(item.course_name || '').trim()),
      ...protocolHistory.map(item => String(item.course_name || '').trim()),
    ].filter(Boolean))).sort((left, right) => left.localeCompare(right, 'ru'));

    const rows: ProtocolNumeratorRow[] = [];
    for (const courseName of courseNames) {
      const scopes: ProtocolCategoryScope[] = ['itr', 'worker', 'all'];
      for (const scope of scopes) {
        const key = protocolNumberSequenceKey({ courseName, categoryScope: scope });
        const setting = settingsMap.get(key);
        const startNumber = Number(setting?.start_number ?? 1);
        const counter = counters.get(key);
        const lastNumber = counter?.lastNumber ?? null;
        const nextNumber = Math.max((lastNumber ?? (startNumber - 1)) + 1, startNumber);

        rows.push({
          course_name: courseName,
          category_scope: scope,
          category_label: protocolCategoryLabel(scope),
          start_number: startNumber,
          last_number: lastNumber,
          next_number: nextNumber,
          assigned_count: counter?.assignedCount ?? 0,
        });
      }
    }

    return rows;
  }, [courses, protocolHistory, protocolNumeratorSettings]);
  const tabDefinitions = [
    { key: 'courses' as Tab, group: 'main' as TabGroup, label: 'Названия курсов', icon: <BookOpen size={15} />, count: courses.length },
    { key: 'course-prices' as Tab, group: 'main' as TabGroup, label: 'Цены на курс', icon: <Banknote size={15} />, count: coursePrices.length },
    { key: 'companies' as Tab, group: 'main' as TabGroup, label: 'Справочник компаний', icon: <Building2 size={15} />, count: companiesDirectory.length },
    { key: 'my-companies' as Tab, group: 'main' as TabGroup, label: 'Мои компании', icon: <Building2 size={15} />, count: myCompaniesItems.length },
    { key: 'document-validity' as Tab, group: 'main' as TabGroup, label: 'Правила сроков', icon: <Clock size={15} />, count: documentValidityRules.length },
    {
      key: 'protocol-numerator' as Tab,
      group: 'numerator' as TabGroup,
      label: 'Нумератор',
      icon: <Hash size={15} />,
      count: protocolHistory.filter(row => String(row.protocol_number || '').trim()).length,
    },
    { key: 'document-types' as Tab, group: 'secondary' as TabGroup, label: 'Тип документа', icon: <FileBadge2 size={15} />, count: documentTypeItems.length },
    { key: 'categories' as Tab, group: 'secondary' as TabGroup, label: 'Категории', icon: <Tag size={15} />, count: categories.length },
    { key: 'employee-status' as Tab, group: 'secondary' as TabGroup, label: 'Статус сотрудника', icon: <Building2 size={15} />, count: employeeStatusItems.length },
    { key: 'grade' as Tab, group: 'secondary' as TabGroup, label: 'Оценка', icon: <Award size={15} />, count: gradeItems.length },
    { key: 'marker-pass' as Tab, group: 'secondary' as TabGroup, label: 'Отметка проверки знаний', icon: <CheckCircle2 size={15} />, count: markerPassItems.length },
    { key: 'type-learn' as Tab, group: 'secondary' as TabGroup, label: 'Вид проверки / тип обучения', icon: <ClipboardCheck size={15} />, count: typeLearnItems.length },
    { key: 'commis-concl' as Tab, group: 'secondary' as TabGroup, label: 'Заключение комиссии', icon: <ShieldCheck size={15} />, count: commisConclItems.length },
    { key: 'electrical-safety-admission' as Tab, group: 'secondary' as TabGroup, label: 'Допуск электробезопасности', icon: <Shield size={15} />, count: electricalSafetyAdmissionRows.length },
    { key: 'electrical-safety-group' as Tab, group: 'secondary' as TabGroup, label: 'Группа электробезопасности', icon: <ShieldCheck size={15} />, count: electricalSafetyGroupRows.length },
    { key: 'regions' as Tab, group: 'secondary' as TabGroup, label: 'Регион / отдел', icon: <MapPinned size={15} />, count: regionItems.length },
    { key: 'cities' as Tab, group: 'secondary' as TabGroup, label: 'Города', icon: <MapPinned size={15} />, count: cityItems.length },
    { key: 'commission-members' as Tab, group: 'secondary' as TabGroup, label: 'Члены комиссии', icon: <Users size={15} />, count: commissionMemberRows.length },
    { key: 'commission-my-companies' as Tab, group: 'secondary' as TabGroup, label: 'Мои компании (комиссия)', icon: <Building2 size={15} />, count: commissionMyCompaniesItems.length },
  ];
  const visibleTabs = tabDefinitions.filter(item => item.group === tabGroup);
  const visibleTabRows = tabGroup === 'secondary'
    ? chunkItems(visibleTabs, 6)
    : [visibleTabs];

  async function loadData(showSpinner = true) {
    if (showSpinner) setLoading(true);
    const [
      catRes,
      courseRes,
      coursePriceRes,
      bitrixListRes,
      companyDirRes,
      documentRuleRes,
      protocolNumeratorRes,
      protocolHistoryRes,
      syncStatusRes,
    ] = await Promise.all([
      supabase.from('ref_categories').select('*').order('sort_order').order('name'),
      supabase.from('ref_courses').select('*').order('sort_order').order('name'),
      supabase.from('ref_course_prices').select('*').order('sort_order').order('course_name').order('category').order('qualification'),
      supabase.from('ref_bitrix_list_items').select('*').order('list_key').order('sort_order').order('name'),
      supabase.from('ref_company_directory').select('*').order('contract_is_active', { ascending: false }).order('name'),
      supabase.from('ref_document_validity_rules').select('*').order('sort_order').order('course_name').order('category'),
      supabase.from('ref_protocol_numerator_settings').select('*').order('course_name').order('category_scope'),
      supabase.from('protocols').select('*').order('course_name').order('category_label').order('created_at', { ascending: false }),
      supabase.from('reference_sync_status').select('*').eq('scope', 'reference_lists').maybeSingle(),
    ]);
    const categoryRows = catRes.data || [];
    const courseRows = courseRes.data || [];
    const documentRules = (documentRuleRes.data || []) as RefDocumentValidityRule[];
    const nextSyncStatus = (syncStatusRes.data || null) as ReferenceSyncStatus | null;

    setCategories(categoryRows);
    setCourses(courseRows);
    setCoursePrices((coursePriceRes.data || []) as RefCoursePrice[]);
    setBitrixListItems((bitrixListRes.data || []) as RefBitrixListItem[]);
    setCompaniesDirectory(companyDirRes.data || []);
    setProtocolNumeratorSettings((protocolNumeratorRes.data || []) as RefProtocolNumeratorSetting[]);
    setProtocolHistory((protocolHistoryRes.data || []) as Protocol[]);
    setSyncStatus(nextSyncStatus);
    syncStatusKeyRef.current = buildSyncStatusKey(nextSyncStatus);
    setDocumentValidityRules(
      [...documentRules].sort((left, right) => {
        if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
        const courseCompare = left.course_name.localeCompare(right.course_name, 'ru');
        if (courseCompare !== 0) return courseCompare;
        return left.category.localeCompare(right.category, 'ru');
      })
    );
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);
  async function checkForBackgroundSync() {
    const { data, error } = await supabase
      .from('reference_sync_status')
      .select('*')
      .eq('scope', 'reference_lists')
      .maybeSingle();

    if (error) return;

    const nextStatus = (data || null) as ReferenceSyncStatus | null;
    const nextKey = buildSyncStatusKey(nextStatus);

    if (nextKey && nextKey !== syncStatusKeyRef.current) {
      await loadData(false);
      return;
    }

    setSyncStatus(nextStatus);
  }

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void checkForBackgroundSync();
    }, 15000);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastResumeCheckAtRef.current < 5000) return;
      lastResumeCheckAtRef.current = now;
      void checkForBackgroundSync();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  async function syncCoursesAndCategoriesFromBitrix() {
    setSyncing(true);
    try {
      const accessToken = await getFreshAccessToken();

      const { data, error } = await supabase.functions.invoke('reference-sync', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          source: 'manual-ui',
          trigger: 'manual-sync',
        },
      });
      if (error) throw error;
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(String(data.error || 'Ошибка серверной синхронизации'));
      }

      const stats = data && typeof data === 'object' && 'stats' in data
        ? (data.stats as Record<string, number>)
        : null;
      showToast(
        'success',
        `Синхронизировано: ${stats?.lists_count || 0} списков, ${stats?.items_count || 0} элементов, ${stats?.companies_count || 0} компаний, ${stats?.contracts_count || 0} договоров`
      );
      await loadData(false);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Ошибка синхронизации');
      await checkForBackgroundSync();
    } finally {
      setSyncing(false);
    }
  }

  async function addCategory() {
    const categoryName = newCategoryName.trim();
    if (!categoryName) return;
    setSaving(true);
    const { error } = await supabase.from('ref_categories').insert({
      name: categoryName,
      bitrix_value: categoryName,
      sort_order: categories.length + 1,
    });
    if (error) showToast('error', 'Такая категория уже существует');
    else { setNewCategoryName(''); await loadData(); }
    setSaving(false);
  }

  async function addCourse() {
    const courseName = newCourseName.trim();
    if (!courseName) return;
    setSaving(true);
    const { error } = await supabase.from('ref_courses').insert({
      name: courseName,
      bitrix_value: courseName,
      sort_order: courses.length + 1,
    });
    if (error) showToast('error', 'Такой курс уже существует');
    else { setNewCourseName(''); await loadData(); }
    setSaving(false);
  }

  async function deleteCourse(id: string) {
    const item = courses.find(course => course.id === id);
    if (item) {
      await supabase.from('ref_document_validity_rules').delete().eq('course_name', item.name);
    }
    await supabase.from('ref_courses').delete().eq('id', id);
    await loadData();
  }

  async function deleteCategory(id: string) {
    const item = categories.find(category => category.id === id);
    if (item) {
      await supabase.from('ref_document_validity_rules').delete().eq('category', item.name);
    }
    await supabase.from('ref_categories').delete().eq('id', id);
    await loadData();
  }

  async function updateCourseName(id: string, name: string) {
    const nextName = name.trim();
    const current = courses.find(course => course.id === id);
    if (!nextName || !current) return;

    await supabase.from('ref_courses').update({ name: nextName, bitrix_value: nextName, updated_at: new Date().toISOString() }).eq('id', id);
    await supabase.from('ref_document_validity_rules').update({ course_name: nextName, updated_at: new Date().toISOString() }).eq('course_name', current.name);
    setCourses(prev => prev.map(c => c.id === id ? { ...c, name: nextName, bitrix_value: nextName } : c));
  }

  async function updateCategoryName(id: string, name: string) {
    const nextName = name.trim();
    const current = categories.find(category => category.id === id);
    if (!nextName || !current) return;

    await supabase.from('ref_categories').update({ name: nextName, bitrix_value: nextName, updated_at: new Date().toISOString() }).eq('id', id);
    await supabase.from('ref_document_validity_rules').update({ category: nextName, updated_at: new Date().toISOString() }).eq('category', current.name);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name: nextName, bitrix_value: nextName } : c));
  }

  async function saveProtocolNumeratorStartNumber(
    courseName: string,
    categoryScope: ProtocolCategoryScope,
    startNumber: number,
  ) {
    if (!Number.isInteger(startNumber) || startNumber < 0) {
      showToast('error', 'Начальное значение должно быть целым числом 0 или больше');
      return;
    }

    const saveKey = protocolNumberSequenceKey({ courseName, categoryScope });
    setSavingProtocolNumeratorKey(saveKey);

    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('ref_protocol_numerator_settings')
        .upsert({
          course_name: courseName,
          category_scope: categoryScope,
          start_number: startNumber,
          updated_at: now,
        }, {
          onConflict: 'course_name,category_scope',
        });

      if (error) throw error;

      showToast('success', `Старт нумерации сохранен: ${courseName} / ${protocolCategoryLabel(categoryScope)}`);
      await loadData(false);
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Не удалось сохранить старт нумерации');
    } finally {
      setSavingProtocolNumeratorKey('');
    }
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Анкеты', to: '/dashboard' }, { label: 'Справочник' }]}>
      <div className="w-fit min-w-full max-w-none space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Справочник</h1>
            <p className="text-sm text-gray-500 mt-1">Все данные из Bitrix Lists и справочника компаний синхронизируются в Supabase и дальше доступны локально внутри приложения</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => {
                void syncCoursesAndCategoriesFromBitrix();
              }}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Синхронизация...' : 'Синхронизировать все данные из Bitrix'}
            </button>
            <div className="text-right text-xs text-gray-500">
              Последнее обновление данных:{' '}
              <span className="font-medium text-gray-700">
                {formatDateTime(syncStatus?.last_success_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="w-fit min-w-full bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex gap-2 px-4 pt-4">
            {([
              { key: 'main' as TabGroup, label: 'Основное' },
              { key: 'secondary' as TabGroup, label: 'Дополнительно' },
              { key: 'numerator' as TabGroup, label: 'Нумератор' },
            ]).map(group => (
              <button
                key={group.key}
                onClick={() => {
                  setTabGroup(group.key);
                  const nextTab = tabDefinitions.find(item => item.group === group.key)?.key;
                  if (nextTab) setTab(nextTab);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                  tabGroup === group.key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>

          {visibleTabs.length > 1 && (
            <div className="border-b border-gray-200 px-4 pt-4 pb-2">
              <div className={tabGroup === 'secondary' ? 'flex flex-col gap-1.5' : 'flex gap-1 overflow-x-auto'}>
                {visibleTabRows.map((row, rowIndex) => (
                  <div
                    key={`${tabGroup}-${rowIndex}`}
                    className={tabGroup === 'secondary' ? 'grid grid-cols-6 gap-1.5' : 'flex gap-1 min-w-max'}
                  >
                    {row.map(t => (
                      <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px text-left ${
                          tabGroup === 'secondary' ? 'w-full min-w-0' : 'whitespace-nowrap'
                        } ${
                          tab === t.key
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="flex-shrink-0">{t.icon}</span>
                          <span className={tabGroup === 'secondary' ? 'min-w-0 leading-5 whitespace-normal break-words' : 'whitespace-nowrap'}>
                            {t.label}
                          </span>
                        </span>
                        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                          {t.count}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : tab === 'categories' ? (
              <CategoryTab
                items={categories}
                newName={newCategoryName}
                setNewName={setNewCategoryName}
                onAdd={addCategory}
                onDelete={deleteCategory}
                onUpdate={updateCategoryName}
                saving={saving}
              />
            ) : tab === 'courses' ? (
              <CourseTab
                items={courses}
                newName={newCourseName}
                setNewName={setNewCourseName}
                onAdd={addCourse}
                onDelete={deleteCourse}
                onUpdate={updateCourseName}
                saving={saving}
              />
            ) : tab === 'course-prices' ? (
              <CoursePricesTab
                items={coursePrices}
                search={coursePriceSearch}
                onSearchChange={setCoursePriceSearch}
              />
            ) : tab === 'my-companies' ? (
              <ReadonlyReferenceTab
                title={BITRIX_REFERENCE_LISTS.MY_COMPANIES.name}
                items={myCompaniesItems}
              />
            ) : tab === 'document-types' ? (
              <ReadonlyReferenceTab
                title={BITRIX_REFERENCE_LISTS.DOCUMENT_TYPE.name}
                items={documentTypeItems}
              />
            ) : tab === 'grade' ? (
              <ReadonlyReferenceTab
                title={BITRIX_REFERENCE_LISTS.GRADE.name}
                items={gradeItems}
              />
            ) : tab === 'employee-status' ? (
              <ReadonlyReferenceTab
                title={BITRIX_REFERENCE_LISTS.EMPLOYEE_STATUS.name}
                items={employeeStatusItems}
              />
            ) : tab === 'marker-pass' ? (
              <ReadonlyReferenceTab
                title={BITRIX_REFERENCE_LISTS.MARKER_PASS.name}
                items={markerPassItems}
              />
            ) : tab === 'type-learn' ? (
              <ReadonlyReferenceTab
                title={BITRIX_REFERENCE_LISTS.TYPE_LEARN.name}
                items={typeLearnItems}
              />
            ) : tab === 'commis-concl' ? (
              <ReadonlyReferenceTab
                title={BITRIX_REFERENCE_LISTS.COMMIS_CONCL.name}
                items={commisConclItems}
              />
            ) : tab === 'electrical-safety-admission' ? (
              <ReadonlyReferenceTableTab
                title="Допуск электробезопасности"
                rows={electricalSafetyAdmissionRows}
                columns={[
                  { key: 'name', label: 'Название' },
                  { key: 'category', label: 'Категория' },
                ]}
              />
            ) : tab === 'electrical-safety-group' ? (
              <ReadonlyReferenceTableTab
                title="Группа электробезопасности"
                rows={electricalSafetyGroupRows}
                columns={[
                  { key: 'name', label: 'Название' },
                  { key: 'text_in_document', label: 'Текст в документе' },
                ]}
              />
            ) : tab === 'regions' ? (
              <ReadonlyReferenceTab
                title="Регион / отдел"
                items={regionItems}
              />
            ) : tab === 'cities' ? (
              <ReadonlyReferenceTab
                title="Города"
                items={cityItems}
              />
            ) : tab === 'commission-members' ? (
              <ReadonlyReferenceTableTab
                title="Члены комиссии (для протокола)"
                rows={commissionMemberRows}
                columns={[
                  { key: 'name', label: 'Название' },
                  { key: 'city', label: 'Город' },
                  { key: 'my_company', label: 'Моя компания' },
                  {
                    key: 'main_text',
                    label: 'Основной текст членов комиссии',
                    render: row => (
                      <div className="min-w-[460px] whitespace-pre-line text-sm text-gray-800">
                        {row.main_text || '—'}
                      </div>
                    ),
                  },
                ]}
              />
            ) : tab === 'commission-my-companies' ? (
              <ReadonlyReferenceTab
                title="Мои компании"
                items={commissionMyCompaniesItems}
              />
            ) : tab === 'document-validity' ? (
              <DocumentValidityTab
                items={documentValidityRules}
                search={documentRuleSearch}
                onSearchChange={setDocumentRuleSearch}
              />
            ) : tab === 'protocol-numerator' ? (
              <ProtocolNumeratorTab
                rows={protocolNumeratorRows}
                search={protocolNumeratorSearch}
                historySearch={protocolHistorySearch}
                savingKey={savingProtocolNumeratorKey}
                protocols={protocolHistory}
                onSearchChange={setProtocolNumeratorSearch}
                onHistorySearchChange={setProtocolHistorySearch}
                onSaveStartNumber={saveProtocolNumeratorStartNumber}
              />
            ) : (
              <CompanyDirectoryTab
                rows={companiesDirectory}
                search={companySearch}
                onSearchChange={setCompanySearch}
              />
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

interface TabProps {
  items: RefItem[];
  newName: string;
  setNewName: (v: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, name: string) => void;
  saving: boolean;
  allowAdd?: boolean;
  allowEdit?: boolean;
}

function CategoryTab({ items, newName, setNewName, onAdd, onDelete, onUpdate, saving }: TabProps) {
  return (
    <ItemList
      items={items}
      newName={newName}
      setNewName={setNewName}
      onAdd={onAdd}
      onDelete={onDelete}
      onUpdate={onUpdate}
      saving={saving}
      allowAdd={false}
      allowEdit={false}
      placeholder="Например: ИТР"
      emptyText="Нет категорий. Синхронизируйте их из Bitrix Lists."
    />
  );
}

function CourseTab({ items, newName, setNewName, onAdd, onDelete, onUpdate, saving }: TabProps) {
  return (
    <ItemList
      items={items}
      newName={newName}
      setNewName={setNewName}
      onAdd={onAdd}
      onDelete={onDelete}
      onUpdate={onUpdate}
      saving={saving}
      allowAdd={false}
      allowEdit={false}
      placeholder="Например: Промышленная безопасность"
      emptyText="Нет курсов. Синхронизируйте их из Bitrix Lists."
    />
  );
}

function ReadonlyReferenceTab({
  title,
  items,
}: {
  title: string;
  items: RefItem[];
}) {
  return (
    <div className="space-y-4 w-fit min-w-full">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        Источник данных: Bitrix List `{title}`. Изменения нужно вносить в Bitrix, а здесь показывается локальная копия после синхронизации.
      </div>

      <ItemList
        items={items}
        newName=""
        setNewName={() => undefined}
        onAdd={() => undefined}
        onDelete={() => undefined}
        onUpdate={() => undefined}
        saving={false}
        allowAdd={false}
        allowEdit={false}
        placeholder=""
        emptyText="Нет данных. Нажмите синхронизацию, чтобы подтянуть значения из Bitrix."
      />
    </div>
  );
}

function ReadonlyReferenceTableTab({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: ReferenceTableRow[];
  columns: ReferenceTableColumn[];
}) {
  return (
    <div className="space-y-4 w-fit min-w-full">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        Источник данных: Bitrix List `{title}`. Изменения нужно вносить в Bitrix, а здесь показывается локальная копия после синхронизации.
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">Нет данных. Нажмите синхронизацию, чтобы подтянуть значения из Bitrix.</div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№</th>
                  {columns.map(column => (
                    <th
                      key={column.key}
                      className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.className || ''}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{index + 1}</td>
                    {columns.map(column => (
                      <td
                        key={column.key}
                        className={`px-4 py-2 text-sm text-gray-800 align-top ${column.className || ''}`}
                      >
                        {column.render ? column.render(row, index) : (row[column.key] || '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeProtocolNumeratorSearchValue(value: string): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function formatProtocolDisplayName(protocol: Pick<Protocol, 'course_name' | 'category_scope'>): string {
  const courseName = String(protocol.course_name || '').trim() || 'Без названия курса';
  return `${courseName} / ${protocolCategoryLabel(protocol.category_scope)}`;
}

function ProtocolNumeratorTab({
  rows,
  protocols,
  search,
  historySearch,
  savingKey,
  onSearchChange,
  onHistorySearchChange,
  onSaveStartNumber,
}: {
  rows: ProtocolNumeratorRow[];
  protocols: Protocol[];
  search: string;
  historySearch: string;
  savingKey: string;
  onSearchChange: (value: string) => void;
  onHistorySearchChange: (value: string) => void;
  onSaveStartNumber: (courseName: string, categoryScope: ProtocolCategoryScope, startNumber: number) => void | Promise<void>;
}) {
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setDraftValues({});
  }, [rows]);

  const normalizedSearch = normalizeProtocolNumeratorSearchValue(search);
  const normalizedHistorySearch = normalizeProtocolNumeratorSearchValue(historySearch);

  const filteredRows = useMemo(() => {
    if (!normalizedSearch) return rows;
    return rows.filter(row =>
      [
        row.course_name,
        row.category_label,
        String(row.start_number),
        String(row.next_number),
      ]
        .join(' ')
        .toLocaleLowerCase('ru')
        .includes(normalizedSearch)
    );
  }, [rows, normalizedSearch]);

  const historyRows = useMemo(() => {
    const filtered = protocols
      .filter(row => String(row.protocol_number || '').trim())
      .filter(row => {
        if (!normalizedHistorySearch) return true;
        return [
          row.course_name,
          protocolCategoryLabel(row.category_scope),
          row.protocol_number,
          row.protocol_date || '',
        ]
          .join(' ')
          .toLocaleLowerCase('ru')
          .includes(normalizedHistorySearch);
      });

    return [...filtered].sort((left, right) => {
      const byCourse = String(left.course_name || '').localeCompare(String(right.course_name || ''), 'ru');
      if (byCourse !== 0) return byCourse;

      const byScope = protocolCategoryLabel(left.category_scope).localeCompare(protocolCategoryLabel(right.category_scope), 'ru');
      if (byScope !== 0) return byScope;

      const leftNumber = parseProtocolSequenceNumber(left.protocol_number);
      const rightNumber = parseProtocolSequenceNumber(right.protocol_number);
      if (leftNumber != null && rightNumber != null && leftNumber !== rightNumber) {
        return rightNumber - leftNumber;
      }
      if (leftNumber != null && rightNumber == null) return -1;
      if (leftNumber == null && rightNumber != null) return 1;

      return String(right.protocol_date || right.updated_at || '').localeCompare(String(left.protocol_date || left.updated_at || ''));
    });
  }, [normalizedHistorySearch, protocols]);

  function keyForRow(row: ProtocolNumeratorRow): string {
    return protocolNumberSequenceKey({
      courseName: row.course_name,
      categoryScope: row.category_scope,
    });
  }

  function inputValueForRow(row: ProtocolNumeratorRow): string {
    const rowKey = keyForRow(row);
    return draftValues[rowKey] ?? String(row.start_number);
  }

  async function commitStartNumber(row: ProtocolNumeratorRow) {
    const rowKey = keyForRow(row);
    const rawValue = inputValueForRow(row).trim();
    if (!rawValue) {
      setDraftValues(current => ({ ...current, [rowKey]: String(row.start_number) }));
      return;
    }

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setDraftValues(current => ({ ...current, [rowKey]: String(row.start_number) }));
      return;
    }

    if (parsed === row.start_number) return;
    await onSaveStartNumber(row.course_name, row.category_scope, parsed);
  }

  return (
    <div className="space-y-6 w-fit min-w-full">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        Здесь задается старт автонумерации протоколов по каждому курсу и категории. Следующий номер считается от большего
        из стартового значения и уже выданных протоколов.
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">С какого начинается</h3>
            <p className="text-xs text-gray-500 mt-1">Для ИТР, обычного состава и, при необходимости, общих протоколов.</p>
          </div>
          <div className="relative w-full max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Поиск по курсу или категории"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">Нет строк нумератора для текущего фильтра.</div>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Курс</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Категория</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Начинать с</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Последний номер</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Следующий</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Выдано протоколов</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => {
                    const rowKey = keyForRow(row);
                    const isSaving = savingKey === rowKey;
                    return (
                      <tr key={rowKey} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{index + 1}</td>
                        <td className="px-4 py-2 text-sm text-gray-800">{row.course_name}</td>
                        <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{row.category_label}</td>
                        <td className="px-4 py-2">
                          <input
                            value={inputValueForRow(row)}
                            onChange={e => setDraftValues(current => ({ ...current, [rowKey]: e.target.value }))}
                            onBlur={() => {
                              void commitStartNumber(row);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                void commitStartNumber(row);
                              }
                              if (e.key === 'Escape') {
                                setDraftValues(current => ({ ...current, [rowKey]: String(row.start_number) }));
                              }
                            }}
                            disabled={isSaving}
                            inputMode="numeric"
                            className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
                          />
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{row.last_number ?? '—'}</td>
                        <td className="px-4 py-2 text-sm font-semibold text-gray-900 whitespace-nowrap">{row.next_number}</td>
                        <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">
                          {isSaving ? 'Сохранение...' : row.assigned_count}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Список всех протоколов</h3>
            <p className="text-xs text-gray-500 mt-1">Журнал уже присвоенных номеров с датами.</p>
          </div>
          <div className="relative w-full max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={historySearch}
              onChange={e => onHistorySearchChange(e.target.value)}
              placeholder="Поиск по курсу, категории, номеру или дате"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        </div>

        {historyRows.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-400">Протоколы пока не присвоены.</div>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Протокол</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Номер</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата протокола</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Сотрудников</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Обновлено</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row, index) => (
                    <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{index + 1}</td>
                      <td className="px-4 py-2 text-sm text-gray-800">{formatProtocolDisplayName(row)}</td>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{row.protocol_number || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{row.protocol_date || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{row.employees_count}</td>
                      <td className="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">{formatDateTime(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatCoursePrice(price: number | null): string {
  if (price == null || Number.isNaN(Number(price))) return '—';
  return `${Number(price).toLocaleString('ru-RU')} тенге`;
}

function normalizeCoursePriceSearchValue(value: string): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function CoursePricesTab({
  items,
  search,
  onSearchChange,
}: {
  items: RefCoursePrice[];
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const normalizedSearch = normalizeCoursePriceSearchValue(search);
  const filteredItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter(item =>
      [
        item.name,
        item.course_name,
        item.qualification,
        item.electrical_safety_group,
        item.category,
        formatCoursePrice(item.price),
      ]
        .join(' ')
        .toLocaleLowerCase('ru')
        .includes(normalizedSearch)
    );
  }, [items, normalizedSearch]);

  return (
    <div className="space-y-4 w-fit min-w-full">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        Источник данных: Bitrix List `Цены на курсы по умолчанию`. Здесь хранится локальная копия цен по умолчанию
        для автоподстановки в анкетах.
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Поиск по курсу, квалификации, группе или категории"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="text-xs text-gray-500">
          Найдено цен: <span className="font-medium text-gray-700">{filteredItems.length}</span>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">Нет данных. Нажмите синхронизацию, чтобы подтянуть цены из Bitrix.</div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Наименование курса</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Квалификация</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Группа электробезопасности</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Категория</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Цена</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={item.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{index + 1}</td>
                    <td className="px-4 py-2 text-sm text-gray-800">{item.course_name || item.name || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-800">{item.qualification || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-800">{item.electrical_safety_group || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-800">{item.category || '—'}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 whitespace-nowrap">{formatCoursePrice(item.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface ItemListProps extends TabProps {
  placeholder: string;
  emptyText: string;
}

function ItemList({ items, newName, setNewName, onAdd, onDelete, onUpdate, saving, allowAdd = true, allowEdit = true, placeholder, emptyText }: ItemListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  function startEdit(item: RefItem) {
    setEditing(item.id);
    setEditValue(item.name);
  }

  function commitEdit(id: string) {
    if (editValue.trim()) onUpdate(id, editValue.trim());
    setEditing(null);
  }

  return (
    <div className="space-y-4 w-fit min-w-full">
      {allowAdd && (
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onAdd()}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={onAdd}
            disabled={saving || !newName.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-medium transition-all"
          >
            <Plus size={14} /> Добавить
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">{emptyText}</div>
      ) : (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 group transition-all">
              <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{idx + 1}</span>
              {allowEdit && editing === item.id ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(item.id)}
                  onKeyDown={e => { if (e.key === 'Enter') commitEdit(item.id); if (e.key === 'Escape') setEditing(null); }}
                  className="flex-1 px-2 py-1 border border-blue-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              ) : (
                <span
                  className={`flex-1 text-sm text-gray-800 ${allowEdit ? 'cursor-pointer hover:text-blue-600' : ''}`}
                  onClick={() => {
                    if (allowEdit) startEdit(item);
                  }}
                >
                  {item.name}
                </span>
              )}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {allowEdit && editing !== item.id && (
                  <button onClick={() => startEdit(item)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all">
                    <Save size={13} />
                  </button>
                )}
                {(allowEdit || allowAdd) && (
                  <button onClick={() => onDelete(item.id)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentValidityTab({
  items,
  search,
  onSearchChange,
}: {
  items: RefDocumentValidityRule[];
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalizedSearch) return items;
    return items.filter(item =>
      [
        item.course_name,
        item.category,
        item.document_type,
        formatDurationLabel(item.duration_value, item.duration_unit),
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [items, normalizedSearch]);

  return (
    <div className="space-y-4 w-fit min-w-full">
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900">
        Источник данных: Bitrix List `Сроки документов`. Здесь показывается только локальная копия после синхронизации,
        без автодобавления правил внутри веб-приложения.
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Поиск по курсу, категории или типу документа"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="text-xs text-gray-500">
          Найдено правил: <span className="font-medium text-gray-700">{filteredItems.length}</span>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">Нет правил. Нажмите синхронизацию, чтобы подтянуть их из Bitrix.</div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">№</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Курс</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Категория</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип документа</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Срок</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => {
                  return (
                    <tr key={item.id} className="border-b border-gray-100 last:border-b-0">
                      <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">
                        {index + 1}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-sm text-gray-800">{item.course_name}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-sm text-gray-800">{item.category}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-sm text-gray-800">{item.document_type || '—'}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                        {formatDurationLabel(item.duration_value, item.duration_unit) || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return value;
}

function buildContractUrl(contractId: string): string {
  const id = String(contractId || '').trim();
  if (!id) return '';
  const basePortalUrl = String(import.meta.env.VITE_BITRIX_PORTAL_URL || 'https://hsecompany.bitrix24.kz').replace(/\/+$/, '');
  const entityTypeId = String(import.meta.env.VITE_BITRIX_CONTRACT_ENTITY_TYPE_ID || '1060').trim() || '1060';
  return `${basePortalUrl}/crm/type/${entityTypeId}/details/${id}/`;
}

function contractStateLabel(row: RefCompanyDirectory): string {
  if (!row.has_contract) return 'Нет договора';
  if (row.contract_is_active) return 'Договор активен';
  return 'Договор неактивен/просрочен';
}

function CompanyDirectoryTab({
  rows,
  search,
  onSearchChange,
}: {
  rows: RefCompanyDirectory[];
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const MIN_TABLE_HEIGHT = 380;
  const TABLE_HEADER_HEIGHT = 44;
  const TABLE_ROW_HEIGHT = 56;
  const TABLE_FOOTER_HEIGHT = 42;
  const TABLE_EXTRA_HEIGHT = 12;

  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  const normalized = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return rows;
    return rows.filter(r =>
      [r.name, r.bin_iin, r.phone, r.email, r.city, r.contract_number, r.contract_title]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [rows, normalized]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, safePage]);
  const tableHeight = Math.max(
    MIN_TABLE_HEIGHT,
    TABLE_HEADER_HEIGHT + TABLE_FOOTER_HEIGHT + (pageSize * TABLE_ROW_HEIGHT) + TABLE_EXTRA_HEIGHT
  );

  if (rows.length === 0) {
    return <div className="text-center py-10 text-sm text-gray-400">Справочник компаний пуст. Нажмите кнопку синхронизации.</div>;
  }

  return (
    <div className="space-y-4 w-fit min-w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative w-full max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => {
              onSearchChange(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Поиск по БИН/ИИН, названию, номеру договора"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span>Строк:</span>
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="px-2 py-1 border border-gray-300 rounded-md text-xs bg-white"
          >
            {[20, 50, 100, 200].map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="border border-gray-200 rounded-lg relative bg-white flex flex-col"
        style={{
          minWidth: '100%',
          height: tableHeight,
          minHeight: MIN_TABLE_HEIGHT,
        }}
      >
        <div className="w-full flex-1 overflow-x-auto">
          <table className="w-full text-sm min-w-[1220px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-3 py-2 w-14">№</th>
                <th className="text-left px-3 py-2">Компания</th>
                <th className="text-left px-3 py-2">БИН/ИИН</th>
                <th className="text-left px-3 py-2">Телефон</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">Номер договора</th>
                <th className="text-left px-3 py-2">Дата договора</th>
                <th className="text-left px-3 py-2">Срок договора</th>
                <th className="text-left px-3 py-2">Статус</th>
                <th className="text-left px-3 py-2">Ссылка</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, index) => (
                <tr key={row.id} className="border-b last:border-b-0 border-gray-100">
                  <td className="px-3 py-2 text-sm text-gray-500 align-top">
                    {(safePage - 1) * pageSize + index + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{row.name || '—'}</div>
                    <div className="text-xs text-gray-500">Bitrix ID: {row.bitrix_company_id}</div>
                  </td>
                  <td className="px-3 py-2">{row.bin_iin || '—'}</td>
                  <td className="px-3 py-2">{row.phone || '—'}</td>
                  <td className="px-3 py-2">{row.email || '—'}</td>
                  <td className="px-3 py-2">{row.contract_number || '—'}</td>
                  <td className="px-3 py-2">{formatDate(row.contract_date)}</td>
                  <td className="px-3 py-2">{formatDate(row.contract_start)} — {formatDate(row.contract_end)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.contract_is_active ? 'bg-green-100 text-green-800' : row.has_contract ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                      {contractStateLabel(row)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {row.contract_bitrix_id ? (
                      <a
                        href={buildContractUrl(row.contract_bitrix_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-medium"
                        title={`Открыть договор #${row.contract_bitrix_id}`}
                      >
                        <ExternalLink size={12} />
                        Открыть
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-100 px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500">
          <span>
            Показано: {filtered.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} из {filtered.length}
            {filtered.length !== rows.length ? ` (всего ${rows.length})` : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-2.5 py-1 border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50"
            >
              Prev
            </button>
            <span className="px-2">{safePage}/{totalPages}</span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-2.5 py-1 border border-gray-300 rounded-md disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


