import { useState } from 'react';
import { X, RefreshCw, AlertCircle, Send, CheckCircle2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { syncQuestionnaireToBitrix } from '../lib/bitrixApi';
import type { Company, Participant, Deal } from '../types';

interface Props {
 questionnaireId: string;
 company: Company;
 participants: Participant[];
 dealId: string | null;
 existingDeal: Deal | null;
 onClose: () => void;
 onDone: () => void;
}

type ProgressState = {
 step: string;
 current: number;
 total: number;
 status: 'idle' | 'running' | 'done' | 'error';
 error?: string;
};

function decodeUnicodeEscapes(input: string): string {
 return String(input || '').replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function prettifySyncError(message: string): string {
 return decodeUnicodeEscapes(message || '')
 .replace(/UF_CRM_BIN_IIN/g, 'БИН/ИИН компании')
 .replace(/custom field/gi, 'пользовательское поле')
 .replace(/company card/gi, 'карточке компании');
}

export default function BitrixSyncModal({ questionnaireId, company, participants, dealId, existingDeal, onClose, onDone }: Props) {
 const { showToast } = useToast();
 const [started, setStarted] = useState(false);
 const [progress, setProgress] = useState<ProgressState>({ step: '', current: 0, total: 1, status: 'idle' });

 const isUpdate = Boolean(existingDeal?.bitrix_deal_id);
 const allCourses = [...new Set(participants.flatMap(p => (p.courses || []).map(c => c.course_name)).filter(Boolean))];
 const participantsCount = participants.length;
 const uniqueCoursesCount = allCourses.length;
 const totalCourseRequests = participants.reduce((sum, p) => sum + (p.courses?.length || 0), 0);
 const titlePrefix = [company.name, company.city].filter(Boolean).join(' - ');
 const dealTitle = [
 titlePrefix,
 `${participantsCount} сотрудников, ${uniqueCoursesCount} курсов, ${totalCourseRequests} заявок на курсы`,
 ].filter(Boolean).join(' - ');

 async function runSync() {
 setStarted(true);
 setProgress({ step: 'Сервер выполняет синхронизацию с Bitrix24...', current: 0, total: 1, status: 'running' });

 try {
 const result = await syncQuestionnaireToBitrix({
 questionnaireId,
 company,
 participants,
 dealId,
 existingDeal,
 }) as {
 photoFailures?: number;
 photoFailureSamples?: string[];
 dealTitle?: string;
 isUpdate?: boolean;
 };

 setProgress({ step: 'Готово!', current: 1, total: 1, status: 'done' });

 const photoFailures = Number(result?.photoFailures || 0);
 const photoFailureSamples = Array.isArray(result?.photoFailureSamples) ? result.photoFailureSamples : [];
 if (photoFailures > 0) {
 const suffix = photoFailureSamples.length > 0 ? ` Примеры: ${photoFailureSamples.join(' | ')}` : '';
 showToast('warning', `Синхронизация завершена, но фото не прикрепились у ${photoFailures} записей.${suffix}`);
 }

 const finalTitle = String(result?.dealTitle || dealTitle);
 showToast('success', (result?.isUpdate ?? isUpdate)
 ? `Данные обновлены: ${finalTitle}`
 : `Сделка создана: ${finalTitle}`);

 setTimeout(onDone, 1200);
 } catch (error) {
 const raw = error instanceof Error ? error.message : 'Неизвестная ошибка';
 const message = prettifySyncError(raw);
 setProgress({ step: 'Ошибка синхронизации', current: 1, total: 1, status: 'error', error: message });
 showToast('error', `Ошибка синхронизации: ${message}`);
 }
 }

 const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

 return (
 <div className='fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4'>
 <div className='bg-white rounded-2xl shadow-2xl w-full max-w-md'>
 <div className='flex items-center justify-between p-6 border-b border-gray-100'>
 <h2 className='text-lg font-semibold text-gray-900'>
 {isUpdate ? 'Обновить данные в Битрикс24' : 'Отправить в Битрикс24'}
 </h2>
 {progress.status !== 'running' && (
 <button onClick={onClose} className='text-gray-400 hover:text-gray-600 transition-colors'>
 <X size={20} />
 </button>
 )}
 </div>

 <div className='p-6 space-y-4'>
 {!started ? (
 <>
 {isUpdate && (
 <div className='flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800'>
 <RefreshCw size={15} className='flex-shrink-0 mt-0.5' />
 <span>Существующие записи сотрудников будут пересобраны на сервере. Компания и сделка будут обновлены.</span>
 </div>
 )}

 <div className='bg-gray-50 rounded-xl p-4 space-y-2 text-sm'>
 <div className='flex gap-2'>
 <span className='text-gray-500 w-28 flex-shrink-0'>Название сделки:</span>
 <span className='font-medium text-gray-900 leading-snug'>{dealTitle}</span>
 </div>
 <div className='flex gap-2'>
 <span className='text-gray-500 w-28 flex-shrink-0'>Компания:</span>
 <span className='font-medium text-gray-900'>{company.name}</span>
 </div>
 <div className='flex gap-2'>
 <span className='text-gray-500 w-28 flex-shrink-0'>Сотрудников:</span>
 <span className='font-medium text-gray-900'>{participantsCount}</span>
 </div>
 <div className='flex gap-2'>
 <span className='text-gray-500 w-28 flex-shrink-0'>Курсов:</span>
 <span className='font-medium text-gray-900'>{uniqueCoursesCount}</span>
 </div>
 <div className='flex gap-2'>
 <span className='text-gray-500 w-28 flex-shrink-0'>Заявок:</span>
 <span className='font-medium text-gray-900'>{totalCourseRequests}</span>
 </div>
 </div>

 <div className='flex gap-3 pt-2'>
 <button
 onClick={runSync}
 className='flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all shadow-sm'
 >
 {isUpdate ? <RefreshCw size={16} /> : <Send size={16} />}
 {isUpdate ? 'Обновить в Битрикс24' : 'Отправить в Битрикс24'}
 </button>
 <button
 onClick={onClose}
 className='px-4 py-3 border border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition-all'
 >
 Отмена
 </button>
 </div>
 </>
 ) : (
 <div className='space-y-4'>
 <div className={`rounded-xl border p-4 ${
 progress.status === 'error'
 ? 'bg-red-50 border-red-200'
 : progress.status === 'done'
 ? 'bg-green-50 border-green-200'
 : 'bg-blue-50 border-blue-200'
 }`}>
 <div className='flex items-start gap-3'>
 {progress.status === 'done' ? (
 <CheckCircle2 size={20} className='text-green-600 mt-0.5 flex-shrink-0' />
 ) : progress.status === 'error' ? (
 <AlertCircle size={20} className='text-red-600 mt-0.5 flex-shrink-0' />
 ) : (
 <RefreshCw size={20} className='text-blue-600 mt-0.5 flex-shrink-0 animate-spin' />
 )}
 <div className='min-w-0 flex-1'>
 <div className='font-medium text-gray-900'>{progress.step}</div>
 {progress.error && <div className='text-sm text-red-600 mt-1 break-words'>{progress.error}</div>}
 </div>
 </div>
 </div>

 <div>
 <div className='h-2 bg-gray-100 rounded-full overflow-hidden'>
 <div
 className={`h-full transition-all duration-500 ${progress.status === 'error' ? 'bg-red-500' : progress.status === 'done' ? 'bg-green-500' : 'bg-blue-500'}`}
 style={{ width: `${pct}%` }}
 />
 </div>
 <div className='text-xs text-gray-500 mt-2 text-center'>{pct}%</div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 );
}
