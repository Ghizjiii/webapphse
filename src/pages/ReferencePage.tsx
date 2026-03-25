import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Plus, Trash2, BookOpen, Tag, Save, Building2, Search, ExternalLink, Clock } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { supabase } from '../lib/supabase';
import { fetchCompanyDirectorySnapshotFromBitrix, fetchCoursesFromFields, fetchCategoryValues, findSmartProcessEntityTypeId } from '../lib/bitrix';
import { useToast } from '../context/ToastContext';
import { buildDocumentValidityDefaults, formatDurationLabel } from '../lib/documentValidity';
import type { RefCompanyDirectory, RefDocumentValidityRule } from '../types';

type Tab = 'categories' | 'courses' | 'companies' | 'document-validity';

interface RefItem {
  id: string;
  name: string;
  bitrix_value: string;
  sort_order: number;
}

export default function ReferencePage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<RefItem[]>([]);
  const [courses, setCourses] = useState<RefItem[]>([]);
  const [companiesDirectory, setCompaniesDirectory] = useState<RefCompanyDirectory[]>([]);
  const [documentValidityRules, setDocumentValidityRules] = useState<RefDocumentValidityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [documentRuleSearch, setDocumentRuleSearch] = useState('');
  const [saving, setSaving] = useState(false);

  async function ensureDocumentValidityRules(courseItems: RefItem[], categoryItems: RefItem[], existingRules: RefDocumentValidityRule[]) {
    const missingRules = buildDocumentValidityDefaults({
      courseNames: courseItems.map(item => item.name),
      categoryNames: categoryItems.map(item => item.name),
      existingRules,
    });

    if (missingRules.length === 0) {
      return existingRules;
    }

    const now = new Date().toISOString();
    const payload = missingRules.map(rule => ({
      ...rule,
      created_at: now,
      updated_at: now,
    }));
    const { data, error } = await supabase.from('ref_document_validity_rules').insert(payload).select('*');
    if (error) throw error;
    return [...existingRules, ...(data || [])];
  }

  async function loadData() {
    setLoading(true);
    const [catRes, courseRes, companyDirRes, documentRuleRes] = await Promise.all([
      supabase.from('ref_categories').select('*').order('sort_order').order('name'),
      supabase.from('ref_courses').select('*').order('sort_order').order('name'),
      supabase.from('ref_company_directory').select('*').order('contract_is_active', { ascending: false }).order('name'),
      supabase.from('ref_document_validity_rules').select('*').order('sort_order').order('course_name').order('category'),
    ]);
    const categoryRows = catRes.data || [];
    const courseRows = courseRes.data || [];
    const ensuredRules = await ensureDocumentValidityRules(courseRows, categoryRows, documentRuleRes.data || []);

    setCategories(categoryRows);
    setCourses(courseRows);
    setCompaniesDirectory(companyDirRes.data || []);
    setDocumentValidityRules(
      [...ensuredRules].sort((left, right) => {
        if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
        const courseCompare = left.course_name.localeCompare(right.course_name, 'ru');
        if (courseCompare !== 0) return courseCompare;
        return left.category.localeCompare(right.category, 'ru');
      })
    );
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);

  async function syncCoursesAndCategoriesFromBitrix() {
    setSyncing(true);
    try {
      const [catValues, entityTypeId] = await Promise.all([
        fetchCategoryValues(),
        findSmartProcessEntityTypeId(),
      ]);
      const courseValues = await fetchCoursesFromFields(entityTypeId);

      let catCount = 0;
      for (let i = 0; i < catValues.length; i++) {
        const name = catValues[i];
        const { error } = await supabase.from('ref_categories').upsert(
          { name, bitrix_value: name, sort_order: i + 1, updated_at: new Date().toISOString() },
          { onConflict: 'name' }
        );
        if (!error) catCount++;
      }

      let courseCount = 0;
      for (let i = 0; i < courseValues.length; i++) {
        const name = courseValues[i];
        const { error } = await supabase.from('ref_courses').upsert(
          { name, bitrix_value: name, sort_order: i + 1, updated_at: new Date().toISOString() },
          { onConflict: 'name' }
        );
        if (!error) courseCount++;
      }

      showToast('success', `Синхронизировано: ${catCount} категорий, ${courseCount} курсов`);
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Ошибка синхронизации');
    } finally {
      setSyncing(false);
    }
  }

  async function syncCompaniesDirectoryFromBitrix() {
    setSyncing(true);
    try {
      const snapshot = await fetchCompanyDirectorySnapshotFromBitrix();

      if (snapshot.rows.length > 0) {
        const now = new Date().toISOString();
        const payload = snapshot.rows.map(row => ({ ...row, updated_at: now }));
        const { error } = await supabase.from('ref_company_directory').upsert(payload, { onConflict: 'bitrix_company_id' });
        if (error) throw error;
      }

      showToast('success', `Синхронизировано: ${snapshot.companiesCount} компаний, ${snapshot.contractsCount} договоров`);
      await loadData();
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Ошибка синхронизации справочника компаний');
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

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Анкеты', to: '/dashboard' }, { label: 'Справочник' }]}>
      <div className="w-fit min-w-full max-w-none space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Справочник</h1>
            <p className="text-sm text-gray-500 mt-1">Категории, курсы, сроки документов и справочник компаний/договоров из Bitrix24</p>
          </div>
          <button
            onClick={() => {
              if (tab === 'companies') void syncCompaniesDirectoryFromBitrix();
              else void syncCoursesAndCategoriesFromBitrix();
            }}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing
              ? 'Загрузка...'
              : tab === 'companies'
                ? 'Синхронизировать компании и договоры'
                : 'Обновить категории и курсы'}
          </button>
        </div>

        <div className="w-fit min-w-full bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex gap-1 border-b border-gray-200 px-4 pt-4">
            {([
              { key: 'categories' as Tab, label: 'Категории', icon: <Tag size={15} />, count: categories.length },
              { key: 'courses' as Tab, label: 'Названия курсов', icon: <BookOpen size={15} />, count: courses.length },
              { key: 'document-validity' as Tab, label: 'Срок документа', icon: <Clock size={15} />, count: documentValidityRules.length },
              { key: 'companies' as Tab, label: 'Справочник компаний', icon: <Building2 size={15} />, count: companiesDirectory.length },
            ]).map(t => (
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
            ) : tab === 'document-validity' ? (
              <DocumentValidityTab
                items={documentValidityRules}
                search={documentRuleSearch}
                onSearchChange={setDocumentRuleSearch}
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
      emptyText="Нет категорий. Добавьте вручную или загрузите из Bitrix24."
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
      emptyText="Нет курсов. Добавьте вручную или загрузите из Bitrix24."
    />
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
                <button onClick={() => onDelete(item.id)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all">
                  <Trash2 size={13} />
                </button>
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
        Курсы и категории на этой вкладке подтягиваются автоматически из вкладок `Названия курсов` и `Категории`.
        На этой вкладке данные отображаются только для просмотра.
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
        <div className="text-center py-10 text-sm text-gray-400">Нет правил. Добавьте курсы и категории в соседних вкладках.</div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Курс</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Категория</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип документа</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Срок</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => {
                  return (
                    <tr key={item.id} className="border-b border-gray-100 last:border-b-0">
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
  const MIN_TABLE_WIDTH = 1220;
  const MIN_TABLE_HEIGHT = 380;
  const DEFAULT_TABLE_HEIGHT = 540;
  const MAX_TABLE_WIDTH = 2600;

  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [tableWidth, setTableWidth] = useState(MIN_TABLE_WIDTH);
  const [tableHeight, setTableHeight] = useState(DEFAULT_TABLE_HEIGHT);
  const resizeStateRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);

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

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!resizeStateRef.current) return;
      const { startX, startY, startWidth, startHeight } = resizeStateRef.current;
      const widthDelta = e.clientX - startX;
      const heightDelta = e.clientY - startY;
      const maxHeight = Math.max(MIN_TABLE_HEIGHT, Math.floor(window.innerHeight * 0.78));
      setTableWidth(Math.min(MAX_TABLE_WIDTH, Math.max(MIN_TABLE_WIDTH, startWidth + widthDelta)));
      setTableHeight(Math.min(maxHeight, Math.max(MIN_TABLE_HEIGHT, startHeight + heightDelta)));
    }

    function stopResize() {
      resizeStateRef.current = null;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
    };
  }, []);

  function startResize(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    resizeStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: tableWidth,
      startHeight: tableHeight,
    };
  }

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
          width: tableWidth,
          minWidth: '100%',
          height: tableHeight,
          minHeight: MIN_TABLE_HEIGHT,
          maxHeight: '78vh',
        }}
      >
        <div className="w-full flex-1 overflow-auto">
          <table className="w-full text-sm min-w-[1220px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
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
              {pagedRows.map(row => (
                <tr key={row.id} className="border-b last:border-b-0 border-gray-100">
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

        <button
          type="button"
          onPointerDown={startResize}
          className="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm border border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:border-gray-300"
          aria-label="Изменить размер таблицы"
          title="Потяните, чтобы изменить размер"
        >
          <span className="block text-[10px] leading-none">::</span>
        </button>
        <div className="border-t border-gray-100 px-3 py-2 pr-8 flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500">
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


