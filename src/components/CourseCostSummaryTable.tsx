import { useState } from 'react';
import type { CourseCostSummaryMode, CourseCostSummaryRow, CourseCostSummarySet } from '../lib/courseCostSummary';

interface Props {
  summaries: CourseCostSummarySet;
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';

  const hasFractions = Math.round(value * 100) !== Math.round(value) * 100;
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: hasFractions ? 2 : 0,
    maximumFractionDigits: 2,
  })} ₸`;
}

function formatUnitPrice(row: CourseCostSummaryRow, mode: CourseCostSummaryMode): string {
  if (mode === 'combined' && row.hasPriceVariance) return 'Разные цены';
  return formatMoney(row.unitPrice);
}

function buildCombinedRowNote(row: CourseCostSummaryRow): string {
  if (!row.hasPriceVariance && row.breakdownItems.length <= 1 && row.breakdownItems[0]?.unitPrice !== null) {
    return '—';
  }

  return row.breakdownItems
    .map(item => {
      if (item.unitPrice === null) {
        return `${item.label}: ${item.employeesCount} без цены`;
      }

      return `${item.label}: ${item.employeesCount} × ${formatMoney(item.unitPrice)} = ${formatMoney(item.totalPrice)}`;
    })
    .join('; ');
}

function buildSeparateRowNote(row: CourseCostSummaryRow): string {
  const notes: string[] = [];

  if (row.unitPrice === null) {
    notes.push('Цена не заполнена');
  }

  if (row.hasPriceVariance) {
    notes.push('В этой категории есть другие цены');
  }

  return notes.join(' · ') || '—';
}

export default function CourseCostSummaryTable({ summaries }: Props) {
  const [viewMode, setViewMode] = useState<CourseCostSummaryMode>('combined');
  const activeSummary = viewMode === 'combined' ? summaries.combined : summaries.separate;

  if (summaries.separate.rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-gray-500">
        Пока нет записей в разделе «Удостоверения и сертификаты», поэтому сводка по стоимости курсов еще не сформирована.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {[
          { key: 'combined' as const, label: 'Все сотрудники', count: summaries.combined.rows.length },
          { key: 'separate' as const, label: 'Раздельно', count: summaries.separate.rows.length },
        ].map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setViewMode(item.key)}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-all ${
              viewMode === item.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            {item.label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${viewMode === item.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      <div className="text-sm text-gray-500">
        {viewMode === 'combined'
          ? 'Здесь курс собирается в одну строку по всем сотрудникам. Если внутри курса цены отличаются, итог считается корректно, а расшифровка показывается в примечании.'
          : 'Здесь стоимость показана раздельно по категориям сотрудников, чтобы отдельно видеть ИТР и обычный состав.'}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Курсы сводка</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{activeSummary.rows.length}</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Сотрудников</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{activeSummary.totalParticipantsCount}</div>
          <div className="mt-1 text-xs text-gray-500">Уникальные сотрудники в анкете</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Заявок</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{activeSummary.totalRequestsCount}</div>
          <div className="mt-1 text-xs text-gray-500">Все заявки по курсам из таблицы ниже</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Итоговая сумма</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">{formatMoney(activeSummary.grandTotal)}</div>
          <div className="mt-1 text-xs text-gray-500">Считается только по строкам с заполненной ценой</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">Без цены</div>
          <div className="mt-1 text-xl font-semibold text-amber-600">{activeSummary.missingPriceRequestsCount}</div>
          <div className="mt-1 text-xs text-gray-500">Заявок не попали в итог, пока цена не заполнена</div>
        </div>
      </div>

      {activeSummary.missingPriceRequestsCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          У {activeSummary.missingPriceRequestsCount} заявок цена курса пока не заполнена. Эти строки показаны в таблице, но не включены в итоговую сумму.
        </div>
      )}

      {activeSummary.mismatchedGroups.length > 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <div className="font-medium">
            {viewMode === 'combined'
              ? 'В общем режиме часть курсов содержит несколько цен. В строке курса это показывается как «Разные цены», а детализация вынесена в примечание.'
              : 'В раздельном режиме для части курсов внутри одной категории обнаружены разные цены. Таблица разбивает такие случаи на отдельные строки, чтобы сумма считалась корректно.'}
          </div>
          <div className="mt-2 space-y-1 text-xs text-orange-800">
            {activeSummary.mismatchedGroups.slice(0, 4).map(group => (
              <div key={group.key}>
                {group.courseName} · {group.categoryLabel} · цены: {group.priceOptions.map(price => formatMoney(price)).join(', ')}
              </div>
            ))}
            {activeSummary.mismatchedGroups.length > 4 && (
              <div>И еще {activeSummary.mismatchedGroups.length - 4} групп с расхождением цен.</div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">№</th>
              <th className="px-4 py-3 text-left font-medium">Курс</th>
              {viewMode === 'separate' && <th className="px-4 py-3 text-left font-medium">Категория</th>}
              <th className="px-4 py-3 text-left font-medium">Цена за 1 сотрудника</th>
              <th className="px-4 py-3 text-left font-medium">Кол-во сотрудников</th>
              <th className="px-4 py-3 text-left font-medium">Сумма</th>
              <th className="px-4 py-3 text-left font-medium">Примечание</th>
            </tr>
          </thead>
          <tbody>
            {activeSummary.rows.map((row, index) => (
              <tr key={row.key} className="border-t border-gray-100 align-top">
                <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                <td className="px-4 py-3 text-gray-900">{row.courseName}</td>
                {viewMode === 'separate' && <td className="px-4 py-3 text-gray-700">{row.categoryLabel}</td>}
                <td className="px-4 py-3 font-medium text-gray-900">{formatUnitPrice(row, viewMode)}</td>
                <td className="px-4 py-3 text-gray-700">{row.employeesCount}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{formatMoney(row.totalPrice)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {viewMode === 'combined' ? buildCombinedRowNote(row) : buildSeparateRowNote(row)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={viewMode === 'combined' ? 4 : 5} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                Итого по заполненным ценам
              </td>
              <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatMoney(activeSummary.grandTotal)}</td>
              <td className="px-4 py-3 text-xs text-gray-500">
                Учтено заявок: {activeSummary.pricedRequestsCount} из {activeSummary.totalParticipantsCount} сотрудников
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
