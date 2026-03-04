import { useEffect, useState } from 'react';
import { RefreshCw, Plus, Trash2, BookOpen, Tag, Save } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import { supabase } from '../lib/supabase';
import { fetchCoursesFromFields, fetchCategoryValues, findSmartProcessEntityTypeId } from '../lib/bitrix';
import { useToast } from '../context/ToastContext';

type Tab = 'categories' | 'courses';

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
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    const [catRes, courseRes] = await Promise.all([
      supabase.from('ref_categories').select('*').order('sort_order').order('name'),
      supabase.from('ref_courses').select('*').order('sort_order').order('name'),
    ]);
    setCategories(catRes.data || []);
    setCourses(courseRes.data || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function syncFromBitrix() {
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

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('ref_categories').insert({
      name: newCategoryName.trim(),
      bitrix_value: newCategoryName.trim(),
      sort_order: categories.length + 1,
    });
    if (error) showToast('error', 'Такая категория уже существует');
    else { setNewCategoryName(''); await loadData(); }
    setSaving(false);
  }

  async function addCourse() {
    if (!newCourseName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('ref_courses').insert({
      name: newCourseName.trim(),
      bitrix_value: newCourseName.trim(),
      sort_order: courses.length + 1,
    });
    if (error) showToast('error', 'Такой курс уже существует');
    else { setNewCourseName(''); await loadData(); }
    setSaving(false);
  }

  async function deleteCategory(id: string) {
    await supabase.from('ref_categories').delete().eq('id', id);
    await loadData();
  }

  async function deleteCourse(id: string) {
    await supabase.from('ref_courses').delete().eq('id', id);
    await loadData();
  }

  async function updateCategoryName(id: string, name: string) {
    await supabase.from('ref_categories').update({ name, bitrix_value: name, updated_at: new Date().toISOString() }).eq('id', id);
    setCategories(prev => prev.map(c => c.id === id ? { ...c, name, bitrix_value: name } : c));
  }

  async function updateCourseName(id: string, name: string) {
    await supabase.from('ref_courses').update({ name, bitrix_value: name, updated_at: new Date().toISOString() }).eq('id', id);
    setCourses(prev => prev.map(c => c.id === id ? { ...c, name, bitrix_value: name } : c));
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Анкеты', to: '/dashboard' }, { label: 'Справочник' }]}>
      <div className="max-w-4xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Справочник</h1>
            <p className="text-sm text-gray-500 mt-1">Категории сотрудников и названия курсов, используемые в анкетах</p>
          </div>
          <button
            onClick={syncFromBitrix}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Загрузка...' : 'Обновить данные с Битрикс24'}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex gap-1 border-b border-gray-200 px-4 pt-4">
            {([
              { key: 'categories' as Tab, label: 'Категории', icon: <Tag size={15} />, count: categories.length },
              { key: 'courses' as Tab, label: 'Названия курсов', icon: <BookOpen size={15} />, count: courses.length },
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
            ) : (
              <CourseTab
                items={courses}
                newName={newCourseName}
                setNewName={setNewCourseName}
                onAdd={addCourse}
                onDelete={deleteCourse}
                onUpdate={updateCourseName}
                saving={saving}
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
      placeholder="Например: ИТР"
      emptyText="Нет категорий. Добавьте вручную или загрузите из Битрикс24."
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
      placeholder="Например: Промышленная безопасность"
      emptyText="Нет курсов. Добавьте вручную или загрузите из Битрикс24."
    />
  );
}

interface ItemListProps extends TabProps {
  placeholder: string;
  emptyText: string;
}

function ItemList({ items, newName, setNewName, onAdd, onDelete, onUpdate, saving, placeholder, emptyText }: ItemListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  function startEdit(item: RefItem) {
    setEditing(item.id);
    setEditValue(item.name);
  }

  function commitEdit(id: string) {
    if (editValue.trim()) {
      onUpdate(id, editValue.trim());
    }
    setEditing(null);
  }

  return (
    <div className="space-y-4">
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

      {items.length === 0 ? (
        <div className="text-center py-10 text-sm text-gray-400">{emptyText}</div>
      ) : (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 group transition-all">
              <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{idx + 1}</span>
              {editing === item.id ? (
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
                  className="flex-1 text-sm text-gray-800 cursor-pointer hover:text-blue-600"
                  onClick={() => startEdit(item)}
                >
                  {item.name}
                </span>
              )}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {editing !== item.id && (
                  <button
                    onClick={() => startEdit(item)}
                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                  >
                    <Save size={13} />
                  </button>
                )}
                <button
                  onClick={() => onDelete(item.id)}
                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                >
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
