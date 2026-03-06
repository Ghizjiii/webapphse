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

type GroupedDocument = {
  id: string;
  docType: 'certificate' | 'id_card';
  templateName: string;
  fileName: string;
  fileUrl: string;
  generatedAt: string;
  documents: GeneratedDocument[];
  certificates: Certificate[];
  courses: string[];
};

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
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [savingPrinted, setSavingPrinted] = useState(false);
  const [syncingBitrix, setSyncingBitrix] = useState(false);

  const certById = useMemo(() => {
    const map = new Map<string, Certificate>();
    for (const cert of certificates) map.set(cert.id, cert);
    return map;
  }, [certificates]);

  const groupedDocuments = useMemo(() => {
    const groups = new Map<string, GroupedDocument>();

    for (const doc of documents) {
      const key = `${doc.file_url}::${doc.file_name}`;
      const existing = groups.get(key);

      if (!existing) {
        groups.set(key, {
          id: doc.id,
          docType: doc.doc_type,
          templateName: doc.template_name || '',
          fileName: doc.file_name || '',
          fileUrl: doc.file_url || '',
          generatedAt: doc.generated_at,
          documents: [doc],
          certificates: [],
          courses: [],
        });
        continue;
      }

      existing.documents.push(doc);
      if (new Date(doc.generated_at).getTime() > new Date(existing.generatedAt).getTime()) {
        existing.generatedAt = doc.generated_at;
      }
    }

    for (const group of groups.values()) {
      const certs: Certificate[] = [];
      const courseSet = new Set<string>();

      for (const doc of group.documents) {
        if (!doc.certificate_id) continue;
        const cert = certById.get(doc.certificate_id);
        if (!cert) continue;
        certs.push(cert);
        const course = String(cert.course_name || '').trim();
        if (course) courseSet.add(course);
      }

      group.certificates = certs;
      group.courses = Array.from(courseSet).sort((a, b) => a.localeCompare(b, 'ru'));
    }

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
    );
  }, [documents, certById]);

  const courseOptions = useMemo(() => {
    const set = new Set<string>();
    for (const group of groupedDocuments) {
      for (const course of group.courses) set.add(course);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [groupedDocuments]);

  const filteredGroups = useMemo(() => {
    return groupedDocuments.filter(group => {
      if (docFilter !== 'all' && group.docType !== docFilter) return false;
      if (courseFilter === 'all') return true;
      return group.courses.includes(courseFilter);
    });
  }, [groupedDocuments, docFilter, courseFilter]);

  const printedCertificatesForSync = useMemo(() => {
    const map = new Map<string, Certificate>();
    for (const group of filteredGroups) {
      for (const cert of group.certificates) {
        if (!cert.is_printed) continue;
        const bitrixId = String(cert.bitrix_item_id || '').trim();
        if (!bitrixId) continue;
        map.set(cert.id, cert);
      }
    }
    return Array.from(map.values());
  }, [filteredGroups]);

  async function togglePrinted(group: GroupedDocument, nextPrinted: boolean) {
    const certIds = group.certificates.map(c => c.id);
    if (certIds.length === 0) return;

    setSavingPrinted(true);
    try {
      const { error } = await supabase
        .from('certificates')
        .update({ is_printed: nextPrinted, updated_at: new Date().toISOString() })
        .in('id', certIds);
      if (error) throw error;

      showToast(
        'success',
        nextPrinted
          ? `Статус "Напечатан" включен для ${certIds.length} записей`
          : `Статус "Напечатан" выключен для ${certIds.length} записей`
      );
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

    if (printedCertificatesForSync.length === 0) {
      showToast('warning', 'Нет записей для обновления в Bitrix24');
      return;
    }

    setSyncingBitrix(true);
    try {
      const entityTypeId = await findSmartProcessEntityTypeId();
      let success = 0;
      let failed = 0;

      for (const cert of printedCertificatesForSync) {
        const itemId = String(cert.bitrix_item_id || '').trim();
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

      if (failed > 0) {
        showToast('warning', `Частично обновлено в Bitrix24: ${success} успешно, ${failed} с ошибкой`);
      } else {
        showToast('success', `Bitrix24 обновлен: ${success} записей (поле "Напечатан" = Да)`);
      }
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
        <label className="text-xs text-gray-600 flex items-center gap-2">
          <span>Курс:</span>
          <select
            value={courseFilter}
            onChange={e => setCourseFilter(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
          >
            <option value="all">Все курсы</option>
            {courseOptions.map(course => (
              <option key={course} value={course}>{course}</option>
            ))}
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
          <table className="w-full text-sm min-w-[1080px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Тип</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Шаблон</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Файл</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Курс</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Сотрудников</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Дата генерации</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Ссылка</th>
                <th className="text-left px-4 py-3 text-xs uppercase tracking-wide text-gray-600">Напечатан</th>
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map(group => {
                const certCount = group.certificates.length;
                const printedCount = group.certificates.filter(c => c.is_printed).length;
                const allPrinted = certCount > 0 && printedCount === certCount;

                return (
                  <tr key={group.id} className="border-b border-gray-50 last:border-b-0">
                    <td className="px-4 py-2 text-xs">
                      {group.docType === 'certificate' ? 'Сертификат' : 'Удостоверение'}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-700">{group.templateName || '-'}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{group.fileName || '-'}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{group.courses.join(', ') || '-'}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{certCount}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{formatDateTime(group.generatedAt)}</td>
                    <td className="px-4 py-2 text-xs">
                      <a
                        href={group.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Открыть <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {certCount > 0 ? (
                        <button
                          onClick={() => void togglePrinted(group, !allPrinted)}
                          disabled={savingPrinted}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${
                            allPrinted
                              ? 'border-green-200 text-green-700 bg-green-50 hover:bg-green-100'
                              : 'border-gray-200 text-gray-600 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          {allPrinted ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          {allPrinted ? `Да (${printedCount}/${certCount})` : `Нет (${printedCount}/${certCount})`}
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredGroups.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">
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
