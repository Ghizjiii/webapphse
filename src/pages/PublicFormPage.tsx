import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Trash2, Upload, X, CheckCircle2, Shield, Users, Building2, ChevronDown, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { uploadPhoto, uploadPaymentOrder } from '../lib/cloudinary';
import { extractPaymentOrderFields } from '../lib/paymentOcr';
import { fetchCoursesList } from '../lib/bitrix';
import { logger } from '../lib/logger';
import ResizableTableContainer from '../components/ResizableTableContainer';
import type { Company, Participant, RefCompanyDirectory } from '../types';

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
  contract?: string;
  payment_order?: string;
  payment_order_number?: string;
  payment_order_date?: string;
  payment_order_amount?: string;
  participants?: string;
}

const DUPLICATE_PAYMENT_ORDER_ERROR =
  'Этот счет уже был загружен ранее для этой компании (BIN/ИИН, номер, дата и сумма совпадают). Загрузите другой счет.';


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
  const [directoryMatch, setDirectoryMatch] = useState<RefCompanyDirectory | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupTouched, setLookupTouched] = useState(false);
  const [companyCreateMode, setCompanyCreateMode] = useState(false);
  const [noContractConfirmed, setNoContractConfirmed] = useState(false);
  const [paymentOrderUrl, setPaymentOrderUrl] = useState('');
  const [paymentOrderName, setPaymentOrderName] = useState('');
  const [paymentOrderStorageBucket, setPaymentOrderStorageBucket] = useState('');
  const [paymentOrderStoragePath, setPaymentOrderStoragePath] = useState('');
  const [paymentOrderNumber, setPaymentOrderNumber] = useState('');
  const [paymentOrderDate, setPaymentOrderDate] = useState('');
  const [paymentOrderAmount, setPaymentOrderAmount] = useState('');
  const [paymentAutofillHint, setPaymentAutofillHint] = useState('');
  const [uploadingPaymentOrder, setUploadingPaymentOrder] = useState(false);
  const [paymentOrderStage, setPaymentOrderStage] = useState<'idle' | 'uploading' | 'recognizing' | 'checking' | 'done' | 'error'>('idle');
  const [paymentOrderDuplicate, setPaymentOrderDuplicate] = useState(false);
  const paymentOrderInputRef = useRef<HTMLInputElement | null>(null);

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

  function normalizeDigits(value: string): string {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizePaymentOrderNumber(value: string): string {
    const cleaned = String(value || '')
      .replace(/№/g, '')
      .trim()
      .replace(/\s+/g, ' ');
    // Keep one canonical numeric form so 0256 and 256 are treated as the same payment order.
    if (/^\d+$/.test(cleaned)) {
      return String(Number(cleaned));
    }
    return cleaned;
  }

  function isPaymentOrderDuplicateError(err: unknown): boolean {
    const e = err as { code?: string; message?: string; details?: string; hint?: string };
    const code = String(e?.code || '');
    const raw = `${String(e?.message || '')} ${String(e?.details || '')} ${String(e?.hint || '')}`.toLowerCase();
    if (code === '23505' && /payment_order|companies_payment_order|business_key|registry/.test(raw)) return true;
    return false;
  }

  function parsePaymentOrderAmount(value: string): number | null {
    const cleaned = String(value || '')
      .replace(/\s+/g, '')
      .replace(',', '.')
      .replace(/[^\d.]/g, '');
    if (!cleaned) return null;
    const num = Number(cleaned);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Math.round(num * 100) / 100;
  }

  async function checkPaymentOrderDuplicate(params: {
    companyBinDigits: string;
    paymentOrderNumber: string;
    paymentOrderDate: string;
    paymentOrderAmount: number;
    questionnaireId?: string | null;
  }): Promise<boolean> {
    if (!params.companyBinDigits || !params.paymentOrderNumber || !params.paymentOrderDate || !Number.isFinite(params.paymentOrderAmount)) {
      return false;
    }

    const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
    const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
    if (!supabaseUrl || !supabaseAnonKey) return false;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/check-payment-order-duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseAnonKey}`,
          Apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          company_bin: params.companyBinDigits,
          payment_order_number: params.paymentOrderNumber,
          payment_order_date: params.paymentOrderDate,
          payment_order_amount: params.paymentOrderAmount,
          questionnaire_id: params.questionnaireId || '',
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        logger.error('PublicFormPage', 'Duplicate check request failed', data);
        return false;
      }

      return Boolean((data as { duplicate?: boolean } | null)?.duplicate);
    } catch (error) {
      logger.error('PublicFormPage', 'Duplicate check request failed', error);
      return false;
    }
  }

  function applyDirectoryMatch(match: RefCompanyDirectory | null) {
    setDirectoryMatch(match);
    if (!match) {
      setNoContractConfirmed(false);
      return;
    }
    setCompanyName(match.name || '');
    setCompanyPhone(match.phone || '');
    setCompanyEmail(match.email || '');
    setCompanyCity(match.city || '');
    setNoContractConfirmed(false);
  }

  async function lookupCompanyByBin(value: string) {
    const digits = normalizeDigits(value);
    if (!digits) {
      setDirectoryMatch(null);
      setCompanyCreateMode(false);
      return;
    }
    setLookupLoading(true);
    try {
      const { data } = await supabase
        .from('ref_company_directory')
        .select('*')
        .eq('bin_iin_digits', digits)
        .order('contract_is_active', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      applyDirectoryMatch(data || null);
      setLookupTouched(true);
      setCompanyCreateMode(false);
    } finally {
      setLookupLoading(false);
    }
  }

  const hasActiveContract = Boolean(directoryMatch?.has_contract && directoryMatch?.contract_is_active);
  const canFillParticipants = directoryMatch
    ? (hasActiveContract || noContractConfirmed)
    : companyCreateMode;
  const lockCompanyFields = Boolean(directoryMatch) || !companyCreateMode;
  const paymentOrderAmountParsed = parsePaymentOrderAmount(paymentOrderAmount);
  const paymentOrderMetaReady = Boolean(
    normalizePaymentOrderNumber(paymentOrderNumber) &&
    paymentOrderDate.trim() &&
    paymentOrderAmountParsed !== null
  );
  const paymentOrderReady = Boolean(paymentOrderUrl) && paymentOrderMetaReady && !paymentOrderDuplicate;
  const canEditParticipants = canFillParticipants && paymentOrderReady;
  const paymentStagePercent = paymentOrderStage === 'uploading'
    ? 35
    : paymentOrderStage === 'recognizing'
      ? 70
      : paymentOrderStage === 'checking'
        ? 90
        : paymentOrderStage === 'done'
          ? 100
          : 0;
  const paymentStageLabel = paymentOrderStage === 'uploading'
    ? 'Идет загрузка файла...'
    : paymentOrderStage === 'recognizing'
      ? 'Идет распознавание документа...'
      : paymentOrderStage === 'checking'
        ? 'Проверяем дубликаты платежного поручения...'
        : paymentOrderStage === 'done'
          ? 'Файл загружен и обработан.'
          : paymentOrderStage === 'error'
            ? 'Не удалось загрузить или распознать документ.'
            : '';

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
        setNoContractConfirmed(Boolean(comp.no_contract_confirmed));
        setPaymentOrderUrl(comp.payment_order_url || '');
        setPaymentOrderName(comp.payment_order_name || '');
        setPaymentOrderStorageBucket(String(comp.payment_order_storage_bucket || ''));
        setPaymentOrderStoragePath(String(comp.payment_order_storage_path || ''));
        setPaymentOrderNumber(String(comp.payment_order_number || ''));
        setPaymentOrderDate(String(comp.payment_order_date || ''));
        setPaymentOrderAmount(
          typeof comp.payment_order_amount === 'number'
            ? String(comp.payment_order_amount)
            : ''
        );
        if (comp.source_ref_company_id) {
          const { data: refCompany } = await supabase
            .from('ref_company_directory')
            .select('*')
            .eq('id', comp.source_ref_company_id)
            .maybeSingle();
          if (refCompany) setDirectoryMatch(refCompany);
        }
        if (!comp.source_ref_company_id) {
          setCompanyCreateMode(true);
        }
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
      if (comp?.bin_iin) {
        void lookupCompanyByBin(comp.bin_iin);
      }
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
    if (!directoryMatch && !companyCreateMode) errs.company_bin = 'Нажмите "Создать компанию", чтобы продолжить без совпадения в справочнике.';
    if (!companyName.trim()) errs.company_name = 'Обязательное поле';
    if (!companyPhone.trim()) errs.company_phone = 'Обязательное поле';
    if (!companyBin.trim()) errs.company_bin = 'Обязательное поле';
    if (!canFillParticipants) errs.contract = 'Нет активного договора. Подтвердите "Нет договора", чтобы заполнить форму вручную.';
    const amountParsed = parsePaymentOrderAmount(paymentOrderAmount);
    if (!paymentOrderUrl) errs.payment_order = 'Загрузите файл платежного поручения.';
    if (!normalizePaymentOrderNumber(paymentOrderNumber)) errs.payment_order_number = 'Укажите номер платежного поручения.';
    if (!paymentOrderDate.trim()) errs.payment_order_date = 'Укажите дату оплаты.';
    if (amountParsed === null) errs.payment_order_amount = 'Укажите корректную сумму оплаты.';
    if (paymentOrderDuplicate) errs.payment_order = DUPLICATE_PAYMENT_ORDER_ERROR;
    const hasEmpty = participants.some(p => !p.last_name.trim() && !p.first_name.trim());
    if (canEditParticipants && hasEmpty) errs.participants = 'Заполните хотя бы имя или фамилию для каждого сотрудника';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handlePhotoSelect(participantId: string, file: File) {
    const preview = URL.createObjectURL(file);
    setParticipants(ps => ps.map(p => p.id === participantId ? { ...p, photoFile: file, photoPreview: preview } : p));
  }

  async function handlePaymentOrderSelect(file: File) {
    setUploadingPaymentOrder(true);
    setPaymentOrderStage('uploading');
    setPaymentAutofillHint('');
    setPaymentOrderDuplicate(false);
    setErrors(prev => ({ ...prev, payment_order: undefined }));
    try {
      const uploaded = await uploadPaymentOrder(file);
      setPaymentOrderStage('recognizing');
      setPaymentOrderUrl(uploaded.secure_url);
      setPaymentOrderName(file.name);
      setPaymentOrderStorageBucket(String(uploaded.storage_bucket || ''));
      setPaymentOrderStoragePath(String(uploaded.storage_path || ''));

      let extracted: {
        payment_order_number?: string;
        payment_order_date?: string;
        payment_order_amount?: string;
        payment_order_bin_iin?: string;
      } = {};
      let ocrErrorMessage = '';
      try {
        extracted = await extractPaymentOrderFields(file);
      } catch (ocrError) {
        ocrErrorMessage = ocrError instanceof Error ? ocrError.message : 'OCR extraction failed';
      }
      const nextNumber = normalizePaymentOrderNumber(String(extracted.payment_order_number || ''));
      const nextDate = String(extracted.payment_order_date || '').trim();
      const nextAmount = String(extracted.payment_order_amount || '').trim();
      const nextBin = normalizeDigits(String(extracted.payment_order_bin_iin || ''));

      if (!paymentOrderNumber && nextNumber) setPaymentOrderNumber(nextNumber);
      if (!paymentOrderDate && nextDate) setPaymentOrderDate(nextDate);
      if (!paymentOrderAmount && nextAmount) setPaymentOrderAmount(nextAmount);

      const found = [nextNumber ? 'номер' : '', nextDate ? 'дата' : '', nextAmount ? 'сумма' : ''].filter(Boolean);
      setPaymentAutofillHint(
        found.length > 0
          ? `Автозаполнение: найдено ${found.join(', ')}.`
          : ocrErrorMessage
            ? `Автозаполнение недоступно: ${ocrErrorMessage}`
            : 'Автозаполнение не нашло ключевые поля. Заполните номер, дату и сумму вручную.'
      );

      if (nextBin && normalizeDigits(companyBin) && nextBin !== normalizeDigits(companyBin)) {
        setErrors(prev => ({
          ...prev,
          payment_order: 'В документе найден БИН/ИИН, который не совпадает с введенным БИН/ИИН компании.',
        }));
      }

      const candidateNumber = normalizePaymentOrderNumber(nextNumber || paymentOrderNumber);
      const candidateDate = String(nextDate || paymentOrderDate || '').trim();
      const candidateAmount = parsePaymentOrderAmount(nextAmount || paymentOrderAmount);
      const candidateBin = normalizeDigits(companyBin);

      if (candidateNumber && candidateDate && candidateAmount !== null && candidateBin) {
        setPaymentOrderStage('checking');
        const isDuplicate = await checkPaymentOrderDuplicate({
          companyBinDigits: candidateBin,
          paymentOrderNumber: candidateNumber,
          paymentOrderDate: candidateDate,
          paymentOrderAmount: candidateAmount,
          questionnaireId,
        });

        if (isDuplicate) {
          setPaymentOrderDuplicate(true);
          setErrors(prev => ({
            ...prev,
            payment_order: DUPLICATE_PAYMENT_ORDER_ERROR,
          }));
        } else {
          setPaymentOrderDuplicate(false);
        }
      }
      setPaymentOrderStage('done');
    } catch (err) {
      logger.error('PublicFormPage', 'Payment order upload failed', err);
      setPaymentOrderStage('error');
      setErrors(prev => ({ ...prev, payment_order: 'Не удалось загрузить/прочитать платежное поручение' }));
    } finally {
      setUploadingPaymentOrder(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !questionnaireId) return;
    setSubmitting(true);

    try {
      const paymentOrderAmountValue = parsePaymentOrderAmount(paymentOrderAmount);
      const paymentOrderNumberValue = normalizePaymentOrderNumber(paymentOrderNumber);
      const paymentOrderDateValue = paymentOrderDate.trim() || null;
      const paymentBinDigits = normalizeDigits(companyBin);

      if (paymentOrderUrl && paymentOrderDateValue && paymentOrderAmountValue !== null && paymentOrderNumberValue) {
        const isDuplicate = await checkPaymentOrderDuplicate({
          companyBinDigits: paymentBinDigits,
          paymentOrderNumber: paymentOrderNumberValue,
          paymentOrderDate: paymentOrderDateValue,
          paymentOrderAmount: paymentOrderAmountValue,
          questionnaireId,
        });

        if (isDuplicate) {
          setPaymentOrderDuplicate(true);
          setErrors({
            payment_order: DUPLICATE_PAYMENT_ORDER_ERROR,
          });
          setSubmitting(false);
          return;
        }
      }

      // Upsert company
      let companyId = existingCompany?.id;
      if (existingCompany) {
        await supabase.from('companies').update({
          name: companyName,
          phone: companyPhone,
          email: companyEmail,
          bin_iin: companyBin,
          city: companyCity,
          source_ref_company_id: directoryMatch?.id || null,
          has_contract: Boolean(directoryMatch?.has_contract),
          contract_bitrix_id: directoryMatch?.contract_bitrix_id || '',
          contract_title: directoryMatch?.contract_title || '',
          contract_number: directoryMatch?.contract_number || '',
          contract_date: directoryMatch?.contract_date || null,
          contract_start: directoryMatch?.contract_start || null,
          contract_end: directoryMatch?.contract_end || null,
          contract_status: directoryMatch?.contract_status || '',
          contract_is_active: Boolean(directoryMatch?.contract_is_active),
          no_contract_confirmed: noContractConfirmed,
          payment_order_url: paymentOrderUrl || '',
          payment_order_name: paymentOrderName || '',
          payment_order_uploaded_at: paymentOrderUrl ? new Date().toISOString() : null,
          payment_order_storage_bucket: paymentOrderStorageBucket || '',
          payment_order_storage_path: paymentOrderStoragePath || '',
          payment_order_number: paymentOrderNumberValue || '',
          payment_order_date: paymentOrderDateValue,
          payment_order_amount: paymentOrderAmountValue,
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
          source_ref_company_id: directoryMatch?.id || null,
          has_contract: Boolean(directoryMatch?.has_contract),
          contract_bitrix_id: directoryMatch?.contract_bitrix_id || '',
          contract_title: directoryMatch?.contract_title || '',
          contract_number: directoryMatch?.contract_number || '',
          contract_date: directoryMatch?.contract_date || null,
          contract_start: directoryMatch?.contract_start || null,
          contract_end: directoryMatch?.contract_end || null,
          contract_status: directoryMatch?.contract_status || '',
          contract_is_active: Boolean(directoryMatch?.contract_is_active),
          no_contract_confirmed: noContractConfirmed,
          payment_order_url: paymentOrderUrl || '',
          payment_order_name: paymentOrderName || '',
          payment_order_uploaded_at: paymentOrderUrl ? new Date().toISOString() : null,
          payment_order_storage_bucket: paymentOrderStorageBucket || '',
          payment_order_storage_path: paymentOrderStoragePath || '',
          payment_order_number: paymentOrderNumberValue || '',
          payment_order_date: paymentOrderDateValue,
          payment_order_amount: paymentOrderAmountValue,
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

      if (paymentOrderUrl && paymentOrderDateValue && paymentOrderAmountValue !== null) {
        const { error: paymentRegistryError } = await supabase
          .from('payment_order_registry')
          .upsert({
            questionnaire_id: questionnaireId,
            company_id: companyId || null,
            company_bin_digits: paymentBinDigits,
            payment_order_number: paymentOrderNumberValue,
            payment_order_date: paymentOrderDateValue,
            payment_order_amount: paymentOrderAmountValue,
            payment_order_url: paymentOrderUrl,
            payment_order_name: paymentOrderName || '',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'questionnaire_id' });

        if (paymentRegistryError) {
          if (String((paymentRegistryError as { code?: string }).code || '') === '23505') {
            setErrors({
              payment_order: 'Платежное поручение с такими номером, датой и суммой уже загружено ранее. Проверьте данные.',
            });
            setSubmitting(false);
            return;
          }
          throw paymentRegistryError;
        }
      }

      // Mark as submitted
      await supabase.from('questionnaires').update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      }).eq('id', questionnaireId);

      setSubmitted(true);
    } catch (err) {
      logger.error('PublicFormPage', 'Submit failed', err);
      if (isPaymentOrderDuplicateError(err)) {
        setErrors({ payment_order: 'Дубликат платежного поручения: BIN/ИИН + номер + дата + сумма уже использованы в другой заявке.' });
        return;
      }
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

  useEffect(() => {
    const companyBinDigits = normalizeDigits(companyBin);
    const paymentOrderNumberValue = normalizePaymentOrderNumber(paymentOrderNumber);
    const paymentOrderDateValue = paymentOrderDate.trim();
    const paymentOrderAmountValue = parsePaymentOrderAmount(paymentOrderAmount);

    if (!paymentOrderUrl || !companyBinDigits || !paymentOrderNumberValue || !paymentOrderDateValue || paymentOrderAmountValue === null) {
      setPaymentOrderDuplicate(false);
      setErrors(prev => {
        if (prev.payment_order !== DUPLICATE_PAYMENT_ORDER_ERROR) return prev;
        return { ...prev, payment_order: undefined };
      });
      return;
    }

    const timer = window.setTimeout(async () => {
      const isDuplicate = await checkPaymentOrderDuplicate({
        companyBinDigits,
        paymentOrderNumber: paymentOrderNumberValue,
        paymentOrderDate: paymentOrderDateValue,
        paymentOrderAmount: paymentOrderAmountValue,
        questionnaireId,
      });
      setPaymentOrderDuplicate(isDuplicate);
      setErrors(prev => {
        if (isDuplicate) return { ...prev, payment_order: DUPLICATE_PAYMENT_ORDER_ERROR };
        if (prev.payment_order === DUPLICATE_PAYMENT_ORDER_ERROR) return { ...prev, payment_order: undefined };
        return prev;
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [companyBin, paymentOrderUrl, paymentOrderNumber, paymentOrderDate, paymentOrderAmount, questionnaireId]);

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
    return <StatusPage icon="clock" title="Срок действия ссылки истек" desc="Обратитесь к координатору для получения новой ссылки." />;
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
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  БИН/ИИН <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    value={companyBin}
                    onChange={e => {
                      setCompanyBin(e.target.value);
                      setLookupTouched(false);
                    }}
                    onBlur={() => { void lookupCompanyByBin(companyBin); }}
                    placeholder="123456789012"
                    className={`flex-1 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.company_bin ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                  />
                  <button
                    type="button"
                    onClick={() => { void lookupCompanyByBin(companyBin); }}
                    className="px-3 py-2.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm inline-flex items-center gap-1.5"
                    disabled={lookupLoading || !companyBin.trim()}
                  >
                    <Search size={14} />
                    {lookupLoading ? 'Поиск...' : 'Поиск'}
                  </button>
                </div>
                {lookupTouched && !directoryMatch && (
                  <button
                    type="button"
                    onClick={() => setCompanyCreateMode(true)}
                    className="mt-2 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-medium"
                  >
                    Создать компанию
                  </button>
                )}
                {errors.company_bin && <p className="text-xs text-red-500 mt-1">{errors.company_bin}</p>}
                {lookupTouched && directoryMatch && (
                  <p className="text-xs text-green-600 mt-1">Компания найдена в справочнике Bitrix24.</p>
                )}
                {lookupTouched && !directoryMatch && (
                  <p className="text-xs text-amber-600 mt-1">Компания не найдена в справочнике. Можно заполнить форму вручную с отметкой "Нет договора".</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Название компании <span className="text-red-500">*</span>
                </label>
                <input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="ТОО Компания"
                  disabled={lockCompanyFields}
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
                  disabled={lockCompanyFields}
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
                  disabled={lockCompanyFields}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Город</label>
                <input
                  value={companyCity}
                  onChange={e => setCompanyCity(e.target.value)}
                  placeholder="Алматы"
                  disabled={lockCompanyFields}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-sm font-medium text-gray-700 mb-2">Договор</div>
                {directoryMatch ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-600">
                    <div>Номер: <b>{directoryMatch.contract_number || '—'}</b></div>
                    <div>Дата договора: <b>{directoryMatch.contract_date || '—'}</b></div>
                    <div>Срок: <b>{directoryMatch.contract_start || '—'} — {directoryMatch.contract_end || '—'}</b></div>
                    <div className="md:col-span-3">Статус: <b>{directoryMatch.contract_status || (directoryMatch.contract_is_active ? 'Действует' : 'Не действует')}</b></div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">Договор по найденной компании отсутствует.</div>
                )}
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={noContractConfirmed}
                    onChange={e => setNoContractConfirmed(e.target.checked)}
                    disabled={hasActiveContract || !directoryMatch}
                  />
                  Нет договора (заполнить вручную)
                </label>
                {hasActiveContract && (
                  <p className="text-xs text-green-600 mt-1">Активный договор найден. Подтверждение не требуется.</p>
                )}
                {errors.contract && <p className="text-xs text-red-500 mt-1">{errors.contract}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Добавить платежное поручение</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={paymentOrderInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void handlePaymentOrderSelect(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => paymentOrderInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
                    disabled={uploadingPaymentOrder}
                  >
                    {uploadingPaymentOrder ? 'Загрузка...' : 'Выбрать файл'}
                  </button>
                  <span className="text-xs text-gray-500 truncate">{paymentOrderName || 'Файл не выбран'}</span>
                </div>
                {paymentOrderUrl && (
                  <a href={paymentOrderUrl} target="_blank" rel="noreferrer" className="inline-block mt-1 text-xs text-blue-600 hover:underline">
                    Открыть загруженный файл
                  </a>
                )}
                {paymentOrderStage !== 'idle' && (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                    <div className="flex items-center justify-between text-xs text-gray-700">
                      <span>{paymentStageLabel}</span>
                      <span>{paymentStagePercent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          paymentOrderStage === 'error' ? 'bg-red-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${paymentStagePercent}%` }}
                      />
                    </div>
                  </div>
                )}
                {paymentAutofillHint && <p className="text-xs text-gray-500 mt-1">{paymentAutofillHint}</p>}
                {errors.payment_order && <p className="text-xs text-red-500 mt-1">{errors.payment_order}</p>}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Номер платежного поручения</label>
                    <input
                      value={paymentOrderNumber}
                      onChange={e => setPaymentOrderNumber(e.target.value)}
                      placeholder="Например, 0256"
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                        errors.payment_order_number ? 'border-red-400 bg-red-50' : 'border-gray-300'
                      }`}
                    />
                    {errors.payment_order_number && <p className="text-xs text-red-500 mt-1">{errors.payment_order_number}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Дата оплаты</label>
                    <input
                      type="date"
                      value={paymentOrderDate}
                      onChange={e => setPaymentOrderDate(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                        errors.payment_order_date ? 'border-red-400 bg-red-50' : 'border-gray-300'
                      }`}
                    />
                    {errors.payment_order_date && <p className="text-xs text-red-500 mt-1">{errors.payment_order_date}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Сумма оплаты</label>
                    <input
                      value={paymentOrderAmount}
                      onChange={e => setPaymentOrderAmount(e.target.value)}
                      placeholder="Например, 14232.00"
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                        errors.payment_order_amount ? 'border-red-400 bg-red-50' : 'border-gray-300'
                      }`}
                    />
                    {errors.payment_order_amount && <p className="text-xs text-red-500 mt-1">{errors.payment_order_amount}</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Participants block */}
          <div className={`bg-white rounded-2xl shadow-lg p-6 ${!canEditParticipants ? 'opacity-60' : ''}`}>
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
            {!canEditParticipants && (
              <div className="mb-4 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                {canFillParticipants
                  ? 'Заполнение списка сотрудников будет доступно после загрузки актуального платежного поручения и заполнения номера, даты и суммы оплаты.'
                  : 'Заполнение сотрудников недоступно: требуется активный договор или подтверждение "Нет договора".'}
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
                            disabled={!canEditParticipants}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[p.id]?.click()}
                            disabled={p.uploading || !canEditParticipants}
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
                            disabled={!canEditParticipants}
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
                            disabled={!canEditParticipants}
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
                            onClick={() => {
                              if (!canEditParticipants) return;
                              setOpenCourseSelect(openCourseSelect === p.id ? null : p.id);
                              setCourseSearch('');
                            }}
                          >
                            {p.courses.map(c => (
                              <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs border border-blue-100">
                                {c}
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); toggleCourse(p.id, c); }}
                                  className="hover:text-red-500 transition-colors"
                                  disabled={!canEditParticipants}
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                            {p.courses.length === 0 && (
                              <span className="text-xs text-gray-400 px-1 py-1">Выбрать курсы...</span>
                            )}
                          </div>

                          {openCourseSelect === p.id && canEditParticipants && (
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
                                      {sel ? 'вњ“ ' : ''}{course}
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
                            disabled={!canEditParticipants}
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
                  if (!canEditParticipants) return;
                  setParticipants(ps => [...ps, newParticipant()]);
                  setCurrentPage(Math.ceil((participants.length + 1) / pageSize));
                }}
                disabled={!canEditParticipants}
                className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 text-gray-500 rounded-xl text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all w-full justify-center disabled:opacity-50"
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


