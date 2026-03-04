import { useState, useMemo, useRef } from 'react';
import { Plus, Trash2, Upload, X, ChevronLeft, ChevronRight } from 'lucide-react';
import SortableHeader from './SortableHeader';
import ResizableTableContainer from './ResizableTableContainer';
import { supabase } from '../lib/supabase';
import { uploadPhoto } from '../lib/cloudinary';
import { useToast } from '../context/ToastContext';
import type { Participant, ParticipantCourse, SortConfig } from '../types';

interface Props {
  questionnaireId: string;
  companyId: string | null;
  participants: Participant[];
  availableCourses: string[];
  onRefresh: () => void;
}

function sortParticipants(list: Participant[], cfg: SortConfig | null): Participant[] {
  if (!cfg) return list;
  return [...list].sort((a, b) => {
    const aVal = String((a as unknown as Record<string, unknown>)[cfg.key] ?? '');
    const bVal = String((b as unknown as Record<string, unknown>)[cfg.key] ?? '');
    const cmp = aVal.localeCompare(bVal, 'ru');
    return cfg.direction === 'asc' ? cmp : -cmp;
  });
}

interface EditCell {
  participantId: string;
  field: string;
}

export default function ParticipantsTable({ questionnaireId, companyId, participants, availableCourses, onRefresh }: Props) {
  const { showToast } = useToast();
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [courseEditing, setCourseEditing] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  function handleSort(key: string) {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  }

  const sorted = useMemo(() => sortParticipants(participants, sortConfig), [participants, sortConfig]);
  const totalCourses = useMemo(
    () => [...new Set(participants.flatMap(p => (p.courses || []).map(c => c.course_name)))].length,
    [participants]
  );
  const totalCourseRequests = useMemo(
    () => participants.reduce((sum, p) => sum + (p.courses || []).length, 0),
    [participants]
  );
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = useMemo(() => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize), [sorted, currentPage, pageSize]);

  async function addParticipant() {
    const { error } = await supabase.from('participants').insert({
      questionnaire_id: questionnaireId,
      company_id: companyId,
      last_name: '',
      first_name: '',
      patronymic: '',
      position: '',
      category: '',
      photo_url: '',
      sort_order: participants.length,
    });
    if (error) { showToast('error', 'Ошибка добавления'); return; }
    onRefresh();
  }

  async function deleteParticipant(id: string) {
    await supabase.from('participant_courses').delete().eq('participant_id', id);
    await supabase.from('participants').delete().eq('id', id);
    onRefresh();
  }

  function startEdit(participantId: string, field: string, value: string) {
    setEditCell({ participantId, field });
    setEditValue(value);
  }

  async function saveEdit() {
    if (!editCell) return;
    setSaving(true);
    const { error } = await supabase
      .from('participants')
      .update({ [editCell.field]: editValue, updated_at: new Date().toISOString() })
      .eq('id', editCell.participantId);
    if (error) showToast('error', 'Ошибка сохранения');
    setSaving(false);
    setEditCell(null);
    onRefresh();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId.current) return;
    setUploadingId(uploadTargetId.current);
    try {
      const url = await uploadPhoto(file);
      await supabase.from('participants').update({ photo_url: url, updated_at: new Date().toISOString() }).eq('id', uploadTargetId.current);
      showToast('success', 'Фото загружено');
      onRefresh();
    } catch {
      showToast('error', 'Ошибка загрузки фото');
    } finally {
      setUploadingId(null);
      uploadTargetId.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function toggleCourse(participantId: string, courseName: string, currentCourses: ParticipantCourse[]) {
    const exists = currentCourses.find(c => c.course_name === courseName);
    if (exists) {
      await supabase.from('participant_courses').delete().eq('participant_id', participantId).eq('course_name', courseName);
    } else {
      await supabase.from('participant_courses').insert({ participant_id: participantId, questionnaire_id: questionnaireId, course_name: courseName });
    }
    onRefresh();
  }

  function EditableCell({ p, field, value }: { p: Participant; field: string; value: string }) {
    const isEditing = editCell?.participantId === p.id && editCell?.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditCell(null); }}
          className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50"
          disabled={saving}
        />
      );
    }
    return (
      <div
        className="px-2 py-1.5 rounded-lg cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[32px] text-sm text-gray-800"
        onClick={() => startEdit(p.id, field, value)}
      >
        {value || <span className="text-gray-300">—</span>}
      </div>
    );
  }

  const filteredCourses = useMemo(() =>
    availableCourses.filter(c => c.toLowerCase().includes(courseSearch.toLowerCase())),
    [availableCourses, courseSearch]
  );

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700">{participants.length} сотрудников</span>
          <span className="px-2.5 py-0.5 rounded-full bg-green-50 text-green-700">{totalCourses} курсов</span>
          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700">{totalCourseRequests} заявок на курсы</span>
          {totalPages > 1 && (
            <span className="text-gray-400">· стр. {currentPage} из {totalPages}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Строк:</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {[10, 20, 40, 50, 100, 200].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <ResizableTableContainer>
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200 sticky top-0 z-10">
              <th className="text-left px-4 py-4 font-medium text-gray-600 text-xs uppercase tracking-wider w-20 bg-gray-50/80">Фото</th>
              <SortableHeader label="Фамилия" sortKey="last_name" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label="Имя" sortKey="first_name" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label="Отчество" sortKey="patronymic" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label="Должность" sortKey="position" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label="Категория" sortKey="category" sortConfig={sortConfig} onSort={handleSort} />
              <th className="text-left px-4 py-4 font-medium text-gray-600 text-xs uppercase tracking-wider min-w-[280px]">Курсы</th>
              <th className="px-4 py-4 w-10" />
            </tr>
          </thead>
          <tbody>
            {paged.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50/70 transition-colors">
                <td className="px-4 py-3">
                  <div className="relative w-12 h-12 flex-shrink-0">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-gray-200" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center">
                        <span className="text-gray-400 text-xs">Фото</span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        uploadTargetId.current = p.id;
                        fileInputRef.current?.click();
                      }}
                      disabled={uploadingId === p.id}
                      className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors"
                      title="Загрузить фото"
                    >
                      {uploadingId === p.id
                        ? <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                        : <Upload size={9} className="text-white" />
                      }
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3"><EditableCell p={p} field="last_name" value={p.last_name} /></td>
                <td className="px-4 py-3"><EditableCell p={p} field="first_name" value={p.first_name} /></td>
                <td className="px-4 py-3"><EditableCell p={p} field="patronymic" value={p.patronymic} /></td>
                <td className="px-4 py-3"><EditableCell p={p} field="position" value={p.position} /></td>
                <td className="px-4 py-3"><EditableCell p={p} field="category" value={p.category} /></td>
                <td className="px-4 py-3">
                  <div className="relative">
                    <div className="flex flex-wrap gap-1 min-h-[24px]">
                      {(p.courses || []).map(c => (
                        <span key={c.course_name} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs border border-blue-100">
                          {c.course_name}
                          <button onClick={() => toggleCourse(p.id, c.course_name, p.courses || [])} className="hover:text-red-500 transition-colors">
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      <button
                        onClick={() => { setCourseEditing(courseEditing === p.id ? null : p.id); setCourseSearch(''); }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 rounded-full text-xs border border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-600 transition-all"
                      >
                        <Plus size={10} /> Добавить
                      </button>
                    </div>
                    {courseEditing === p.id && (
                      <div className="absolute top-8 left-0 z-20 bg-white rounded-xl border border-gray-200 shadow-xl w-64 p-2">
                        <input
                          autoFocus
                          value={courseSearch}
                          onChange={e => setCourseSearch(e.target.value)}
                          placeholder="Поиск курса..."
                          className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                          {filteredCourses.length === 0 ? (
                            <div className="text-xs text-gray-400 px-2 py-1">Нет курсов</div>
                          ) : filteredCourses.map(course => {
                            const selected = (p.courses || []).some(c => c.course_name === course);
                            return (
                              <button
                                key={course}
                                onClick={() => { toggleCourse(p.id, course, p.courses || []); }}
                                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${selected ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                              >
                                {selected ? '✓ ' : ''}{course}
                              </button>
                            );
                          })}
                        </div>
                        <button onClick={() => setCourseEditing(null)} className="w-full mt-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors">Закрыть</button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteParticipant(p.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ResizableTableContainer>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, sorted.length)} из {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-gray-200 rounded-lg text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-all"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, i, arr) => (
                <span key={p} className="flex items-center">
                  {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-xs text-gray-400">…</span>}
                  <button
                    onClick={() => setCurrentPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs transition-all ${currentPage === p ? 'bg-blue-600 text-white' : 'border border-gray-200 hover:bg-gray-50 text-gray-700'}`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-gray-200 rounded-lg text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={addParticipant}
        className="mt-4 flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
      >
        <Plus size={15} /> Добавить сотрудника
      </button>
    </div>
  );
}
