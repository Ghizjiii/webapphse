import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, HelpCircle, Plus, Trash2, Upload, X } from 'lucide-react';
import SortableHeader from './SortableHeader';
import ResizableTableContainer from './ResizableTableContainer';
import { supabase } from '../lib/supabase';
import { uploadPhoto } from '../lib/cloudinary';
import { getParticipantDisplayName } from '../lib/participantName';
import { parseParticipantImportFile } from '../lib/participantImport';
import { PARTICIPANT_IMPORT_HELP_URL, PARTICIPANT_IMPORT_TEMPLATE_URL } from '../lib/participantImportAssets';
import {
  DEFAULT_ELECTRICAL_SAFETY_GROUPS,
  NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP,
  buildPreviousElectricalSafetyGroupOptions,
  isElectricalSafetyCourse,
  normalizePreviousElectricalSafetyGroup,
} from '../lib/electricalSafety';
import { useToast } from '../context/ToastContext';
import type { Participant, ParticipantCourse, SortConfig } from '../types';
import PhotoCropModal from './PhotoCropModal';

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
    const aVal = cfg.key === 'full_name'
      ? getParticipantDisplayName(a)
      : String((a as unknown as Record<string, unknown>)[cfg.key] ?? '');
    const bVal = cfg.key === 'full_name'
      ? getParticipantDisplayName(b)
      : String((b as unknown as Record<string, unknown>)[cfg.key] ?? '');
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
  importButton: '\u0418\u043c\u043f\u043e\u0440\u0442',
  importSuccess: '\u0418\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u043e \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432',
  importError: '\u041e\u0448\u0438\u0431\u043a\u0430 \u0438\u043c\u043f\u043e\u0440\u0442\u0430',
  empty: '\u2014',
  employees: '\u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432',
  courses: '\u043a\u0443\u0440\u0441\u043e\u0432',
  requests: '\u0437\u0430\u044f\u0432\u043e\u043a \u043d\u0430 \u043a\u0443\u0440\u0441\u044b',
  pageShort: '\u0441\u0442\u0440.',
  of: '\u0438\u0437',
  rows: '\u0421\u0442\u0440\u043e\u043a:',
  num: '\u2116',
  photo: '\u0424\u043e\u0442\u043e',
  fullName: '\u0424\u0418\u041e',
  email: 'Email \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0430',
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
  const [importing, setImporting] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [photoCropRequest, setPhotoCropRequest] = useState<{ participantId: string; file: File } | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; title: string } | null>(null);
  const [courseEditing, setCourseEditing] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [referenceCategories, setReferenceCategories] = useState<string[]>([]);
  const [electricalSafetyGroups, setElectricalSafetyGroups] = useState<string[]>(buildPreviousElectricalSafetyGroupOptions(DEFAULT_ELECTRICAL_SAFETY_GROUPS));
  const [localParticipants, setLocalParticipants] = useState<Participant[]>(participants);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);
  const lastResumeRefreshAtRef = useRef(0);

  function handleSort(key: string) {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  }

  useEffect(() => {
    setLocalParticipants(participants);
  }, [participants]);

  function applyParticipantPatch(participantId: string, patch: Partial<Participant>) {
    setLocalParticipants(prev => prev.map(participant => (
      participant.id === participantId
        ? { ...participant, ...patch }
        : participant
    )));
  }

  const sorted = useMemo(() => sortParticipants(localParticipants, sortConfig), [localParticipants, sortConfig]);
  const totalCourses = useMemo(
    () => [...new Set(localParticipants.flatMap(p => (p.courses || []).map(c => c.course_name)))].length,
    [localParticipants]
  );
  const totalCourseRequests = useMemo(
    () => localParticipants.reduce((sum, p) => sum + (p.courses || []).length, 0),
    [localParticipants]
  );
  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = useMemo(() => sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize), [sorted, currentPage, pageSize]);

  async function addParticipant() {
    const { error } = await supabase.from('participants').insert({
      questionnaire_id: questionnaireId,
      company_id: companyId,
      full_name: '',
      last_name: '',
      first_name: '',
      patronymic: '',
      email: '',
      position: '',
      category: '',
      photo_url: '',
      sort_order: localParticipants.length,
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
    setLocalParticipants(prev => prev.filter(participant => participant.id !== id));
    onRefresh();
  }

  function startEdit(participantId: string, field: string, value: string) {
    setEditCell({ participantId, field });
    setEditValue(value);
  }

  async function saveEdit() {
    if (!editCell) return;
    const currentCell = editCell;
    const currentParticipant = localParticipants.find(participant => participant.id === currentCell.participantId) || null;
    const previousValue = currentParticipant
      ? currentCell.field === 'full_name'
        ? getParticipantDisplayName(currentParticipant)
        : String((currentParticipant as unknown as Record<string, unknown>)[currentCell.field] ?? '')
      : '';
    const optimisticPatch = currentCell.field === 'full_name'
      ? { full_name: editValue } as Partial<Participant>
      : { [currentCell.field]: editValue } as Partial<Participant>;

    applyParticipantPatch(currentCell.participantId, optimisticPatch);
    setSaving(true);
    const { error } = await supabase
      .from('participants')
      .update({ ...optimisticPatch, updated_at: new Date().toISOString() })
      .eq('id', currentCell.participantId);
    if (error) {
      showToast('error', UI.saveError);
      applyParticipantPatch(
        currentCell.participantId,
        currentCell.field === 'full_name'
          ? { full_name: previousValue } as Partial<Participant>
          : { [currentCell.field]: previousValue } as Partial<Participant>,
      );
    }
    setSaving(false);
    setEditCell(null);
    onRefresh();
  }

  async function saveParticipantPatch(participantId: string, patch: Partial<Participant>) {
    const previousParticipant = localParticipants.find(participant => participant.id === participantId) || null;
    applyParticipantPatch(participantId, patch);
    setSaving(true);
    const { error } = await supabase
      .from('participants')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', participantId);
    if (error) {
      showToast('error', UI.saveError);
      if (previousParticipant) {
        setLocalParticipants(prev => prev.map(participant => (
          participant.id === participantId ? previousParticipant : participant
        )));
      }
    }
    setSaving(false);
    onRefresh();
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadTargetId.current) return;
    setPhotoCropRequest({ participantId: uploadTargetId.current, file });
    uploadTargetId.current = null;
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function uploadCroppedPhoto(participantId: string, file: File) {
    setUploadingId(participantId);
    try {
      const url = await uploadPhoto(file);
      applyParticipantPatch(participantId, { photo_url: url });
      await supabase
        .from('participants')
        .update({ photo_url: url, updated_at: new Date().toISOString() })
        .eq('id', participantId);
      showToast('success', UI.uploadSuccess);
      onRefresh();
    } catch {
      showToast('error', UI.uploadError);
    } finally {
      setUploadingId(null);
    }
  }

  async function handleParticipantsImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setSaving(true);
    try {
      const result = await parseParticipantImportFile(file, availableCourses);
      if (result.rows.length === 0) {
        showToast('error', result.warnings[0] || UI.importError);
        return;
      }

      for (let index = 0; index < result.rows.length; index++) {
        const row = result.rows[index];
        const { data: participant, error: participantError } = await supabase
          .from('participants')
          .insert({
            questionnaire_id: questionnaireId,
            company_id: companyId,
            full_name: row.full_name,
            last_name: '',
            first_name: '',
            patronymic: '',
            email: row.email,
            position: row.position,
            category: row.category,
            photo_url: '',
            sort_order: localParticipants.length + index,
          })
          .select()
          .maybeSingle();

        if (participantError) throw participantError;

        const participantId = String((participant as { id?: string } | null)?.id || '');
        if (participantId && row.courses.length > 0) {
          const { error: coursesError } = await supabase.from('participant_courses').insert(
            row.courses.map(course => ({
              participant_id: participantId,
              questionnaire_id: questionnaireId,
              course_name: course,
              previous_electrical_safety_group: isElectricalSafetyCourse(course) ? NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP : '',
            }))
          );
          if (coursesError) throw coursesError;
        }
      }

      showToast(
        'success',
        `${UI.importSuccess}: ${result.rows.length}${result.warnings.length > 0 ? `. ${result.warnings.slice(0, 2).join(' ')}` : ''}`
      );
      onRefresh();
    } catch {
      showToast('error', UI.importError);
    } finally {
      setSaving(false);
      setImporting(false);
      e.currentTarget.value = '';
    }
  }

  async function toggleCourse(participantId: string, courseName: string, currentCourses: ParticipantCourse[]) {
    const exists = currentCourses.find(c => c.course_name === courseName);
    const previousParticipant = localParticipants.find(participant => participant.id === participantId) || null;
    const nextCourses = exists
      ? currentCourses.filter(course => course.course_name !== courseName)
      : [
          ...currentCourses,
          {
            participant_id: participantId,
            questionnaire_id: questionnaireId,
            course_name: courseName,
            previous_electrical_safety_group: isElectricalSafetyCourse(courseName) ? NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP : '',
          },
        ];
    applyParticipantPatch(participantId, { courses: nextCourses } as Partial<Participant>);

    if (exists) {
      const { error } = await supabase.from('participant_courses').delete().eq('participant_id', participantId).eq('course_name', courseName);
      if (error && previousParticipant) {
        setLocalParticipants(prev => prev.map(participant => (
          participant.id === participantId ? previousParticipant : participant
        )));
      }
    } else {
      const { error } = await supabase.from('participant_courses').insert({
        participant_id: participantId,
        questionnaire_id: questionnaireId,
        course_name: courseName,
        previous_electrical_safety_group: isElectricalSafetyCourse(courseName) ? NO_PREVIOUS_ELECTRICAL_SAFETY_GROUP : '',
      });
      if (error && previousParticipant) {
        setLocalParticipants(prev => prev.map(participant => (
          participant.id === participantId ? previousParticipant : participant
        )));
      }
    }
    onRefresh();
  }

  async function loadReferenceCategories() {
    const { data } = await supabase
      .from('ref_categories')
      .select('name')
      .order('sort_order')
      .order('name');
    setReferenceCategories((data || []).map(item => String(item.name || '').trim()).filter(Boolean));
  }

  async function loadElectricalSafetyGroups() {
    const { data } = await supabase
      .from('ref_bitrix_list_items')
      .select('name')
      .eq('list_key', 'ELECTRICAL_SAFETY_GROUP')
      .order('sort_order')
      .order('name');
    const rows = (data || []).map(item => String(item.name || '').trim()).filter(Boolean);
    setElectricalSafetyGroups(buildPreviousElectricalSafetyGroupOptions(rows));
  }

  useEffect(() => {
    void loadReferenceCategories();
    void loadElectricalSafetyGroups();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadReferenceCategories();
    }, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastResumeRefreshAtRef.current < 5000) return;
      lastResumeRefreshAtRef.current = now;
      void loadReferenceCategories();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  async function updatePreviousElectricalSafetyGroup(participantId: string, courseName: string, value: string) {
    const normalized = normalizePreviousElectricalSafetyGroup(value);
    const previousParticipant = localParticipants.find(participant => participant.id === participantId) || null;
    setLocalParticipants(prev => prev.map(participant => (
      participant.id === participantId
        ? {
            ...participant,
            courses: (participant.courses || []).map(course => (
              course.course_name === courseName
                ? { ...course, previous_electrical_safety_group: normalized }
                : course
            )),
          }
        : participant
    )));

    const { error } = await supabase
      .from('participant_courses')
      .update({ previous_electrical_safety_group: normalized })
      .eq('participant_id', participantId)
      .eq('course_name', courseName);

    if (error && previousParticipant) {
      showToast('error', UI.saveError);
      setLocalParticipants(prev => prev.map(participant => (
        participant.id === participantId ? previousParticipant : participant
      )));
      return;
    }

    onRefresh();
  }

  const categoryOptions = useMemo(() => {
    const unique = new Set<string>();
    const result: string[] = [];
    const push = (value: string) => {
      const normalized = String(value || '').trim();
      if (!normalized) return;
      const key = normalized.toLocaleLowerCase('ru');
      if (unique.has(key)) return;
      unique.add(key);
      result.push(normalized);
    };

    if (referenceCategories.length > 0) {
      referenceCategories.forEach(push);
    } else {
      ['ИТР', 'Обычный'].forEach(push);
    }

    localParticipants.forEach(participant => push(participant.category));
    return result;
  }, [localParticipants, referenceCategories]);

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

  function CategoryCell({ participant }: { participant: Participant }) {
    return (
      <select
        value={participant.category || ''}
        onChange={event => {
          void saveParticipantPatch(participant.id, { category: event.target.value });
        }}
        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
        disabled={saving}
      >
        <option value="">{UI.empty}</option>
        {categoryOptions.map(category => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    );
  }

  const filteredCourses = useMemo(
    () => availableCourses.filter(c => c.toLowerCase().includes(courseSearch.toLowerCase())),
    [availableCourses, courseSearch]
  );

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={handlePhotoUpload}
      />
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-2xl rounded-2xl bg-white p-4 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-gray-500 shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-800"
              title={UI.close}
            >
              <X size={20} />
            </button>
            <div className="mb-3 pr-10 text-sm font-semibold text-gray-900">{previewPhoto.title}</div>
            <div className="flex max-h-[78vh] items-center justify-center overflow-hidden rounded-xl bg-gray-50">
              <img src={previewPhoto.url} alt="" className="max-h-[78vh] w-auto max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}
      {photoCropRequest && (
        <PhotoCropModal
          file={photoCropRequest.file}
          onCancel={() => setPhotoCropRequest(null)}
          onConfirm={async file => {
            const participantId = photoCropRequest.participantId;
            setPhotoCropRequest(null);
            await uploadCroppedPhoto(participantId, file);
          }}
        />
      )}
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.tsv"
        className="hidden"
        onChange={handleParticipantsImport}
      />

      <div className="mb-3 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-blue-700">{localParticipants.length} {UI.employees}</span>
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-green-700">{totalCourses} {UI.courses}</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700">{totalCourseRequests} {UI.requests}</span>
          {totalPages > 1 && (
            <span className="text-gray-400">{UI.dot} {UI.pageShort} {currentPage} {UI.of} {totalPages}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={PARTICIPANT_IMPORT_TEMPLATE_URL}
            download
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            title="Скачать Excel-шаблон"
          >
            <Download size={13} />
            Пример
          </a>
          <a
            href={PARTICIPANT_IMPORT_HELP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            title="Инструкция по импорту"
          >
            <HelpCircle size={15} />
          </a>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importing || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            title="Excel/CSV"
          >
            {importing ? (
              <div className="h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
            ) : (
              <Upload size={13} />
            )}
            {UI.importButton}
          </button>
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

      <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
        Курсы в Excel можно не заполнять. После импорта списка сотрудников выберите нужные курсы в таблице. Если заполняете курсы в файле, разделяйте несколько названий точкой с запятой: БиОТ; ПТМ.
      </div>

      <ResizableTableContainer>
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50/80">
              <th className="sticky left-0 z-20 w-14 bg-gray-50 px-4 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-600">{UI.num}</th>
              <th className="sticky left-14 z-20 w-20 bg-gray-50 px-4 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-600">{UI.photo}</th>
              <SortableHeader label={UI.fullName} sortKey="full_name" sortConfig={sortConfig} onSort={handleSort} className="sticky left-[136px] z-20 min-w-[240px] bg-gray-50 shadow-[1px_0_0_rgba(229,231,235,1)]" />
              <SortableHeader label={UI.email} sortKey="email" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label={UI.position} sortKey="position" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label={UI.category} sortKey="category" sortConfig={sortConfig} onSort={handleSort} />
              <th className="min-w-[280px] px-4 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-600">{UI.courseList}</th>
              <th className="w-10 px-4 py-4" />
            </tr>
          </thead>
          <tbody>
            {paged.map((p, index) => (
              <tr key={p.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50/70">
                <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-gray-500">
                  {(currentPage - 1) * pageSize + index + 1}
                </td>
                <td className="sticky left-14 z-10 bg-white px-4 py-3">
                  <div className="relative h-12 w-12 flex-shrink-0">
                    {p.photo_url ? (
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto({ url: p.photo_url, title: getParticipantDisplayName(p) || UI.photo })}
                        className="block h-12 w-12 overflow-hidden rounded-xl border border-gray-200 transition-all hover:border-blue-300 hover:ring-2 hover:ring-blue-100"
                        title="\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0444\u043e\u0442\u043e"
                      >
                        <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                      </button>
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
                <td className="sticky left-[136px] z-10 bg-white px-4 py-3 shadow-[1px_0_0_rgba(229,231,235,1)]"><EditableCell p={p} field="full_name" value={getParticipantDisplayName(p)} /></td>
                <td className="px-4 py-3"><EditableCell p={p} field="email" value={p.email || ''} /></td>
                <td className="px-4 py-3"><EditableCell p={p} field="position" value={p.position} /></td>
                <td className="px-4 py-3"><CategoryCell participant={p} /></td>
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
                    {(p.courses || []).some(course => isElectricalSafetyCourse(course.course_name)) && (
                      <div className="mt-2 space-y-2">
                        {(p.courses || [])
                          .filter(course => isElectricalSafetyCourse(course.course_name))
                          .map(course => (
                            <label key={`prev-${course.course_name}`} className="block rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2">
                              <span className="block text-[11px] font-medium leading-4 text-amber-800">
                                Имеющаяся группа электробезопасности
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] leading-4 text-amber-700" title={course.course_name}>
                                {course.course_name}
                              </span>
                              <select
                                value={normalizePreviousElectricalSafetyGroup(course.previous_electrical_safety_group)}
                                onChange={event => {
                                  void updatePreviousElectricalSafetyGroup(p.id, course.course_name, event.target.value);
                                }}
                                className="mt-1.5 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                disabled={saving}
                              >
                                {electricalSafetyGroups.map(group => (
                                  <option key={group} value={group}>{group}</option>
                                ))}
                              </select>
                            </label>
                          ))}
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
