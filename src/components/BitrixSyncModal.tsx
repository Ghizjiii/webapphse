import { useState } from 'react';
import { X, RefreshCw, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  createCompany,
  updateCompany,
  createDeal,
  updateDeal,
  createSmartProcessItem,
  deleteSmartProcessItem,
  attachPhotoToSmartItem,
  BITRIX_FIELDS,
  findSmartProcessEntityTypeId,
} from '../lib/bitrix';
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

export default function BitrixSyncModal({ questionnaireId, company, participants, dealId, existingDeal, onClose, onDone }: Props) {
  const { showToast } = useToast();
  const [progress, setProgress] = useState<BitrixSyncProgress>({ step: '', current: 0, total: 0, status: 'idle' });
  const [started, setStarted] = useState(false);

  const isUpdate = !!(existingDeal?.bitrix_deal_id);

  const allCourses = [...new Set(
    participants.flatMap(p => (p.courses || []).map(c => c.course_name))
  )].filter(Boolean);

  const dealTitle = [
    company.name,
    company.city,
    `${participants.length} сотрудников`,
    allCourses.join(', '),
  ].filter(Boolean).join(' - ');

  async function runSync() {
    setStarted(true);

    try {
      const entityTypeId = await (async () => {
        setProgress({ step: 'Поиск смарт-процесса...', current: 0, total: 4, status: 'running' });
        return await findSmartProcessEntityTypeId();
      })();

      let bitrixCompanyId: string;
      let bitrixDealId: string;

      if (isUpdate && existingDeal) {
        // Update existing company
        setProgress({ step: 'Обновление компании в Битрикс24...', current: 1, total: 4, status: 'running' });
        bitrixCompanyId = existingDeal.bitrix_company_id;
        if (bitrixCompanyId) {
          await updateCompany(bitrixCompanyId, {
            name: company.name,
            phone: company.phone,
            email: company.email,
            bin_iin: company.bin_iin,
          });
        } else {
          bitrixCompanyId = await createCompany({
            name: company.name,
            phone: company.phone,
            email: company.email,
            bin_iin: company.bin_iin,
          });
          await supabase.from('companies').update({ bitrix_company_id: bitrixCompanyId }).eq('id', company.id);
        }

        setProgress({ step: 'Обновление сделки...', current: 2, total: 4, status: 'running' });
        bitrixDealId = existingDeal.bitrix_deal_id;
        await updateDeal(bitrixDealId, { title: dealTitle, companyId: bitrixCompanyId, city: company.city });

        await supabase.from('deals').update({
          deal_title: dealTitle,
          sync_status: 'in_progress',
          updated_at: new Date().toISOString(),
        }).eq('id', existingDeal.id);

        // Delete old smart process items
        setProgress({ step: 'Удаление старых записей...', current: 3, total: 4, status: 'running' });
        const { data: oldCerts } = await supabase
          .from('certificates')
          .select('id, bitrix_item_id')
          .eq('questionnaire_id', questionnaireId)
          .not('bitrix_item_id', 'is', null);

        for (const cert of oldCerts || []) {
          if (cert.bitrix_item_id) {
            try {
              await deleteSmartProcessItem({ entityTypeId, itemId: cert.bitrix_item_id });
            } catch {
              // ignore deletion errors
            }
          }
          await supabase.from('certificates').delete().eq('id', cert.id);
        }

      } else {
        // Create new company
        setProgress({ step: 'Создание компании в Битрикс24...', current: 1, total: 4, status: 'running' });
        bitrixCompanyId = await createCompany({
          name: company.name,
          phone: company.phone,
          email: company.email,
          bin_iin: company.bin_iin,
        });
        await supabase.from('companies').update({ bitrix_company_id: bitrixCompanyId }).eq('id', company.id);

        setProgress({ step: 'Создание сделки...', current: 2, total: 4, status: 'running' });
        bitrixDealId = await createDeal({ title: dealTitle, companyId: bitrixCompanyId, city: company.city });
        const dealUrl = `https://hsecompany.bitrix24.kz/crm/deal/details/${bitrixDealId}/`;

        if (dealId) {
          await supabase.from('deals').update({
            bitrix_deal_id: bitrixDealId,
            bitrix_company_id: bitrixCompanyId,
            deal_title: dealTitle,
            deal_url: dealUrl,
            sync_status: 'in_progress',
            updated_at: new Date().toISOString(),
          }).eq('id', dealId);
        } else {
          await supabase.from('deals').insert({
            questionnaire_id: questionnaireId,
            company_id: company.id,
            bitrix_deal_id: bitrixDealId,
            bitrix_company_id: bitrixCompanyId,
            deal_title: dealTitle,
            deal_url: dealUrl,
            sync_status: 'in_progress',
          });
        }
      }

      const dealUrl = `https://hsecompany.bitrix24.kz/crm/deal/details/${bitrixDealId}/`;

      // Create new smart-process items
      const totalItems = participants.reduce((s, p) => s + Math.max(1, (p.courses || []).length), 0);
      let created = 0;

      setProgress({ step: 'Создание записей сотрудников...', current: 3, total: 3 + totalItems, status: 'running' });

      for (const p of participants) {
        const courses = p.courses && p.courses.length > 0 ? p.courses : [{ course_name: '' }];
        for (const course of courses) {
          const fields: Record<string, unknown> = {
            TITLE: `${p.last_name} ${p.first_name} - ${course.course_name}`,
            [BITRIX_FIELDS.LAST_NAME]: p.last_name,
            [BITRIX_FIELDS.FIRST_NAME]: p.first_name,
            [BITRIX_FIELDS.MIDDLE_NAME]: p.patronymic,
            [BITRIX_FIELDS.POSITION]: p.position,
            [BITRIX_FIELDS.CATEGORY]: p.category,
            [BITRIX_FIELDS.COURSE_NAME]: course.course_name,
          };

          const bitrixItemId = await createSmartProcessItem({
            entityTypeId,
            dealId: bitrixDealId,
            companyId: bitrixCompanyId,
            fields,
          });

          if (p.photo_url) {
            const fullName = [p.last_name, p.first_name, p.patronymic].filter(Boolean).join(' ');
            await attachPhotoToSmartItem({
              entityTypeId,
              itemId: bitrixItemId,
              photoUrl: p.photo_url,
              participantName: fullName,
            });
          }

          await supabase.from('certificates').insert({
            questionnaire_id: questionnaireId,
            company_id: company.id,
            participant_id: p.id,
            bitrix_item_id: bitrixItemId,
            last_name: p.last_name,
            first_name: p.first_name,
            middle_name: p.patronymic,
            position: p.position,
            category: p.category,
            course_name: course.course_name,
            sync_status: 'synced',
          });

          created++;
          setProgress({
            step: `Создание записей (${created}/${totalItems})...`,
            current: 3 + created,
            total: 3 + totalItems,
            status: 'running',
          });
        }
      }

      // Finalize
      await supabase.from('deals').update({
        sync_status: 'success',
        synced_at: new Date().toISOString(),
        deal_url: dealUrl,
        bitrix_deal_id: bitrixDealId,
        bitrix_company_id: bitrixCompanyId,
      }).eq('questionnaire_id', questionnaireId);
      await supabase.from('questionnaires').update({ status: 'synced' }).eq('id', questionnaireId);

      setProgress({ step: 'Готово!', current: 3 + totalItems, total: 3 + totalItems, status: 'done' });
      showToast('success', isUpdate ? `Данные обновлены: ${dealTitle}` : `Сделка создана: ${dealTitle}`);
      setTimeout(onDone, 1500);

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Неизвестная ошибка';
      setProgress(p => ({ ...p, status: 'error', error: msg }));
      await supabase.from('deals').update({ sync_status: 'error', error_message: msg }).eq('questionnaire_id', questionnaireId);
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
                  <span className="font-medium text-gray-900">{participants.length}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">Курсы:</span>
                  <span className="font-medium text-gray-900">{allCourses.join(', ') || '—'}</span>
                </div>
                {isUpdate && existingDeal?.bitrix_deal_id && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 flex-shrink-0">ID сделки:</span>
                    <span className="font-medium text-gray-900">#{existingDeal.bitrix_deal_id}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
                  Отмена
                </button>
                <button onClick={runSync} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2">
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
                    className={`h-full rounded-full transition-all duration-300 ${
                      progress.status === 'error' ? 'bg-red-500' :
                      progress.status === 'done' ? 'bg-green-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {progress.status === 'done' && (
                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <CheckCircle2 size={16} /> {isUpdate ? 'Данные обновлены успешно' : 'Синхронизация завершена успешно'}
                </div>
              )}
              {progress.status === 'error' && (
                <div className="flex items-start gap-2 text-red-600 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">Ошибка синхронизации</div>
                    {progress.error && <div className="text-xs text-red-500 mt-1">{progress.error}</div>}
                  </div>
                </div>
              )}
              {progress.status === 'running' && (
                <div className="flex items-center gap-2 text-blue-600 text-sm">
                  <RefreshCw size={14} className="animate-spin" /> Выполняется...
                </div>
              )}

              {progress.status === 'error' && (
                <button onClick={onClose} className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
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
