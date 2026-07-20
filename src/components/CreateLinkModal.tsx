import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { QuestionnaireRequestType } from '../types';

type CreateQuestionnairePayload = {
  request_type: QuestionnaireRequestType;
  region_bitrix_item_id: string;
  region_name: string;
  expires_at: string | null;
  payment_order_optional: boolean;
};

type RegionOption = {
  bitrix_item_id: string;
  name: string;
};

interface Props {
  responsibleName: string;
  defaultRegion?: RegionOption | null;
  onClose: () => void;
  onCreate: (data: CreateQuestionnairePayload) => void;
}

export default function CreateLinkModal({ responsibleName, defaultRegion, onClose, onCreate }: Props) {
  const defaultRegionId = defaultRegion?.bitrix_item_id || '';
  const defaultRegionName = defaultRegion?.name || '';
  const hasDefaultRegion = Boolean(defaultRegionId);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [requestType, setRequestType] = useState<QuestionnaireRequestType>(hasDefaultRegion ? 'internal' : 'external');
  const [paymentOrderOptional, setPaymentOrderOptional] = useState(false);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState(defaultRegionId);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [regionsError, setRegionsError] = useState('');

  useEffect(() => {
    if (!hasDefaultRegion) return;

    setRequestType('internal');
    setSelectedRegionId(defaultRegionId);
  }, [defaultRegionId, hasDefaultRegion]);

  useEffect(() => {
    let cancelled = false;

    async function loadRegions() {
      setLoadingRegions(true);
      setRegionsError('');

      const { data, error } = await supabase
        .from('ref_bitrix_list_items')
        .select('bitrix_item_id, name')
        .eq('list_key', 'REGIONS')
        .order('sort_order')
        .order('name');

      if (cancelled) return;

      if (error) {
        const fallbackRegions = defaultRegionId && defaultRegionName
          ? [{ bitrix_item_id: defaultRegionId, name: defaultRegionName }]
          : [];

        setRegions(fallbackRegions);
        setSelectedRegionId((current) => current || defaultRegionId);
        setRegionsError('Не удалось загрузить список регионов / отделов.');
        setLoadingRegions(false);
        return;
      }

      const loadedRegions = (data || [])
        .map((item) => ({
          bitrix_item_id: String(item.bitrix_item_id || '').trim(),
          name: String(item.name || '').trim(),
        }))
        .filter((item) => item.bitrix_item_id && item.name);

      const nextRegions = [...loadedRegions];
      if (
        defaultRegionId &&
        defaultRegionName &&
        !nextRegions.some((region) => region.bitrix_item_id === defaultRegionId)
      ) {
        nextRegions.unshift({ bitrix_item_id: defaultRegionId, name: defaultRegionName });
      }

      setRegions(nextRegions);
      setSelectedRegionId((current) => {
        if (hasDefaultRegion) return defaultRegionId;
        return current || nextRegions[0]?.bitrix_item_id || '';
      });
      setLoadingRegions(false);
    }

    void loadRegions();

    return () => {
      cancelled = true;
    };
  }, [defaultRegionId, defaultRegionName, hasDefaultRegion]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const selectedRegion = requestType === 'internal'
      ? regions.find((region) => region.bitrix_item_id === selectedRegionId)
      : null;
    if (requestType === 'internal' && !selectedRegion) return;

    let expires_at: string | null = null;
    if (hasExpiry && expiryDate) {
      expires_at = new Date(`${expiryDate}T23:59:59`).toISOString();
    }

    onCreate({
      request_type: requestType,
      region_bitrix_item_id: selectedRegion?.bitrix_item_id || '',
      region_name: selectedRegion?.name || '',
      expires_at,
      payment_order_optional: paymentOrderOptional,
    });
  }

  const minDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const requestTypeOptions = hasDefaultRegion
    ? ([{ value: 'internal', label: 'Внутренняя' }] as const)
    : ([
        { value: 'external', label: 'Внешняя' },
        { value: 'internal', label: 'Внутренняя' },
      ] as const);
  const showsRegionSelect = requestType === 'internal';
  const canSubmit = !showsRegionSelect || (!loadingRegions && regions.length > 0 && Boolean(selectedRegionId));
  const paymentOrderRequired = !paymentOrderOptional;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900">Создать анкету</h2>
          <button onClick={onClose} className="text-gray-400 transition-colors hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Новая заявка</div>
            <p className="mt-1 text-sm text-gray-700">
              Номер заявки будет присвоен автоматически после создания.
            </p>
            <p className="mt-2 text-sm text-gray-700">
              <span className="font-medium text-gray-900">Ответственный:</span> {responsibleName}
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Тип заявки</label>
            <div className={`grid ${requestTypeOptions.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} rounded-xl border border-gray-200 bg-gray-50 p-1`}>
              {requestTypeOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setRequestType(option.value);
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                    requestType === option.value
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {showsRegionSelect && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Регион / отдел</label>
              <select
                value={selectedRegionId}
                onChange={(event) => setSelectedRegionId(event.target.value)}
                disabled={loadingRegions || regions.length === 0 || hasDefaultRegion}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                required
              >
                {loadingRegions ? (
                  <option value="">Загрузка списка...</option>
                ) : regions.length === 0 ? (
                  <option value="">Нет доступных регионов / отделов</option>
                ) : (
                  regions.map((region) => (
                    <option key={region.bitrix_item_id} value={region.bitrix_item_id}>
                      {region.name}
                    </option>
                  ))
                )}
              </select>
              {regionsError ? (
                <p className="mt-1.5 text-xs text-red-500">{regionsError}</p>
              ) : regions.length === 0 && !loadingRegions ? (
                <p className="mt-1.5 text-xs text-amber-600">
                  Список пуст. Сначала создайте и синхронизируйте справочник регионов / отделов из Bitrix24.
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500">
                  Значения берутся из справочника Bitrix24.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="flex cursor-pointer items-center gap-2.5">
              <div
                onClick={() => setHasExpiry((prev) => !prev)}
                className={`flex h-5.5 w-10 rounded-full px-0.5 transition-colors ${hasExpiry ? 'bg-blue-600' : 'bg-gray-300'}`}
                style={{ height: '22px', width: '40px' }}
              >
                <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${hasExpiry ? 'translate-x-[18px]' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">Установить срок действия</span>
            </label>
          </div>

          <div>
            <label className="flex cursor-pointer items-center gap-2.5">
              <div
                onClick={() => {
                  setPaymentOrderOptional((prev) => !prev);
                }}
                className={`flex h-5.5 w-10 rounded-full px-0.5 transition-colors ${paymentOrderRequired ? 'bg-blue-600' : 'bg-gray-300'}`}
                style={{ height: '22px', width: '40px' }}
              >
                <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${paymentOrderRequired ? 'translate-x-[18px]' : 'translate-x-0'}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Платежка обязательна</span>
                <p className="mt-0.5 text-xs text-gray-500">
                  Если включено, форма потребует платежное поручение перед заполнением сотрудников.
                </p>
              </div>
            </label>
          </div>

          {hasExpiry && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Действует до</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                min={minDate}
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
