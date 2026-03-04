import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, Upload, X, CheckCircle2, Shield, Users, Building2, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadPhoto } from '../lib/cloudinary';
import { fetchCoursesList } from '../lib/bitrix';
import ResizableTableContainer from '../components/ResizableTableContainer';
import type { Company, Participant } from '../types';

interface LocalParticipant {
  id: string;
  last_name: string;
  first_name: string;
  patronymic: string;
  position: string;
  category: string;
  courses: string[];
  photo_url: string;
  photoFile?: File;
  photoPreview?: string;
  uploading?: boolean;
}

interface ValidationErrors {
  company_name?: string;
  company_phone?: string;
  company_bin?: string;
  participants?: string;
}


export default function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const [linkStatus, setLinkStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'inactive' | 'submitted'>('loading');
  const [questionnaireId, setQuestionnaireId] = useState<string | null>(null);
  const [existingCompany, setExistingCompany] = useState<Company | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyBin, setCompanyBin] = useState('');
  const [companyCity, setCompanyCity] = useState('');

  const [participants, setParticipants] = useState<LocalParticipant[]>([newParticipant()]);
  const [availableCourses, setAvailableCourses] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [openCourseSelect, setOpenCourseSelect] = useState<string | null>(null);
  const [courseSearch, setCourseSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function newParticipant(): LocalParticipant {
    return {
      id: Math.random().toString(36).slice(2),
      last_name: '',
      first_name: '',
      patronymic: '',
      position: '',
      category: '',
      courses: [],
      photo_url: '',
    };
  }

  useEffect(() => {
    async function checkToken() {
      if (!token) { setLinkStatus('invalid'); return; }

      const { data, error } = await supabase
        .from('questionnaires')
        .select('id, is_active, expires_at, status')
        .eq('secret_token', token)
        .maybeSingle();

      if (error || !data) { setLinkStatus('invalid'); return; }
      if (data.status === 'submitted') { setLinkStatus('submitted'); return; }
      if (!data.is_active) { setLinkStatus('inactive'); return; }
      if (data.expires_at && new Date(data.expires_at) < new Date()) { setLinkStatus('expired'); return; }

      setQuestionnaireId(data.id);

      const { data: comp } = await supabase
        .from('companies')
        .select('*')
        .eq('questionnaire_id', data.id)
        .maybeSingle();

      if (comp) {
        setExistingCompany(comp);
        setCompanyName(comp.name || '');
        setCompanyPhone(comp.phone || '');
        setCompanyEmail(comp.email || '');
        setCompanyBin(comp.bin_iin || '');
        setCompanyCity(comp.city || '');
      }

      const { data: parts } = await supabase
        .from('participants')
        .select('*')
        .eq('questionnaire_id', data.id)
        .order('sort_order');

      if (parts && parts.length > 0) {
        const { data: pCourses } = await supabase
          .from('participant_courses')
          .select('*')
          .eq('questionnaire_id', data.id);

        setParticipants(parts.map((p: Participant) => ({
          id: p.id,
          last_name: p.last_name || '',
          first_name: p.first_name || '',
          patronymic: p.patronymic || '',
          position: p.position || '',
          category: p.category || '',
          courses: (pCourses || []).filter(c => c.participant_id === p.id).map((c: { course_name: string }) => c.course_name),
          photo_url: p.photo_url || '',
        })));
      }

      setLinkStatus('valid');
    }
    checkToken();

    supabase.from('ref_courses').select('name').order('sort_order').order('name').then(({ data }) => {
      if (data && data.length > 0) {
        setAvailableCourses(data.map(r => r.name));
      } else {
        fetchCoursesList().then(c => setAvailableCourses(c.length > 0 ? c : [
          'БиОТ', 'ПТМ', 'ПБ', 'Электробезопасность', 'Промышленная безопасность', 'Охрана труда',
        ]));
      }
    });

    supabase.from('ref_categories').select('name').order('sort_order').order('name').then(({ data }) => {
      if (data && data.length > 0) {
        setAvailableCategories(data.map(r => r.name));
      } else {
        setAvailableCategories(['ИТР', 'Обычный']);
      }
    });
  }, [token]);

  function validate(): boolean {
    const errs: ValidationErrors = {};
    if (!companyName.trim()) errs.company_name = 'Обязательное поле';
    if (!companyPhone.trim()) errs.company_phone = 'Обязательное поле';
    if (!companyBin.trim()) errs.company_bin = 'Обязательное поле';
    const hasEmpty = participants.some(p => !p.last_name.trim() && !p.first_name.trim());
    if (hasEmpty) errs.participants = 'Заполните хотя бы имя или фамилию для каждого сотрудника';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handlePhotoSelect(participantId: string, file: File) {
    const preview = URL.createObjectURL(file);
    setParticipants(ps => ps.map(p => p.id === participantId ? { ...p, photoFile: file, photoPreview: preview } : p));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !questionnaireId) return;
    setSubmitting(true);

    try {
      // Upsert company
      let companyId = existingCompany?.id;
      if (existingCompany) {
        await supabase.from('companies').update({
          name: companyName,
          phone: companyPhone,
          email: companyEmail,
          bin_iin: companyBin,
          city: companyCity,
          updated_at: new Date().toISOString(),
        }).eq('id', existingCompany.id);
      } else {
        const { data: newComp, error } = await supabase.from('companies').insert({
          questionnaire_id: questionnaireId,
          name: companyName,
          phone: companyPhone,
          email: companyEmail,
          bin_iin: companyBin,
          city: companyCity,
        }).select().maybeSingle();
        if (error) throw error;
        companyId = newComp?.id;
      }

      // Upload photos and save participants
      for (let i = 0; i < participants.length; i++) {
        const p = participants[i];

        let photoUrl = p.photo_url;
        if (p.photoFile) {
          setParticipants(ps => ps.map(pp => pp.id === p.id ? { ...pp, uploading: true } : pp));
          try {
            photoUrl = await uploadPhoto(p.photoFile);
          } catch { /* continue without photo */ }
          setParticipants(ps => ps.map(pp => pp.id === p.id ? { ...pp, uploading: false, photo_url: photoUrl } : pp));
        }

        // Check if participant already exists in DB
        const existingP = p.id.length === 36; // UUID format
        if (existingP) {
          await supabase.from('participants').update({
            last_name: p.last_name,
            first_name: p.first_name,
            patronymic: p.patronymic,
            position: p.position,
            category: p.category,
            photo_url: photoUrl,
            company_id: companyId,
            sort_order: i,
            updated_at: new Date().toISOString(),
          }).eq('id', p.id);
          // Update courses
          await supabase.from('participant_courses').delete().eq('participant_id', p.id);
          for (const course of p.courses) {
            await supabase.from('participant_courses').insert({
              participant_id: p.id,
              questionnaire_id: questionnaireId,
              course_name: course,
            });
          }
        } else {
          const { data: newPart } = await supabase.from('participants').insert({
            questionnaire_id: questionnaireId,
            company_id: companyId,
            last_name: p.last_name,
            first_name: p.first_name,
            patronymic: p.patronymic,
            position: p.position,
            category: p.category,
            photo_url: photoUrl,
            sort_order: i,
          }).select().maybeSingle();
          if (newPart) {
            for (const course of p.courses) {
              await supabase.from('participant_courses').insert({
                participant_id: newPart.id,
                questionnaire_id: questionnaireId,
                course_name: course,
              });
            }
          }
        }
      }

      // Mark as submitted
      await supabase.from('questionnaires').update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      }).eq('id', questionnaireId);

      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setErrors({ participants: 'Ошибка отправки. Попробуйте ещё раз.' });
    } finally {
      setSubmitting(false);
    }
  }

  function updateParticipant(id: string, field: keyof LocalParticipant, value: unknown) {
    setParticipants(ps => ps.map(p => p.id === id ? { ...p, [field]: value } : p));
  }

  function toggleCourse(participantId: string, course: string) {
    setParticipants(ps => ps.map(p => {
      if (p.id !== participantId) return p;
      const has = p.courses.includes(course);
      return { ...p, courses: has ? p.courses.filter(c => c !== course) : [...p.courses, course] };
    }));
  }

  const totalCourses = [...new Set(participants.flatMap(p => p.courses))].length;
  const totalCourseRequests = participants.reduce((sum, p) => sum + p.courses.length, 0);
  const filteredCourses = availableCourses.filter(c => c.toLowerCase().includes(courseSearch.toLowerCase()));
  const totalPages = Math.ceil(participants.length / pageSize);
  const pagedParticipants = participants.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (linkStatus === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (linkStatus === 'submitted' || submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Анкета отправлена!</h1>
          <p className="text-gray-500 leading-relaxed">
            Ваши данные успешно сохранены. Координатор свяжется с вами для подтверждения.
          </p>
        </div>
      </div>
    );
  }

  if (linkStatus === 'expired') {
    return <StatusPage icon="clock" title="Срок действия ссылки истёк" desc="Обратитесь к координатору для получения новой ссылки." />;
  }

  if (linkStatus === 'inactive') {
    return <StatusPage icon="lock" title="Ссылка деактивирована" desc="Данная ссылка была деактивирована. Обратитесь к координатору." />;
  }

  if (linkStatus === 'invalid') {
    return <StatusPage icon="error" title="Ссылка недействительна" desc="Проверьте правильность ссылки или обратитесь к координатору." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 py-10 px-4" onClick={() => setOpenCourseSelect(null)}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Регистрация на обучение</h1>
          <p className="text-slate-300 mt-2">Заполните форму для записи сотрудников на курсы</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Company block */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2.5">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <Building2 size={16} className="text-blue-600" />
              </div>
              Информация о компании
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Название компании <span className="text-red-500">*</span>
                </label>
                <input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="ТОО Компания"
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.company_name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {errors.company_name && <p className="text-xs text-red-500 mt-1">{errors.company_name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Номер телефона <span className="text-red-500">*</span>
                </label>
                <input
                  value={companyPhone}
                  onChange={e => setCompanyPhone(e.target.value)}
                  placeholder="+7 (777) 000-00-00"
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.company_phone ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {errors.company_phone && <p className="text-xs text-red-500 mt-1">{errors.company_phone}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Электронная почта</label>
                <input
                  type="email"
                  value={companyEmail}
                  onChange={e => setCompanyEmail(e.target.value)}
                  placeholder="info@company.kz"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  БИН/ИИН <span className="text-red-500">*</span>
                </label>
                <input
                  value={companyBin}
                  onChange={e => setCompanyBin(e.target.value)}
                  placeholder="123456789012"
                  className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.company_bin ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {errors.company_bin && <p className="text-xs text-red-500 mt-1">{errors.company_bin}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Город</label>
                <input
                  value={companyCity}
                  onChange={e => setCompanyCity(e.target.value)}
                  placeholder="Алматы"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Participants block */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Users size={16} className="text-blue-600" />
                </div>
                Список сотрудников
              </h2>
              <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium">
                  <Users size={13} /> {participants.length} сотрудников
                </span>
                <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium">
                  {totalCourses} курсов
                </span>
                <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full font-medium">
                  {totalCourseRequests} заявок на курсы
                </span>
                <div className="flex items-center gap-1.5">
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
            </div>

            {errors.participants && (
              <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {errors.participants}
              </div>
            )}

            <ResizableTableContainer>
              <table className="w-full" style={{ minWidth: '1100px' }}>
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-16">Фото</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-32">Фамилия</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-28">Имя</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-32">Отчество</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-36">Должность</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide w-36">Категория</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Курсы</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {pagedParticipants.map((p) => {
                    const idx = participants.findIndex(pp => pp.id === p.id);
                    return (
                    <tr key={p.id} className="border-b border-gray-50">
                      {/* Photo */}
                      <td className="px-6 py-3">
                        <div className="relative w-12 h-14 flex-shrink-0">
                          {p.photoPreview || p.photo_url ? (
                            <img src={p.photoPreview || p.photo_url} alt="" className="w-12 h-14 rounded-lg object-cover border border-gray-200" />
                          ) : (
                            <div className="w-12 h-14 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-0.5">
                              <Upload size={14} className="text-gray-400" />
                              <span className="text-gray-400 text-[9px]">Фото</span>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            ref={el => { fileInputRefs.current[p.id] = el; }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(p.id, f); }}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[p.id]?.click()}
                            disabled={p.uploading}
                            className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors"
                          >
                            {p.uploading
                              ? <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                              : <Upload size={9} className="text-white" />
                            }
                          </button>
                        </div>
                      </td>

                      {/* Text fields */}
                      {(['last_name', 'first_name', 'patronymic', 'position'] as const).map(field => (
                        <td key={field} className="px-4 py-3">
                          <input
                            value={p[field]}
                            onChange={e => updateParticipant(p.id, field, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all hover:border-gray-300"
                            placeholder="—"
                          />
                        </td>
                      ))}

                      {/* Category */}
                      <td className="px-4 py-3">
                        <div className="relative">
                          <select
                            value={p.category}
                            onChange={e => updateParticipant(p.id, 'category', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 appearance-none pr-8 bg-white"
                          >
                            <option value="">—</option>
                            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      </td>

                      {/* Courses */}
                      <td className="px-4 py-3">
                        <div className="relative" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1 min-h-[36px] p-1 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors cursor-pointer"
                            onClick={() => { setOpenCourseSelect(openCourseSelect === p.id ? null : p.id); setCourseSearch(''); }}
                          >
                            {p.courses.map(c => (
                              <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs border border-blue-100">
                                {c}
                                <button type="button" onClick={e => { e.stopPropagation(); toggleCourse(p.id, c); }} className="hover:text-red-500 transition-colors">
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                            {p.courses.length === 0 && (
                              <span className="text-xs text-gray-400 px-1 py-1">Выбрать курсы...</span>
                            )}
                          </div>

                          {openCourseSelect === p.id && (
                            <div className="absolute top-full mt-1 left-0 z-30 bg-white rounded-xl border border-gray-200 shadow-xl w-64 p-2">
                              <input
                                autoFocus
                                value={courseSearch}
                                onChange={e => setCourseSearch(e.target.value)}
                                placeholder="Поиск..."
                                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                onClick={e => e.stopPropagation()}
                              />
                              <div className="max-h-48 overflow-y-auto space-y-0.5">
                                {filteredCourses.map(course => {
                                  const sel = p.courses.includes(course);
                                  return (
                                    <button
                                      key={course}
                                      type="button"
                                      onClick={() => toggleCourse(p.id, course)}
                                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors ${sel ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                                    >
                                      {sel ? '✓ ' : ''}{course}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Delete */}
                      <td className="px-4 py-3">
                        {participants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setParticipants(ps => ps.filter((_, i) => i !== idx))}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </ResizableTableContainer>

            {totalPages > 1 && (
              <div className="px-6 pt-3 flex items-center justify-between text-sm">
                <span className="text-gray-500 text-xs">
                  {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, participants.length)} из {participants.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs disabled:opacity-40 hover:bg-gray-50 transition-all"
                  >
                    ←
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1).map((p, i, arr) => (
                    <span key={p}>
                      {i > 0 && arr[i - 1] !== p - 1 && <span className="px-1 text-gray-400">…</span>}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(p)}
                        className={`px-3 py-1.5 rounded-lg text-xs transition-all ${currentPage === p ? 'bg-blue-600 text-white' : 'border border-gray-200 hover:bg-gray-50'}`}
                      >
                        {p}
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs disabled:opacity-40 hover:bg-gray-50 transition-all"
                  >
                    →
                  </button>
                </div>
              </div>
            )}

            <div className="px-6 pt-4">
              <button
                type="button"
                onClick={() => {
                  setParticipants(ps => [...ps, newParticipant()]);
                  setCurrentPage(Math.ceil((participants.length + 1) / pageSize));
                }}
                className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all w-full justify-center"
              >
                <Plus size={16} /> Добавить ещё сотрудника
              </button>
            </div>
          </div>

          {/* Submit */}
          <div className="pb-6">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-2xl text-base transition-all shadow-lg flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Отправляем...
                </>
              ) : 'Отправить анкету'}
            </button>
            <p className="text-center text-slate-400 text-xs mt-3">
              После отправки данные будут переданы координатору обучения
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

function StatusPage({ icon, title, desc }: { icon: 'clock' | 'lock' | 'error'; title: string; desc: string }) {
  const icons = {
    clock: '⏰',
    lock: '🔒',
    error: '❌',
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-4">{icons[icon]}</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-gray-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
