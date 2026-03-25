import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreate: (data: { title: string; expires_at: string | null; payment_order_optional: boolean }) => void;
}

export default function CreateLinkModal({ onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [paymentOrderOptional, setPaymentOrderOptional] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    let expires_at: string | null = null;
    if (hasExpiry && expiryDate) {
      expires_at = new Date(expiryDate + 'T23:59:59').toISOString();
    }
    onCreate({ title: title.trim(), expires_at, payment_order_optional: paymentOrderOptional });
  }

  const minDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Создать анкету</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Название анкеты</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Например: ТОО КазМунайГаз - Июль 2025"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div
                onClick={() => setHasExpiry(p => !p)}
                className={`w-10 h-5.5 rounded-full transition-colors flex items-center px-0.5 ${hasExpiry ? 'bg-blue-600' : 'bg-gray-300'}`}
                style={{ height: '22px', width: '40px' }}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${hasExpiry ? 'translate-x-[18px]' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm font-medium text-gray-700">Установить срок действия</span>
            </label>
          </div>

          <div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div
                onClick={() => setPaymentOrderOptional(p => !p)}
                className={`w-10 h-5.5 rounded-full transition-colors flex items-center px-0.5 ${paymentOrderOptional ? 'bg-blue-600' : 'bg-gray-300'}`}
                style={{ height: '22px', width: '40px' }}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${paymentOrderOptional ? 'translate-x-[18px]' : 'translate-x-0'}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700">Платежка не обязательна</span>
                <p className="text-xs text-gray-500 mt-0.5">Если включено, блок платежного поручения будет скрыт в форме и в анкете.</p>
              </div>
            </label>
          </div>

          {hasExpiry && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Действует до</label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                min={minDate}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all">
              Отмена
            </button>
            <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all">
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
