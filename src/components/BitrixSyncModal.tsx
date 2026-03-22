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
  BITRIX_FIELDS_RAW,
  findSmartProcessEntityTypeId,
  resolveSmartProcessEnumId,
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

function decodeUnicodeEscapes(input: string): string {
  return input.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function prettifySyncError(msg: string): string {
  const decoded = decodeUnicodeEscapes(msg || '');
  return decoded
    .replace(/UF_CRM_BIN_IIN/g, '\u0411\u0418\u041d/\u0418\u0418\u041d \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438')
    .replace(/custom field/gi, '\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u0441\u043a\u043e\u0435 \u043f\u043e\u043b\u0435')
    .replace(/company card/gi, '\u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0435 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438');
}

export default function BitrixSyncModal({ questionnaireId, company, participants, dealId, existingDeal, onClose, onDone }: Props) {
  const { showToast } = useToast();
  const [progress, setProgress] = useState<BitrixSyncProgress>({ step: '', current: 0, total: 0, status: 'idle' });
  const [started, setStarted] = useState(false);

  const isUpdate = !!(existingDeal?.bitrix_deal_id);

  const allCourses = [...new Set(participants.flatMap(p => (p.courses || []).map(c => c.course_name)).filter(Boolean))];
  const participantsCount = participants.length;
  const uniqueCoursesCount = allCourses.length;
  const totalCourseRequests = participants.reduce((sum, p) => sum + (p.courses?.length || 0), 0);

  const titlePrefix = [company.name, company.city].filter(Boolean).join(' - ');
  const dealTitle = [
    titlePrefix,
    `${participantsCount} \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432, ${uniqueCoursesCount} \u043a\u0443\u0440\u0441\u043e\u0432, ${totalCourseRequests} \u0437\u0430\u044f\u0432\u043e\u043a \u043d\u0430 \u043a\u0443\u0440\u0441\u044b`,
  ].filter(Boolean).join(' - ');

  async function runSync() {
    setStarted(true);

    try {
      const entityTypeId = await (async () => {
        setProgress({ step: '\u041f\u043e\u0438\u0441\u043a \u0441\u043c\u0430\u0440\u0442-\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0430...', current: 0, total: 4, status: 'running' });
        return await findSmartProcessEntityTypeId();
      })();

      let bitrixCompanyId: string;
      let bitrixDealId: string;

      if (isUpdate && existingDeal) {
        setProgress({ step: '\u041e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u043c \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044e \u0432 \u0411\u0438\u0442\u0440\u0438\u043a\u044124...', current: 1, total: 4, status: 'running' });
        bitrixCompanyId = existingDeal.bitrix_company_id;
        if (bitrixCompanyId) {
          bitrixCompanyId = await updateCompany(bitrixCompanyId, {
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
        }
        await supabase.from('companies').update({ bitrix_company_id: bitrixCompanyId }).eq('id', company.id);

        setProgress({ step: '\u041e\u0431\u043d\u043e\u0432\u043b\u044f\u0435\u043c \u0441\u0434\u0435\u043b\u043a\u0443...', current: 2, total: 4, status: 'running' });
        bitrixDealId = existingDeal.bitrix_deal_id;
        await updateDeal(bitrixDealId, {
          title: dealTitle,
          companyId: bitrixCompanyId,
          city: company.city,
          paymentOrderUrl: String(company.payment_order_url || ''),
          paymentOrderName: String(company.payment_order_name || ''),
          paymentIsPaid: Boolean(company.payment_is_paid),
        });

        await supabase.from('deals').update({
          deal_title: dealTitle,
          bitrix_company_id: bitrixCompanyId,
          sync_status: 'in_progress',
          updated_at: new Date().toISOString(),
        }).eq('id', existingDeal.id);

        setProgress({ step: '\u0423\u0434\u0430\u043b\u044f\u0435\u043c \u0441\u0442\u0430\u0440\u044b\u0435 \u0437\u0430\u043f\u0438\u0441\u0438...', current: 3, total: 4, status: 'running' });
        const { data: oldCerts } = await supabase
          .from('certificates')
          .select('id, bitrix_item_id')
          .eq('questionnaire_id', questionnaireId)
          .not('bitrix_item_id', 'is', null);

        const deleteIds = Array.from(new Set(
          (oldCerts || [])
            .map(c => String(c.bitrix_item_id || '').trim())
            .filter(id => /^\d+$/.test(id))
        ));

        for (const itemId of deleteIds) {
          try {
            await deleteSmartProcessItem({ entityTypeId, itemId });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e || '');
            // Missing item is expected in resync scenarios.
            if (!/NOT_FOUND|Элемент не найден/i.test(msg)) {
              // ignore other delete errors too, but keep them visible in console for diagnostics
              console.warn('[BitrixSyncModal] deleteSmartProcessItem failed', itemId, msg);
            }
          }
        }

        for (const cert of oldCerts || []) {
          await supabase.from('certificates').delete().eq('id', cert.id);
        }
      } else {
        setProgress({ step: '\u0421\u043e\u0437\u0434\u0430\u0451\u043c \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044e \u0432 \u0411\u0438\u0442\u0440\u0438\u043a\u044124...', current: 1, total: 4, status: 'running' });
        bitrixCompanyId = await createCompany({
          name: company.name,
          phone: company.phone,
          email: company.email,
          bin_iin: company.bin_iin,
        });
        await supabase.from('companies').update({ bitrix_company_id: bitrixCompanyId }).eq('id', company.id);

        setProgress({ step: '\u0421\u043e\u0437\u0434\u0430\u0451\u043c \u0441\u0434\u0435\u043b\u043a\u0443...', current: 2, total: 4, status: 'running' });
        bitrixDealId = await createDeal({
          title: dealTitle,
          companyId: bitrixCompanyId,
          city: company.city,
          paymentOrderUrl: String(company.payment_order_url || ''),
          paymentOrderName: String(company.payment_order_name || ''),
          paymentIsPaid: Boolean(company.payment_is_paid),
        });
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
      const totalItems = participants.reduce((s, p) => s + Math.max(1, (p.courses || []).length), 0);
      let created = 0;
      let photoFailures = 0;
      const photoFailureSamples: string[] = [];

      setProgress({ step: '\u0421\u043e\u0437\u0434\u0430\u0451\u043c \u0437\u0430\u043f\u0438\u0441\u0438 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432...', current: 3, total: 3 + totalItems, status: 'running' });

      for (const p of participants) {
        const courses = p.courses && p.courses.length > 0 ? p.courses : [{ course_name: '' }];
        for (const course of courses) {
          const categoryValue = (await resolveSmartProcessEnumId({
            entityTypeId,
            fieldRawName: BITRIX_FIELDS_RAW.CATEGORY,
            fieldCamelName: BITRIX_FIELDS.CATEGORY,
            value: p.category || '',
          })) || p.category;

          const courseValue = (await resolveSmartProcessEnumId({
            entityTypeId,
            fieldRawName: BITRIX_FIELDS_RAW.COURSE_NAME,
            fieldCamelName: BITRIX_FIELDS.COURSE_NAME,
            value: course.course_name || '',
          })) || course.course_name;

          const fields: Record<string, unknown> = {
            TITLE: `${p.last_name} ${p.first_name} - ${course.course_name}`,
            [BITRIX_FIELDS.LAST_NAME]: p.last_name,
            [BITRIX_FIELDS_RAW.LAST_NAME]: p.last_name,
            [BITRIX_FIELDS.FIRST_NAME]: p.first_name,
            [BITRIX_FIELDS_RAW.FIRST_NAME]: p.first_name,
            [BITRIX_FIELDS.MIDDLE_NAME]: p.patronymic,
            [BITRIX_FIELDS_RAW.MIDDLE_NAME]: p.patronymic,
            [BITRIX_FIELDS.POSITION]: p.position,
            [BITRIX_FIELDS_RAW.POSITION]: p.position,
            [BITRIX_FIELDS.CATEGORY]: categoryValue,
            [BITRIX_FIELDS_RAW.CATEGORY]: categoryValue,
            [BITRIX_FIELDS.COURSE_NAME]: courseValue,
            [BITRIX_FIELDS_RAW.COURSE_NAME]: courseValue,
          };

          const bitrixItemId = await createSmartProcessItem({
            entityTypeId,
            dealId: bitrixDealId,
            companyId: bitrixCompanyId,
            fields,
          });

          if (p.photo_url) {
            const fullName = [p.last_name, p.first_name, p.patronymic].filter(Boolean).join(' ');
            try {
              await attachPhotoToSmartItem({
                entityTypeId,
                itemId: bitrixItemId,
                photoUrl: p.photo_url,
                participantName: fullName,
              });
            } catch (err) {
              // Keep main sync successful even if photo attachment fails for some rows.
              photoFailures++;
              if (photoFailureSamples.length < 3) {
                const reason = err instanceof Error ? err.message : String(err || 'Unknown photo error');
                const who = fullName || `${p.last_name} ${p.first_name}`.trim() || p.id;
                photoFailureSamples.push(`${who}: ${reason}`);
              }
            }
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
            step: `\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u0437\u0430\u043f\u0438\u0441\u0435\u0439 (${created}/${totalItems})...`,
            current: 3 + created,
            total: 3 + totalItems,
            status: 'running',
          });
        }
      }

      await supabase.from('deals').update({
        sync_status: 'success',
        synced_at: new Date().toISOString(),
        deal_url: dealUrl,
        bitrix_deal_id: bitrixDealId,
        bitrix_company_id: bitrixCompanyId,
      }).eq('questionnaire_id', questionnaireId);

      await supabase.from('questionnaires').update({ status: 'synced' }).eq('id', questionnaireId);

      setProgress({ step: '\u0413\u043e\u0442\u043e\u0432\u043e!', current: 3 + totalItems, total: 3 + totalItems, status: 'done' });
      if (photoFailures > 0) {
        const suffix = photoFailureSamples.length > 0 ? ` Примеры: ${photoFailureSamples.join(' | ')}` : '';
        showToast('warning', `Синхронизация завершена, но фото не прикрепились у ${photoFailures} записей.${suffix}`);
      }
      showToast('success', isUpdate
        ? `\u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b: ${dealTitle}`
        : `\u0421\u0434\u0435\u043b\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0430: ${dealTitle}`);
      setTimeout(onDone, 1500);
    } catch (e) {
      const rawMsg = e instanceof Error ? e.message : '\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u0430\u044f \u043e\u0448\u0438\u0431\u043a\u0430';
      const msg = prettifySyncError(rawMsg);
      setProgress(p => ({ ...p, status: 'error', error: msg }));
      await supabase.from('deals').update({ sync_status: 'error', error_message: msg }).eq('questionnaire_id', questionnaireId);
      showToast('error', `\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u0438: ${msg}`);
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isUpdate ? '\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435 \u0432 \u0411\u0438\u0442\u0440\u0438\u043a\u044124' : '\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0432 \u0411\u0438\u0442\u0440\u0438\u043a\u044124'}
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
                  <span>{'\u0421\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0435 \u0437\u0430\u043f\u0438\u0441\u0438 \u0441\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432 \u0431\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043b\u0435\u043d\u044b \u0438 \u0441\u043e\u0437\u0434\u0430\u043d\u044b \u0437\u0430\u043d\u043e\u0432\u043e. \u0421\u0434\u0435\u043b\u043a\u0430 \u0438 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u044f \u0431\u0443\u0434\u0443\u0442 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b.'}</span>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">{'\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0441\u0434\u0435\u043b\u043a\u0438:'}</span>
                  <span className="font-medium text-gray-900 leading-snug">{dealTitle}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">{'\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u044f:'}</span>
                  <span className="font-medium text-gray-900">{company.name}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">{'\u0421\u043e\u0442\u0440\u0443\u0434\u043d\u0438\u043a\u043e\u0432:'}</span>
                  <span className="font-medium text-gray-900">{participantsCount}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">{'\u041a\u0443\u0440\u0441\u043e\u0432:'}</span>
                  <span className="font-medium text-gray-900">{uniqueCoursesCount}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500 w-28 flex-shrink-0">{'\u0417\u0430\u044f\u0432\u043e\u043a:'}</span>
                  <span className="font-medium text-gray-900">{totalCourseRequests}</span>
                </div>
                {isUpdate && existingDeal?.bitrix_deal_id && (
                  <div className="flex gap-2">
                    <span className="text-gray-500 w-28 flex-shrink-0">{'ID \u0441\u0434\u0435\u043b\u043a\u0438:'}</span>
                    <span className="font-medium text-gray-900">#{existingDeal.bitrix_deal_id}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
                  {'\u041e\u0442\u043c\u0435\u043d\u0430'}
                </button>
                <button onClick={runSync} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2">
                  {isUpdate ? <><RefreshCw size={15} /> {'\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c'}</> : <><Send size={15} /> {'\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c'}</>}
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
                  <CheckCircle2 size={16} /> {isUpdate ? '\u0414\u0430\u043d\u043d\u044b\u0435 \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u044b \u0443\u0441\u043f\u0435\u0448\u043d\u043e' : '\u0421\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u044f \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430 \u0443\u0441\u043f\u0435\u0448\u043d\u043e'}
                </div>
              )}
              {progress.status === 'error' && (
                <div className="flex items-start gap-2 text-red-600 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium">{'\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0438\u043d\u0445\u0440\u043e\u043d\u0438\u0437\u0430\u0446\u0438\u0438'}</div>
                    {progress.error && <div className="text-xs text-red-500 mt-1">{progress.error}</div>}
                  </div>
                </div>
              )}
              {progress.status === 'running' && (
                <div className="flex items-center gap-2 text-blue-600 text-sm">
                  <RefreshCw size={14} className="animate-spin" /> {'\u0412\u044b\u043f\u043e\u043b\u043d\u044f\u0435\u0442\u0441\u044f...'}
                </div>
              )}

              {progress.status === 'error' && (
                <button onClick={onClose} className="w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
                  {'\u0417\u0430\u043a\u0440\u044b\u0442\u044c'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
