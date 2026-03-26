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

const UI = {
  addError: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u0438\u044f',
  saveError: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f',
  uploadSuccess: '\u0424\u043e\u0442\u043e \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d\u043e',
  uploadError: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0444\u043e\u0442\u043e',
  empty: '\u2014',
  employees: '\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432',
  courses: '\u043a\u0443\u0440\u0441\u043e\u0432',
  requests: '\u0437\u0430\u044f\u0432\u043e\u043a \u043d\u0430 \u043a\u0443\u0440\u0441\u044b',
  pageShort: '\u0441\u0442\u0440.',
  of: '\u0438\u0437',
  rows: '\u0421\u0442\u0440\u043e\u043a:',
  num: '\u2116',
  photo: '\u0424\u043e\u0442\u043e',
  lastName: '\u0424\u0430\u043c\u0438\u043b\u0438\u044f',
  firstName: '\u0418\u043c\u044f',
  patronymic: '\u041e\u0442\u0447\u0435\u0441\u0442\u0432\u043e',
  position: '\u0414\u043e\u043b\u0436\u043d\u043e\u0441\u0442\u044c',
  category: '\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f',
  courseList: '\u041a\u0443\u0440\u0441\u044b',
  uploadPhoto: '\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0444\u043e\u0442\u043e',
  add: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c',
  searchCourse: '\u041f\u043e\u0438\u0441\u043a \u043a\u0443\u0440\u0441\u0430...',
  noCourses: '\u041d\u0435\u0442 \u043a\u0443\u0440\u0441\u043e\u0432',
  close: '\u0417\u0430\u043a\u0440\u044b\u0442\u044c',
  addEmployee: '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u0430',
  dot: '\u00b7',
  ellipsis: '\u2026',
  check: '\u2713 ',
} as const;

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
    if (error) {
      showToast('error', UI.addError);
      return;
    }
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
    if (error) showToast('error', UI.saveError);
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
      await supabase
        .from('participants')
        .update({ photo_url: url, updated_at: new Date().toISOString() })
        .eq('id', uploadTargetId.current);
      showToast('success', UI.uploadSuccess);
      onRefresh();
    } catch {
      showToast('error', UI.uploadError);
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
      await supabase.from('participant_courses').insert({
        participant_id: participantId,
        questionnaire_id: questionnaireId,
        course_name: courseName,
      });
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
          onKeyDown={e => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') setEditCell(null);
          }}
          className="w-full rounded border border-blue-400 bg-blue-50 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          disabled={saving}
        />
      );
    }

    return (
      <div
        className="min-h-[32px] cursor-pointer rounded-lg px-2 py-1.5 text-sm text-gray-800 transition-all hover:bg-blue-50 hover:ring-1 hover:ring-blue-200"
        onClick={() => startEdit(p.id, field, value)}
      >
        {value || <span className="text-gray-300">{UI.empty}</span>}
      </div>
    );
  }

  const filteredCourses = useMemo(
    () => availableCourses.filter(c => c.toLowerCase().includes(courseSearch.toLowerCase())),
    [availableCourses, courseSearch]
  );

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />

      <div className="mb-3 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-700">{participants.length} {UI.employees}</span>
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-green-700">{totalCourses} {UI.courses}</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700">{totalCourseRequests} {UI.requests}</span>
          {totalPages > 1 && (
            <span className="text-gray-400">{UI.dot} {UI.pageShort} {currentPage} {UI.of} {totalPages}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{UI.rows}</span>
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {[10, 20, 40, 50, 100, 200].map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ResizableTableContainer>
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/80">
              <th className="w-14 bg-gray-50/80 px-4 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-600">{UI.num}</th>
              <th className="w-20 bg-gray-50/80 px-4 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-600">{UI.photo}</th>
              <SortableHeader label={UI.lastName} sortKey="last_name" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label={UI.firstName} sortKey="first_name" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label={UI.patronymic} sortKey="patronymic" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label={UI.position} sortKey="position" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label={UI.category} sortKey="category" sortConfig={sortConfig} onSort={handleSort} />
              <th className="min-w-[280px] px-4 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-600">{UI.courseList}</th>
              <th className="w-10 px-4 py-4" />
            </tr>
          </thead>
          <tbody>
            {paged.map((p, index) => (
              <tr key={p.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50/70">
                <td className="px-4 py-3 text-sm font-medium text-gray-500">
                  {(currentPage - 1) * pageSize + index + 1}
                </td>
                <td className="px-4 py-3">
                  <div className="relative h-12 w-12 flex-shrink-0">
                    {p.photo_url ? (
                      <img src={p.photo_url} alt="" className="h-12 w-12 rounded-xl border border-gray-200 object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-gray-100">
                        <span className="text-xs text-gray-400">{UI.photo}</span>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        uploadTargetId.current = p.id;
                        fileInputRef.current?.click();
                      }}
                      disabled={uploadingId === p.id}
                      className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 transition-colors hover:bg-blue-700"
                      title={UI.uploadPhoto}
                    >
                      {uploadingId === p.id ? (
                        <div className="h-2.5 w-2.5 animate-spin rounded-full border border-white border-t-transparent" />
                      ) : (
                        <Upload size={9} className="text-white" />
                      )}
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
                    <div className="flex min-h-[24px] flex-wrap gap-1">
                      {(p.courses || []).map(c => (
                        <span
                          key={c.course_name}
                          className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                        >
                          {c.course_name}
                          <button
                            onClick={() => toggleCourse(p.id, c.course_name, p.courses || [])}
                            className="transition-colors hover:text-red-500"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      <button
                        onClick={() => {
                          setCourseEditing(courseEditing === p.id ? null : p.id);
                          setCourseSearch('');
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-500 transition-all hover:border-blue-400 hover:text-blue-600"
                      >
                        <Plus size={10} /> {UI.add}
                      </button>
                    </div>
                    {courseEditing === p.id && (
                      <div className="absolute left-0 top-8 z-20 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                        <input
                          autoFocus
                          value={courseSearch}
                          onChange={e => setCourseSearch(e.target.value)}
                          placeholder={UI.searchCourse}
                          className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="max-h-48 space-y-0.5 overflow-y-auto">
                          {filteredCourses.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-gray-400">{UI.noCourses}</div>
                          ) : (
                            filteredCourses.map(course => {
                              const selected = (p.courses || []).some(c => c.course_name === course);
                              return (
                                <button
                                  key={course}
                                  onClick={() => {
                                  void toggleCourse(p.id, course, p.courses || []);
                                }}
                                className={`w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                                  selected ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                  {selected ? UI.check : ''}
                                  {course}
                                </button>
                              );
                            })
                          )}
                        </div>
                        <button
                          onClick={() => setCourseEditing(null)}
                          className="mt-2 w-full py-1 text-xs text-gray-500 transition-colors hover:text-gray-700"
                        >
                          {UI.close}
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => deleteParticipant(p.id)}
                    className="rounded-lg p-1.5 text-gray-300 transition-all hover:bg-red-50 hover:text-red-500"
                  >
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
            {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, sorted.length)} {UI.of} {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-all hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, i, arr) => (
                <span key={p} className="flex items-center">
                  {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-xs text-gray-400">{UI.ellipsis}</span>}
                  <button
                    onClick={() => setCurrentPage(p)}
                    className={`h-8 w-8 rounded-lg text-xs transition-all ${
                      currentPage === p ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-gray-200 p-1.5 text-gray-500 transition-all hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={addParticipant}
        className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-600"
      >
        <Plus size={15} /> {UI.addEmployee}
      </button>
    </div>
  );
}
