import { useMemo, useState } from 'react';
import { ExternalLink, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BITRIX_FIELDS, findSmartProcessEntityTypeId, updateSmartProcessItem } from '../lib/bitrix';
import { useToast } from '../context/ToastContext';
import type { Certificate, GeneratedDocument } from '../types';

interface Props {
  documents: GeneratedDocument[];
  certificates: Certificate[];
  bitrixDealId?: string | null;
  bitrixCompanyId?: string | null;
  onRefresh: () => void;
}

type DocFilter = 'all' | 'certificate' | 'id_card';

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

export default function PrintedDocumentsTable({
  documents,
  certificates,
  bitrixDealId = null,
  bitrixCompanyId = null,
  onRefresh,
}: Props) {
  const { showToast } = useToast();
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [savingPrinted, setSavingPrinted] = useState(false);
  const [syncingBitrix, setSyncingBitrix] = useState(false);

  const certById = useMemo(() => {
    const map = new Map<string, Certificate>();
    for (const cert of certificates) map.set(cert.id, cert);
    return map;
  }, [certificates]);

  const filteredDocs = useMemo(
    () => documents.filter(doc => (docFilter === 'all' ? true : doc.doc_type === docFilter)),
    [documents, docFilter]
  );

  const printedRows = useMemo(
    () =>
      filteredDocs
        .map(doc => ({
          doc,
          cert: doc.certificate_id ? certById.get(doc.certificate_id) : undefined,
        }))
        .filter(row => row.cert?.is_printed && String(row.cert?.bitrix_item_id || '').trim().length > 0),
    [filteredDocs, certById]
  );

  async function togglePrinted(doc: GeneratedDocument, nextPrinted: boolean) {
    if (!doc.certificate_id) return;
    setSavingPrinted(true);
    try {
      const { error } = await supabase
        .from('certificates')
        .update({ is_printed: nextPrinted, updated_at: new Date().toISOString() })
        .eq('id', doc.certificate_id);
      if (error) throw error;
      showToast('success', nextPrinted ? 'Статус: Напечатан' : 'Статус: Не напечатан');
      onRefresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка обновления статуса';
      showToast('error', msg);
    } finally {
      setSavingPrinted(false);
    }
  }

  async function syncPrintedToBitrix() {
    if (syncingBitrix) return;

    if (!bitrixDealId || !bitrixCompanyId) {
      showToast('error', 'Сначала выполните синхронизацию анкеты в Bitrix24 (нет ID сделки/компании)');
      return;
    }

    if (printedRows.length === 0) {
      showToast('warning', 'Нет строк для обновления в Bitrix24');
      return;
    }

    setSyncingBitrix(true);
    try {
      const entityTypeId = await findSmartProcessEntityTypeId();
      let success = 0;
      let failed = 0;

      for (const row of printedRows) {
        const itemId = String(row.cert?.bitrix_item_id || '').trim();
        if (!itemId) continue;
        try {
          await updateSmartProcessItem({
            entityTypeId,
            itemId,
            fields: {
              [BITRIX_FIELDS.IS_PRINTED]: '1',
            },
          });
          success++;
        } catch {
          failed++;
        }
      }

      if (failed > 0) showToast('warning', `Частично обновлено в Bitrix24: ${success} успешно, ${failed} с ошибкой`);
      else showToast('success', `Bitrix24 обновлен: ${success} записей (поле "Напечатан" = Да)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка синхронизации';
      showToast('error', msg);
    } finally {
      setSyncingBitrix(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-600 flex items-center gap-2">
          <span>Тип документа:</span>
          <select
            value={docFilter}
            onChange={e => setDocFilter(e.target.value as DocFilter)}
            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
          >
            <option value="all">Все</option>
            <option value="id_card">Удостоверения</option>
            <option value="certificate">Сертификаты</option>
          </select>
        </label>

        <button
          onClick={() => void syncPrintedToBitrix()}
          disabled={syncingBitrix}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={syncingBitrix ? 'animate-spin' : ''} />
          {syncingBitrix ? 'Обновление...' : 'Обновить статус "Напечатан" в Bitrix24'}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Тип</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Шаблон</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Файл</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Дата генерации</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Ссылка</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Напечатан</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map(doc => {
                const cert = doc.certificate_id ? certById.get(doc.certificate_id) : undefined;
                const printed = !!cert?.is_printed;
                return (
                  <tr key={doc.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-4 py-2 text-xs">
                      {doc.doc_type === 'certificate' ? 'Сертификат' : 'Удостоверение'}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">{doc.template_name || '-'}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{doc.file_name || '-'}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{formatDateTime(doc.generated_at)}</td>
                    <td className="px-4 py-2 text-xs">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Открыть <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {doc.certificate_id ? (
                        <button
                          onClick={() => void togglePrinted(doc, !printed)}
                          disabled={savingPrinted}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${
                            printed
                              ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                              : 'border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          {printed ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          {printed ? 'Да' : 'Нет'}
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredDocs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Сгенерированные документы пока отсутствуют.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
