import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { uploadPhoto, uploadPaymentOrder } from '../../lib/cloudinary';
import { extractPaymentOrderFields } from '../../lib/paymentOcr';
import { fetchCoursesList } from '../../lib/bitrix';
import { logger } from '../../lib/logger';
import type { Company, Participant, RefCompanyDirectory } from '../../types';
import {
 applyDirectoryMatchToCompany,
 createLocalParticipant,
 DUPLICATE_PAYMENT_ORDER_ERROR,
 getParticipantMissingFields,
 isContractActiveByDates,
 isParticipantRowStarted,
 isPaymentOrderDuplicateError,
 normalizeDigits,
 normalizePaymentOrderNumber,
 parsePaymentOrderAmount,
 PARTICIPANT_REQUIRED_FIELD_LABELS,
 type LinkStatus,
 type LocalParticipant,
 type PaymentOrderStage,
 type ValidationErrors,
} from './model';

export function usePublicFormController(token: string | undefined) {
 const [linkStatus, setLinkStatus] = useState<LinkStatus>('loading');
 const [questionnaireId, setQuestionnaireId] = useState<string | null>(null);
 const [existingCompany, setExistingCompany] = useState<Company | null>(null);
 const [paymentOrderOptional, setPaymentOrderOptional] = useState(false);

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
 const [paymentOrderStage, setPaymentOrderStage] = useState<PaymentOrderStage>('idle');
 const [paymentOrderDuplicate, setPaymentOrderDuplicate] = useState(false);
 const paymentOrderInputRef = useRef<HTMLInputElement | null>(null);

 const [participants, setParticipants] = useState<LocalParticipant[]>([createLocalParticipant()]);
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
 const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

 const checkPaymentOrderDuplicate = useCallback(async (params: {
 companyBinDigits: string;
 paymentOrderNumber: string;
 paymentOrderDate: string;
 paymentOrderAmount: number;
 questionnaireId?: string | null;
 }): Promise<boolean> => {
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
 }, []);

 const applyDirectoryMatch = useCallback((match: RefCompanyDirectory | null) => {
 setDirectoryMatch(match);
 if (!match) {
 setNoContractConfirmed(false);
 return;
 }

 const mapped = applyDirectoryMatchToCompany(match);
 setCompanyName(mapped.companyName);
 setCompanyPhone(mapped.companyPhone);
 setCompanyEmail(mapped.companyEmail);
 setCompanyCity(mapped.companyCity);
 setNoContractConfirmed(false);
 }, []);

 const lookupCompanyByBin = useCallback(async (value: string) => {
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

 if (data) {
 applyDirectoryMatch(data);
 setLookupTouched(true);
 setCompanyCreateMode(false);
 return;
 }

 const { data: lookupData, error: lookupError } = await supabase.functions.invoke('lookup-company-directory', {
 headers: supabaseAnonKey ? {
 Authorization: `Bearer ${supabaseAnonKey}`,
 apikey: supabaseAnonKey,
 } : undefined,
 body: { bin: digits },
 });

 if (!lookupError && lookupData?.found && lookupData?.row) {
 applyDirectoryMatch(lookupData.row as RefCompanyDirectory);
 setLookupTouched(true);
 setCompanyCreateMode(false);
 return;
 }

 if (lookupError) {
 logger.error('PublicFormPage', 'Bitrix directory lookup fallback failed', lookupError);
 }

 setLookupTouched(true);
 applyDirectoryMatch(null);
 setCompanyCreateMode(false);
 } finally {
 setLookupLoading(false);
 }
 }, [applyDirectoryMatch]);

 const contractActiveByDates = isContractActiveByDates(directoryMatch?.contract_start, directoryMatch?.contract_end);
 const hasActiveContract = Boolean(
 directoryMatch?.has_contract &&
 (contractActiveByDates !== null ? contractActiveByDates : directoryMatch?.contract_is_active)
 );
 const canConfirmNoContract = !hasActiveContract && Boolean(directoryMatch || companyCreateMode);
 const canFillParticipants = directoryMatch
 ? (hasActiveContract || noContractConfirmed)
 : (companyCreateMode && noContractConfirmed);
 const lockCompanyFields = Boolean(directoryMatch) || !companyCreateMode;
 const paymentOrderAmountParsed = parsePaymentOrderAmount(paymentOrderAmount);
 const paymentOrderMetaReady = Boolean(
 normalizePaymentOrderNumber(paymentOrderNumber) &&
 paymentOrderDate.trim() &&
 paymentOrderAmountParsed !== null
 );
 const paymentOrderReady = Boolean(paymentOrderUrl) && paymentOrderMetaReady && !paymentOrderDuplicate;
 const canEditParticipants = canFillParticipants && (paymentOrderOptional || paymentOrderReady);
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
 if (hasActiveContract && noContractConfirmed) {
 setNoContractConfirmed(false);
 }
 }, [hasActiveContract, noContractConfirmed]);

 useEffect(() => {
 async function checkToken() {
 if (!token) {
 setLinkStatus('invalid');
 return;
 }

 const { data, error } = await supabase
 .from('questionnaires')
 .select('id, is_active, expires_at, status, payment_order_optional')
 .eq('secret_token', token)
 .maybeSingle();

 if (error || !data) {
 setLinkStatus('invalid');
 return;
 }
 if (data.status === 'submitted') {
 setLinkStatus('submitted');
 return;
 }
 if (!data.is_active) {
 setLinkStatus('inactive');
 return;
 }
 if (data.expires_at && new Date(data.expires_at) < new Date()) {
 setLinkStatus('expired');
 return;
 }

 setQuestionnaireId(data.id);
 setPaymentOrderOptional(Boolean(data.payment_order_optional));

 const { data: company } = await supabase
 .from('companies')
 .select('*')
 .eq('questionnaire_id', data.id)
 .maybeSingle();

 if (company) {
 setExistingCompany(company);
 setCompanyName(company.name || '');
 setCompanyPhone(company.phone || '');
 setCompanyEmail(company.email || '');
 setCompanyBin(company.bin_iin || '');
 setCompanyCity(company.city || '');
 setNoContractConfirmed(Boolean(company.no_contract_confirmed));
 setPaymentOrderUrl(company.payment_order_url || '');
 setPaymentOrderName(company.payment_order_name || '');
 setPaymentOrderStorageBucket(String(company.payment_order_storage_bucket || ''));
 setPaymentOrderStoragePath(String(company.payment_order_storage_path || ''));
 setPaymentOrderNumber(String(company.payment_order_number || ''));
 setPaymentOrderDate(String(company.payment_order_date || ''));
 setPaymentOrderAmount(typeof company.payment_order_amount === 'number' ? String(company.payment_order_amount) : '');

 if (company.source_ref_company_id) {
 const { data: refCompany } = await supabase
 .from('ref_company_directory')
 .select('*')
 .eq('id', company.source_ref_company_id)
 .maybeSingle();

 if (refCompany) {
 setDirectoryMatch(refCompany);
 }
 } else {
 setCompanyCreateMode(true);
 }
 }

 const { data: loadedParticipants } = await supabase
 .from('participants')
 .select('*')
 .eq('questionnaire_id', data.id)
 .order('sort_order');

 if (loadedParticipants && loadedParticipants.length > 0) {
 const { data: participantCourses } = await supabase
 .from('participant_courses')
 .select('*')
 .eq('questionnaire_id', data.id);

        setParticipants(loadedParticipants.map((participant: Participant) => ({
          id: participant.id,
          isPersisted: true,
          last_name: participant.last_name || '',
          first_name: participant.first_name || '',
          patronymic: participant.patronymic || '',
 position: participant.position || '',
 category: participant.category || '',
 courses: (participantCourses || [])
 .filter(course => course.participant_id === participant.id)
 .map((course: { course_name: string }) => course.course_name),
 photo_url: participant.photo_url || '',
 })));
 }

 setLinkStatus('valid');
 if (company?.bin_iin) {
 void lookupCompanyByBin(company.bin_iin);
 }
 }

 void checkToken();

 void supabase.from('ref_courses').select('name').order('sort_order').order('name').then(({ data }) => {
 if (data && data.length > 0) {
 setAvailableCourses(data.map(item => item.name));
 return;
 }

 void fetchCoursesList().then(courses => setAvailableCourses(courses.length > 0 ? courses : [
 'БиОТ', 'ПТМ', 'ПБ', 'Электробезопасность', 'Промышленная безопасность', 'Охрана труда',
 ]));
 });

 void supabase.from('ref_categories').select('name').order('sort_order').order('name').then(({ data }) => {
 if (data && data.length > 0) {
 setAvailableCategories(data.map(item => item.name));
 return;
 }

 setAvailableCategories(['ИТР', 'Обычный']);
 });
 }, [lookupCompanyByBin, token]);

 const validate = useCallback((): boolean => {
 const nextErrors: ValidationErrors = {};

 if (!directoryMatch && !companyCreateMode) nextErrors.company_bin = 'Нажмите Создать компанию, чтобы продолжить без совпадения в справочнике.';
 if (!companyName.trim()) nextErrors.company_name = 'Обязательное поле';
 if (!companyPhone.trim()) nextErrors.company_phone = 'Обязательное поле';
 if (!companyBin.trim()) nextErrors.company_bin = 'Обязательное поле';
 if (!canFillParticipants) nextErrors.contract = 'Нет активного договора. Подтвердите Нет договора, чтобы заполнить форму вручную.';

 const amountParsed = parsePaymentOrderAmount(paymentOrderAmount);
 if (!paymentOrderOptional) {
 if (!paymentOrderUrl) nextErrors.payment_order = 'Загрузите файл платежного поручения.';
 if (!normalizePaymentOrderNumber(paymentOrderNumber)) nextErrors.payment_order_number = 'Укажите номер платежного поручения.';
 if (!paymentOrderDate.trim()) nextErrors.payment_order_date = 'Укажите дату оплаты.';
 if (amountParsed === null) nextErrors.payment_order_amount = 'Укажите корректную сумму оплаты.';
 if (paymentOrderDuplicate) nextErrors.payment_order = DUPLICATE_PAYMENT_ORDER_ERROR;
 }

 const startedParticipants = participants.filter(isParticipantRowStarted);
 const incompleteParticipants = startedParticipants
 .map(participant => ({
 participant,
 index: participants.findIndex(item => item.id === participant.id),
 missing: getParticipantMissingFields(participant),
 }))
 .filter(item => item.missing.length > 0);

 if (canEditParticipants && startedParticipants.length === 0) {
 nextErrors.participants = 'Добавьте хотя бы одного сотрудника и заполните все его данные.';
 } else if (canEditParticipants && incompleteParticipants.length > 0) {
 const preview = incompleteParticipants
 .slice(0, 2)
 .map(item => {
 const rowNumber = item.index + 1;
 const labels = item.missing.map(field => PARTICIPANT_REQUIRED_FIELD_LABELS[field]).join(', ');
 return `строка ${rowNumber}: ${labels}`;
 })
 .join('; ');
 nextErrors.participants = `Если строка сотрудника заполнена хотя бы частично, нужно заполнить все поля. Проверьте ${preview}.`;
 }

 setErrors(nextErrors);
 return Object.keys(nextErrors).length === 0;
 }, [
 canEditParticipants,
 canFillParticipants,
 companyBin,
 companyCreateMode,
 companyName,
 companyPhone,
 directoryMatch,
 participants,
 paymentOrderAmount,
 paymentOrderDate,
 paymentOrderDuplicate,
 paymentOrderOptional,
 paymentOrderNumber,
 paymentOrderUrl,
 ]);

 const handlePhotoSelect = useCallback(async (participantId: string, file: File) => {
 const preview = URL.createObjectURL(file);
 setParticipants(current => current.map(participant => (
 participant.id === participantId ? { ...participant, photoFile: file, photoPreview: preview } : participant
 )));
 }, []);

 const handlePaymentOrderSelect = useCallback(async (file: File) => {
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
 } catch (error) {
 logger.error('PublicFormPage', 'Payment order upload failed', error);
 setPaymentOrderStage('error');
 setErrors(prev => ({ ...prev, payment_order: 'Не удалось загрузить/прочитать платежное поручение' }));
 } finally {
 setUploadingPaymentOrder(false);
 }
 }, [
 checkPaymentOrderDuplicate,
 companyBin,
 paymentOrderAmount,
 paymentOrderDate,
 paymentOrderNumber,
 questionnaireId,
 ]);

 const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
 event.preventDefault();
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
 setErrors({ payment_order: DUPLICATE_PAYMENT_ORDER_ERROR });
 setSubmitting(false);
 return;
 }
 }

 const participantsToSubmit = participants.filter(isParticipantRowStarted);

 const companyPayload = {
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
 };

 let companyId = existingCompany?.id;

 if (existingCompany?.id) {
 const { data: updatedCompany, error: updateCompanyError } = await supabase
 .from('companies')
 .update(companyPayload)
 .eq('id', existingCompany.id)
 .select()
 .maybeSingle();

 if (updateCompanyError) throw updateCompanyError;
 if (updatedCompany) {
 setExistingCompany(updatedCompany as Company);
 companyId = updatedCompany.id;
 }
 } else {
 const { data: currentCompany, error: currentCompanyError } = await supabase
 .from('companies')
 .select('*')
 .eq('questionnaire_id', questionnaireId)
 .maybeSingle();

 if (currentCompanyError) throw currentCompanyError;

 if (currentCompany?.id) {
 const { data: updatedCompany, error: updateCompanyError } = await supabase
 .from('companies')
 .update(companyPayload)
 .eq('id', currentCompany.id)
 .select()
 .maybeSingle();

 if (updateCompanyError) throw updateCompanyError;
 if (updatedCompany) {
 setExistingCompany(updatedCompany as Company);
 companyId = updatedCompany.id;
 } else {
 companyId = currentCompany.id;
 }
 } else {
 const { data: newCompany, error } = await supabase
 .from('companies')
 .insert({
 questionnaire_id: questionnaireId,
 ...companyPayload,
 })
 .select()
 .maybeSingle();

 if (error) {
 if (String((error as { code?: string }).code || '') !== '23505') throw error;

 const { data: fallbackCompany, error: fallbackCompanyError } = await supabase
 .from('companies')
 .select('*')
 .eq('questionnaire_id', questionnaireId)
 .maybeSingle();

 if (fallbackCompanyError || !fallbackCompany?.id) throw fallbackCompanyError || error;

 const { data: updatedCompany, error: updateCompanyError } = await supabase
 .from('companies')
 .update(companyPayload)
 .eq('id', fallbackCompany.id)
 .select()
 .maybeSingle();

 if (updateCompanyError) throw updateCompanyError;
 if (updatedCompany) {
 setExistingCompany(updatedCompany as Company);
 companyId = updatedCompany.id;
 } else {
 companyId = fallbackCompany.id;
 }
 } else if (newCompany) {
 setExistingCompany(newCompany as Company);
 companyId = newCompany.id;
 }
 }
 }

 for (let index = 0; index < participantsToSubmit.length; index++) {
 const participant = participantsToSubmit[index];

 let photoUrl = participant.photo_url;
 if (participant.photoFile) {
 setParticipants(current => current.map(item => item.id === participant.id ? { ...item, uploading: true } : item));
 try {
 photoUrl = await uploadPhoto(participant.photoFile);
 } catch {
 // Continue without photo if upload fails.
 }
 setParticipants(current => current.map(item => (
 item.id === participant.id
 ? { ...item, uploading: false, photo_url: photoUrl }
 : item
 )));
 }

 const existingParticipant = Boolean(participant.isPersisted);
 if (existingParticipant) {
 await supabase.from('participants').update({
 last_name: participant.last_name,
 first_name: participant.first_name,
 patronymic: participant.patronymic,
 position: participant.position,
 category: participant.category,
 photo_url: photoUrl,
 company_id: companyId,
 sort_order: index,
 updated_at: new Date().toISOString(),
 }).eq('id', participant.id);

 await supabase.from('participant_courses').delete().eq('participant_id', participant.id);
 for (const course of participant.courses) {
 await supabase.from('participant_courses').insert({
 participant_id: participant.id,
 questionnaire_id: questionnaireId,
 course_name: course,
 });
 }
 } else {
 const { data: newParticipant } = await supabase.from('participants').insert({
 questionnaire_id: questionnaireId,
 company_id: companyId,
 last_name: participant.last_name,
 first_name: participant.first_name,
 patronymic: participant.patronymic,
 position: participant.position,
 category: participant.category,
 photo_url: photoUrl,
 sort_order: index,
 }).select().maybeSingle();

 if (newParticipant) {
 for (const course of participant.courses) {
 await supabase.from('participant_courses').insert({
 participant_id: newParticipant.id,
 questionnaire_id: questionnaireId,
 course_name: course,
 });
 }
 }
 }
 }

 if (paymentOrderUrl && paymentOrderDateValue && paymentOrderAmountValue !== null) {
 const { error: paymentRegistryInsertError } = await supabase
 .from('payment_order_registry')
 .insert({
 questionnaire_id: questionnaireId,
 company_id: companyId || null,
 company_bin_digits: paymentBinDigits,
 payment_order_number: paymentOrderNumberValue,
 payment_order_date: paymentOrderDateValue,
 payment_order_amount: paymentOrderAmountValue,
 payment_order_url: paymentOrderUrl,
 payment_order_name: paymentOrderName || '',
 updated_at: new Date().toISOString(),
 });

 if (paymentRegistryInsertError) {
 if (String((paymentRegistryInsertError as { code?: string }).code || '') !== '23505') {
 throw paymentRegistryInsertError;
 }
 const { error: paymentRegistryUpdateError } = await supabase
 .from('payment_order_registry')
 .update({
 questionnaire_id: questionnaireId,
 company_id: companyId || null,
 company_bin_digits: paymentBinDigits,
 payment_order_number: paymentOrderNumberValue,
 payment_order_date: paymentOrderDateValue,
 payment_order_amount: paymentOrderAmountValue,
 payment_order_url: paymentOrderUrl,
 payment_order_name: paymentOrderName || '',
 updated_at: new Date().toISOString(),
 })
 .eq('questionnaire_id', questionnaireId);

 if (paymentRegistryUpdateError) throw paymentRegistryUpdateError;
 }
 }

 await supabase.from('questionnaires').update({
 status: 'submitted',
 submitted_at: new Date().toISOString(),
 }).eq('id', questionnaireId);

 setSubmitted(true);
 } catch (error) {
 logger.error('PublicFormPage', 'Submit failed', error);
 if (isPaymentOrderDuplicateError(error)) {
 setErrors({ payment_order: 'Дубликат платежного поручения: BIN/ИИН + номер + дата + сумма уже использованы в другой заявке.' });
 return;
 }
 setErrors({ participants: 'Ошибка отправки. Попробуйте еще раз.' });
 } finally {
 setSubmitting(false);
 }
 }, [
 checkPaymentOrderDuplicate,
 companyBin,
 companyCity,
 companyEmail,
 companyName,
 companyPhone,
 directoryMatch,
 existingCompany,
 noContractConfirmed,
 participants,
 paymentOrderAmount,
 paymentOrderDate,
 paymentOrderName,
 paymentOrderNumber,
 paymentOrderStorageBucket,
 paymentOrderStoragePath,
 paymentOrderUrl,
 questionnaireId,
 validate,
 ]);

 const updateParticipant = useCallback(<K extends keyof LocalParticipant>(id: string, field: K, value: LocalParticipant[K]) => {
 setParticipants(current => current.map(participant => (
 participant.id === id ? { ...participant, [field]: value } : participant
 )));
 }, []);

 const toggleCourse = useCallback((participantId: string, course: string) => {
 setParticipants(current => current.map(participant => {
 if (participant.id !== participantId) return participant;
 const exists = participant.courses.includes(course);
 return {
 ...participant,
 courses: exists ? participant.courses.filter(item => item !== course) : [...participant.courses, course],
 };
 }));
 }, []);

 const removeParticipant = useCallback((participantIndex: number) => {
 setParticipants(current => current.filter((_, index) => index !== participantIndex));
 }, []);

 const addParticipant = useCallback(() => {
 if (!canEditParticipants) return;
 setParticipants(current => [...current, createLocalParticipant()]);
 setCurrentPage(Math.ceil((participants.length + 1) / pageSize));
 }, [canEditParticipants, pageSize, participants.length]);

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
 }, [
 checkPaymentOrderDuplicate,
 companyBin,
 paymentOrderAmount,
 paymentOrderDate,
 paymentOrderNumber,
 paymentOrderUrl,
 questionnaireId,
 ]);

 const totalCourses = useMemo(() => [...new Set(participants.flatMap(participant => participant.courses))].length, [participants]);
 const totalCourseRequests = useMemo(
 () => participants.reduce((sum, participant) => sum + participant.courses.length, 0),
 [participants]
 );
 const filteredCourses = useMemo(
 () => availableCourses.filter(course => course.toLowerCase().includes(courseSearch.toLowerCase())),
 [availableCourses, courseSearch]
 );
 const totalPages = Math.ceil(participants.length / pageSize);
 const pagedParticipants = participants.slice((currentPage - 1) * pageSize, currentPage * pageSize);

 const enableCompanyCreateMode = useCallback(() => {
 setCompanyCreateMode(true);
 }, []);

 const handleCompanyBinChange = useCallback((value: string) => {
 setCompanyBin(value);
 setLookupTouched(false);
 }, []);

 const handleLookupCompany = useCallback(() => {
 void lookupCompanyByBin(companyBin);
 }, [companyBin, lookupCompanyByBin]);

 const handlePageSizeChange = useCallback((value: number) => {
 setPageSize(value);
 setCurrentPage(1);
 }, []);

 return {
 linkStatus,
 paymentOrderOptional,
 submitted,
 submitting,
 errors,
 companyName,
 companyPhone,
 companyEmail,
 companyBin,
 companyCity,
 directoryMatch,
 lookupLoading,
 lookupTouched,
 companyCreateMode,
 noContractConfirmed,
 paymentOrderUrl,
 paymentOrderName,
 paymentOrderNumber,
 paymentOrderDate,
 paymentOrderAmount,
 paymentAutofillHint,
 uploadingPaymentOrder,
 paymentOrderStage,
 participants,
 availableCourses,
 availableCategories,
 openCourseSelect,
 courseSearch,
 pageSize,
 currentPage,
 totalPages,
 pagedParticipants,
 filteredCourses,
 totalCourses,
 totalCourseRequests,
 paymentOrderInputRef,
 fileInputRefs,
 hasActiveContract,
 canConfirmNoContract,
 canFillParticipants,
 lockCompanyFields,
 canEditParticipants,
 paymentStagePercent,
 paymentStageLabel,
 setCompanyName,
 setCompanyPhone,
 setCompanyEmail,
 setCompanyCity,
 setNoContractConfirmed,
 setPaymentOrderNumber,
 setPaymentOrderDate,
 setPaymentOrderAmount,
 setOpenCourseSelect,
 setCourseSearch,
 setCurrentPage,
 handleCompanyBinChange,
 handleLookupCompany,
 enableCompanyCreateMode,
 handlePhotoSelect,
 handlePaymentOrderSelect,
 handleSubmit,
 updateParticipant,
 toggleCourse,
 removeParticipant,
 addParticipant,
 handlePageSizeChange,
 };
}
