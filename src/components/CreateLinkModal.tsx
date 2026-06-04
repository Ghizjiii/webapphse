import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type CreateQuestionnairePayload = {
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
  onClose: () => void;
  onCreate: (data: CreateQuestionnairePayload) => void;
}

export default function CreateLinkModal({ responsibleName, onClose, onCreate }: Props) {
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [paymentOrderOptional, setPaymentOrderOptional] = useState(false);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [regionsError, setRegionsError] = useState('');

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
        setRegions([]);
        setRegionsError('Не удалось загрузить список регионов.');
        setLoadingRegions(false);
        return;
      }

      const nextRegions = (data || [])
        .map((item) => ({
          bitrix_item_id: String(item.bitrix_item_id || '').trim(),
          name: String(item.name || '').trim(),
        }))
        .filter((item) => item.bitrix_item_id && item.name);

      setRegions(nextRegions);
      setSelectedRegionId((current) => current || nextRegions[0]?.bitrix_item_id || '');
      setLoadingRegions(false);
    }

    void loadRegions();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const selectedRegion = regions.find((region) => region.bitrix_item_id === selectedRegionId);
    if (!selectedRegion) return;

    let expires_at: string | null = null;
    if (hasExpiry && expiryDate) {
      expires_at = new Date(`${expiryDate}T23:59:59`).toISOString();
    }

    onCreate({
      region_bitrix_item_id: selectedRegion.bitrix_item_id,
      region_name: selectedRegion.name,
      expires_at,
      payment_order_optional: paymentOrderOptional,
    });
  }

  const minDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const canSubmit = !loadingRegions && regions.length > 0 && Boolean(selectedRegionId);

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
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Регион / отдел</label>
            <select
              value={selectedRegionId}
              onChange={(event) => setSelectedRegionId(event.target.value)}
              disabled={loadingRegions || regions.length === 0}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              required
            >
              {loadingRegions ? (
                <option value="">Загрузка списка...</option>
              ) : regions.length === 0 ? (
                <option value="">Нет доступных регионов</option>
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
                Список пуст. Сначала создайте и синхронизируйте справочник регионов из Bitrix24.
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">
                Значения берутся из справочника Bitrix24.
              </p>
            )}
          </div>

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
                onClick={() => setPaymentOrderOptional((prev) => !prev)}
                className={`flex h-5.5 w-10 rounded-full px-0.5 transition-colors ${paymentOrderOptional ? 'bg-blue-600' : 'bg-gray-300'}`}
                style={{ height: '22px', width: '40px' }}
              >
                <div className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${paymentOrderOptional ? 'translate-x-[18px]' : 'translate-x-0'}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Платежка не обязательна</span>
                <p className="mt-0.5 text-xs text-gray-500">
                  Если включено, блок платежного поручения будет скрыт в форме и в анкете.
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
