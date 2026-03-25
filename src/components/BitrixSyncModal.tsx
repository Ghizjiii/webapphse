import { useState } from 'react';
import { X, RefreshCw, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import type { Company, Participant, BitrixSyncProgress, Deal } from '../types';

interface Props {
  questionnaireId: string;
  company: Company;
  participants: Participant[];
  dealId: string | null;
  existingDeal: Deal | null;
  onClose: () => void;
  onDone: () => void;
}

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function decodeUnicodeEscapes(input: string): string {
  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function prettifySyncError(msg: string): string {
  const decoded = decodeUnicodeEscapes(msg || '');
  return decoded
    .replace(/UF_CRM_BIN_IIN/g, 'БИН/ИИН компании')
    .replace(/custom field/gi, 'пользовательское поле')
    .replace(/company card/gi, 'карточке компании');
}

export default function BitrixSyncModal({ questionnaireId, company, participants, dealId, existingDeal, onClose, onDone }: Props) {
  const { showToast } = useToast();
  const [progress, setProgress] = useState<BitrixSyncProgress>({ step: '', current: 0, total: 0, status: 'idle' });
  const [started, setStarted] = useState(false);

  const isUpdate = !!existingDeal?.bitrix_deal_id;
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
    setProgress({ step: 'Синхронизация с Битрикс24...', current: 0, total: 1, status: 'running' });

    try {
      const { data, error } = await supabase.functions.invoke('bitrix-sync', {
        headers: {
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: {
          questionnaireId,
          paymentFieldCode: import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FIELD || '',
          paymentStatusFieldCode: import.meta.env.VITE_BITRIX_DEAL_PAYMENT_STATUS_FIELD || '',
          paymentFileFieldCode: import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FILE_FIELD || '',
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to invoke bitrix-sync');
      }

      const photoFailures = Number(data?.photoFailures || 0);
      const photoFailureSamples = Array.isArray(data?.photoFailureSamples)
        ? data.photoFailureSamples.map((value: unknown) => String(value))
        : [];
      const resultTitle = String(data?.dealTitle || dealTitle);

      setProgress({ step: 'Готово!', current: 1, total: 1, status: 'done' });

      if (photoFailures > 0) {
        const suffix = photoFailureSamples.length > 0 ? ` Примеры: ${photoFailureSamples.join(' | ')}` : '';
        showToast('warning', `Синхронизация завершена, но фото не прикрепились у ${photoFailures} записей.${suffix}`);
      }

      showToast('success', isUpdate
        ? `Данные обновлены: ${resultTitle}`
        : `Сделка создана: ${resultTitle}`);

      setTimeout(onDone, 1500);
    } catch (e) {
      const rawMsg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      const msg = prettifySyncError(rawMsg);
      setProgress({ step: 'Ошибка', current: 0, total: 1, status: 'error', error: msg });
      showToast('error', `Ошибка синхронизации: ${msg}`);
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isUpdate ? 'Обновить данные в Битрикс24' : 'Отправить в Битрикс24'}
          </h2>
          {progress.status !== 'running' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {!started ? (
            <>
              {isUpdate && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  <RefreshCw size={15} className="flex-shrink-0 mt-0.5" />
                  <span>Существующие записи сотрудников будут удалены и созданы заново. Сделка и компания будут обновлены.</span>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">Название сделки:</span>
                  <span className="font-medium text-gray-900 leading-snug">{dealTitle}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">Компания:</span>
                  <span className="font-medium text-gray-900">{company.name}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">Сотрудников:</span>
                  <span className="font-medium text-gray-900">{participantsCount}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">Курсов:</span>
                  <span className="font-medium text-gray-900">{uniqueCoursesCount}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">Заявок:</span>
                  <span className="font-medium text-gray-900">{totalCourseRequests}</span>
                </div>
                {isUpdate && existingDeal?.bitrix_deal_id && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 flex-shrink-0">ID сделки:</span>
                    <span className="font-medium text-gray-900">#{existingDeal.bitrix_deal_id}</span>
                  </div>
                )}
                {dealId && !isUpdate && (
                  <div className="text-xs text-gray-500">Черновик сделки в БД: {dealId}</div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={runSync}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  {isUpdate ? <><RefreshCw size={15} /> Обновить</> : <><Send size={15} /> Отправить</>}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">{progress.step}</span>
                  <span className="text-sm font-medium text-gray-900">{pct}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${progress.status === 'error' ? 'bg-red-500' :
                        progress.status === 'done' ? 'bg-green-500' : 'bg-blue-600'
                      }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {progress.status === 'running' && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                  <RefreshCw size={18} className="text-blue-600 animate-spin" />
                  <span className="text-sm text-blue-900">
                    Выполняется синхронизация c Bitrix.
                  </span>
                </div>
              )}

              {progress.status === 'done' && (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-100">
                  <CheckCircle2 size={18} className="text-green-600" />
                  <span className="text-sm text-green-900">Синхронизация завершена успешно.</span>
                </div>
              )}

              {progress.status === 'error' && (
                <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-100">
                  <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-red-900 mb-1">Ошибка</div>
                    <div className="text-sm text-red-800 break-words">{progress.error}</div>
                  </div>
                </div>
              )}

              {progress.status !== 'running' && (
                <button
                  onClick={onClose}
                  className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-all"
                >
                  Закрыть
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
