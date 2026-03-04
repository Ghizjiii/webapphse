import { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle, XCircle } from 'lucide-react';
import SortableHeader from './SortableHeader';
import ResizableTableContainer from './ResizableTableContainer';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import type { Certificate, SortConfig } from '../types';

interface Props {
  questionnaireId: string;
  dealId: string | null;
  companyId: string | null;
  certificates: Certificate[];
  onRefresh: () => void;
}

const TEXT_FIELDS: { key: keyof Certificate; label: string }[] = [
  { key: 'last_name', label: 'Фамилия' },
  { key: 'first_name', label: 'Имя' },
  { key: 'middle_name', label: 'Отчество' },
  { key: 'position', label: 'Должность' },
  { key: 'category', label: 'Категория' },
  { key: 'course_name', label: 'Наим. курса' },
  { key: 'document_number', label: 'Номер документа' },
  { key: 'protocol_number', label: 'Протокол' },
  { key: 'commission_chair', label: 'Председатель' },
  { key: 'commission_member_1', label: 'Член комис. 1' },
  { key: 'commission_member_2', label: 'Член комис. 2' },
  { key: 'commission_member_3', label: 'Член комис. 3' },
  { key: 'commission_member_4', label: 'Член комис. 4' },
  { key: 'commission_members', label: 'Все члены' },
  { key: 'qualification', label: 'Квалификация' },
  { key: 'manager', label: 'Руководитель' },
  { key: 'employee_status', label: 'Статус сотр.' },
];

function sortCerts(list: Certificate[], cfg: SortConfig | null): Certificate[] {
  if (!cfg) return list;
  return [...list].sort((a, b) => {
    const aVal = String((a as Record<string, unknown>)[cfg.key] ?? '');
    const bVal = String((b as Record<string, unknown>)[cfg.key] ?? '');
    const cmp = aVal.localeCompare(bVal, 'ru');
    return cfg.direction === 'asc' ? cmp : -cmp;
  });
}

interface EditCell { certId: string; field: string; }

export default function CertificatesTable({ questionnaireId, dealId, companyId, certificates, onRefresh }: Props) {
  const { showToast } = useToast();
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [editCell, setEditCell] = useState<EditCell | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => sortCerts(certificates, sortConfig), [certificates, sortConfig]);

  function handleSort(key: string) {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  }

  async function addCertificate() {
    const { error } = await supabase.from('certificates').insert({
      questionnaire_id: questionnaireId,
      deal_id: dealId,
      company_id: companyId,
      is_printed: false,
      sync_status: 'pending',
    });
    if (error) { showToast('error', 'Ошибка добавления'); return; }
    onRefresh();
  }

  async function deleteCertificate(id: string) {
    await supabase.from('certificates').delete().eq('id', id);
    onRefresh();
  }

  function startEdit(certId: string, field: string, value: string) {
    setEditCell({ certId, field });
    setEditValue(value ?? '');
  }

  async function saveEdit() {
    if (!editCell) return;
    setSaving(true);
    const val = editCell.field.includes('date')
      ? (editValue ? editValue : null)
      : editValue;
    const { error } = await supabase
      .from('certificates')
      .update({ [editCell.field]: val, updated_at: new Date().toISOString() })
      .eq('id', editCell.certId);
    if (error) showToast('error', 'Ошибка сохранения');
    setSaving(false);
    setEditCell(null);
    onRefresh();
  }

  function EditableCell({ certId, field, value }: { certId: string; field: string; value: string }) {
    const isEditing = editCell?.certId === certId && editCell?.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditCell(null); }}
          className="w-full px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50 min-w-[80px]"
          disabled={saving}
        />
      );
    }
    return (
      <div
        className="px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[20px] text-xs whitespace-nowrap"
        onClick={() => startEdit(certId, field, value)}
      >
        {value || <span className="text-gray-300">—</span>}
      </div>
    );
  }

  function EditableDateCell({ certId, field, value }: { certId: string; field: string; value: string | null }) {
    const isEditing = editCell?.certId === certId && editCell?.field === field;
    const displayVal = value ? new Date(value).toLocaleDateString('ru-RU') : '';
    if (isEditing) {
      return (
        <input
          autoFocus
          type="date"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditCell(null); }}
          className="px-2 py-1 border border-blue-400 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50"
          disabled={saving}
        />
      );
    }
    return (
      <div
        className="px-1 py-0.5 rounded cursor-pointer hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all min-h-[20px] text-xs whitespace-nowrap"
        onClick={() => startEdit(certId, field, value?.split('T')[0] || '')}
      >
        {displayVal || <span className="text-gray-300">—</span>}
      </div>
    );
  }

  return (
    <div>
      <ResizableTableContainer>
        <table className="w-full text-sm" style={{ minWidth: '1600px' }}>
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-200">
              {TEXT_FIELDS.map(f => (
                <SortableHeader key={f.key} label={f.label} sortKey={f.key} sortConfig={sortConfig} onSort={handleSort} />
              ))}
              <SortableHeader label="Нач. курса" sortKey="start_date" sortConfig={sortConfig} onSort={handleSort} />
              <SortableHeader label="Срок документа" sortKey="expiry_date" sortConfig={sortConfig} onSort={handleSort} />
              <th className="text-left px-4 py-3.5 font-medium text-gray-600 text-xs uppercase tracking-wider whitespace-nowrap">Напечатан</th>
              <th className="px-4 py-3.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(cert => (
              <tr key={cert.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                {TEXT_FIELDS.map(f => (
                  <td key={f.key} className="px-4 py-2">
                    <EditableCell certId={cert.id} field={f.key} value={String(cert[f.key] ?? '')} />
                  </td>
                ))}
                <td className="px-4 py-2">
                  <EditableDateCell certId={cert.id} field="start_date" value={cert.start_date} />
                </td>
                <td className="px-4 py-2">
                  <EditableDateCell certId={cert.id} field="expiry_date" value={cert.expiry_date} />
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${cert.is_printed ? 'text-green-600' : 'text-gray-400'}`}>
                    {cert.is_printed
                      ? <><CheckCircle size={13} /> Да</>
                      : <><XCircle size={13} /> Нет</>
                    }
                  </span>
                </td>
                <td className="px-4 py-2">
                  <button onClick={() => deleteCertificate(cert.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={TEXT_FIELDS.length + 3} className="px-4 py-8 text-center text-gray-400 text-sm">
                  Нет записей. Добавьте документ или выполните синхронизацию с Битрикс24.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ResizableTableContainer>

      <button
        onClick={addCertificate}
        className="mt-4 flex items-center gap-2 px-4 py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all"
      >
        <Plus size={15} /> Добавить запись
      </button>
    </div>
  );
}
