import type { RefObject } from 'react';
import { Building2, Loader2, Search } from 'lucide-react';
import type { RefCompanyDirectory } from '../../types';
import type { PaymentOrderStage, ValidationErrors } from './model';

interface CompanySectionProps {
  paymentOrderOptional: boolean;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyBin: string;
  companyCity: string;
  directoryMatch: RefCompanyDirectory | null;
  lookupLoading: boolean;
  lookupTouched: boolean;
  noContractConfirmed: boolean;
  paymentOrderUrl: string;
  paymentOrderName: string;
  paymentOrderNumber: string;
  paymentOrderDate: string;
  paymentOrderAmount: string;
  paymentAutofillHint: string;
  uploadingPaymentOrder: boolean;
  paymentOrderStage: PaymentOrderStage;
  errors: ValidationErrors;
  lockCompanyFields: boolean;
  canConfirmNoContract: boolean;
  hasActiveContract: boolean;
  paymentStagePercent: number;
  paymentStageLabel: string;
  paymentOrderInputRef: RefObject<HTMLInputElement | null>;
  onCompanyNameChange: (value: string) => void;
  onCompanyPhoneChange: (value: string) => void;
  onCompanyEmailChange: (value: string) => void;
  onCompanyBinChange: (value: string) => void;
  onCompanyCityChange: (value: string) => void;
  onLookupCompany: () => void;
  onEnableCompanyCreateMode: () => void;
  onNoContractConfirmedChange: (value: boolean) => void;
  onPaymentOrderPick: (file: File) => void;
  onPaymentOrderNumberChange: (value: string) => void;
  onPaymentOrderDateChange: (value: string) => void;
  onPaymentOrderAmountChange: (value: string) => void;
}

export function CompanySection(props: CompanySectionProps) {
  const {
    companyName,
    paymentOrderOptional,
    companyPhone,
    companyEmail,
    companyBin,
    companyCity,
    directoryMatch,
    lookupLoading,
    lookupTouched,
    noContractConfirmed,
    paymentOrderUrl,
    paymentOrderName,
    paymentOrderNumber,
    paymentOrderDate,
    paymentOrderAmount,
    paymentAutofillHint,
    uploadingPaymentOrder,
    paymentOrderStage,
    errors,
    lockCompanyFields,
    canConfirmNoContract,
    hasActiveContract,
    paymentStagePercent,
    paymentStageLabel,
    paymentOrderInputRef,
    onCompanyNameChange,
    onCompanyPhoneChange,
    onCompanyEmailChange,
    onCompanyBinChange,
    onCompanyCityChange,
    onLookupCompany,
    onEnableCompanyCreateMode,
    onNoContractConfirmedChange,
    onPaymentOrderPick,
    onPaymentOrderNumberChange,
    onPaymentOrderDateChange,
    onPaymentOrderAmountChange,
  } = props;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2.5">
        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
          <Building2 size={16} className="text-blue-600" />
        </div>
        Информация о компании
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            БИН/ИИН <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              value={companyBin}
              onChange={event => onCompanyBinChange(event.target.value)}
              onBlur={onLookupCompany}
              placeholder="123456789012"
              className={`flex-1 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.company_bin ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
            />
            <button
              type="button"
              onClick={onLookupCompany}
              className="px-3 py-2.5 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm inline-flex items-center gap-1.5"
              disabled={lookupLoading || !companyBin.trim()}
            >
              {lookupLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {lookupLoading ? 'Поиск...' : 'Поиск'}
            </button>
          </div>
          {lookupLoading && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700 border border-blue-100">
              <Loader2 size={12} className="animate-spin" />
              Идет поиск компании в справочнике...
            </div>
          )}
          {lookupTouched && !directoryMatch && (
            <button
              type="button"
              onClick={onEnableCompanyCreateMode}
              className="mt-2 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-medium"
            >
              Создать компанию
            </button>
          )}
          {errors.company_bin && <p className="text-xs text-red-500 mt-1">{errors.company_bin}</p>}
          {lookupTouched && directoryMatch && (
            <p className="text-xs text-green-600 mt-1">Компания найдена в справочнике Bitrix24.</p>
          )}
          {lookupTouched && !directoryMatch && (
            <p className="text-xs text-amber-600 mt-1">Компания не найдена в справочнике. Можно заполнить форму вручную с отметкой "Нет договора".</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Название компании <span className="text-red-500">*</span>
          </label>
          <input
            value={companyName}
            onChange={event => onCompanyNameChange(event.target.value)}
            placeholder="ТОО Компания"
            disabled={lockCompanyFields}
            className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.company_name ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
          />
          {errors.company_name && <p className="text-xs text-red-500 mt-1">{errors.company_name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Номер телефона <span className="text-red-500">*</span>
          </label>
          <input
            value={companyPhone}
            onChange={event => onCompanyPhoneChange(event.target.value)}
            placeholder="+7 (777) 000-00-00"
            disabled={lockCompanyFields}
            className={`w-full px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${errors.company_phone ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
          />
          {errors.company_phone && <p className="text-xs text-red-500 mt-1">{errors.company_phone}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Электронная почта</label>
          <input
            type="email"
            value={companyEmail}
            onChange={event => onCompanyEmailChange(event.target.value)}
            placeholder="info@company.kz"
            disabled={lockCompanyFields}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Город</label>
          <input
            value={companyCity}
            onChange={event => onCompanyCityChange(event.target.value)}
            placeholder="Алматы"
            disabled={lockCompanyFields}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>

        <div className="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="text-sm font-medium text-gray-700 mb-2">Договор</div>
          {directoryMatch ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-gray-600">
              <div>Номер: <b>{directoryMatch.contract_number || '—'}</b></div>
              <div>Дата договора: <b>{directoryMatch.contract_date || '—'}</b></div>
              <div>Срок: <b>{directoryMatch.contract_start || '—'} — {directoryMatch.contract_end || '—'}</b></div>
              <div className="md:col-span-3">Статус: <b>{directoryMatch.contract_status || (hasActiveContract ? 'Действует' : 'Не действует')}</b></div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">Договор по найденной компании отсутствует.</div>
          )}
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={noContractConfirmed}
              onChange={event => onNoContractConfirmedChange(event.target.checked)}
              disabled={!canConfirmNoContract}
            />
            Нет договора (заполнить вручную)
          </label>
          {hasActiveContract && (
            <p className="text-xs text-green-600 mt-1">Активный договор найден. Подтверждение не требуется.</p>
          )}
          {!hasActiveContract && !canConfirmNoContract && (
            <p className="text-xs text-gray-500 mt-1">Подтверждение "Нет договора" станет доступно после поиска БИН/ИИН или выбора "Создать компанию".</p>
          )}
          {errors.contract && <p className="text-xs text-red-500 mt-1">{errors.contract}</p>}
        </div>

        {!paymentOrderOptional && (
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Добавить платежное поручение</label>
            <div className="flex items-center gap-2">
              <input
                ref={paymentOrderInputRef as RefObject<HTMLInputElement>}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) onPaymentOrderPick(file);
                }}
              />
              <button
                type="button"
                onClick={() => paymentOrderInputRef.current?.click()}
                className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm"
                disabled={uploadingPaymentOrder}
              >
                {uploadingPaymentOrder ? 'Загрузка...' : 'Выбрать файл'}
              </button>
              <span className="text-xs text-gray-500 truncate">{paymentOrderName || 'Файл не выбран'}</span>
            </div>
            {paymentOrderUrl && (
              <a href={paymentOrderUrl} target="_blank" rel="noreferrer" className="inline-block mt-1 text-xs text-blue-600 hover:underline">
                Открыть загруженный файл
              </a>
            )}
            {paymentOrderStage !== 'idle' && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
                <div className="flex items-center justify-between text-xs text-gray-700">
                  <span>{paymentStageLabel}</span>
                  <span>{paymentStagePercent}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      paymentOrderStage === 'error' ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${paymentStagePercent}%` }}
                  />
                </div>
              </div>
            )}
            {paymentAutofillHint && <p className="text-xs text-gray-500 mt-1">{paymentAutofillHint}</p>}
            {errors.payment_order && <p className="text-xs text-red-500 mt-1">{errors.payment_order}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Номер платежного поручения</label>
                <input
                  value={paymentOrderNumber}
                  onChange={event => onPaymentOrderNumberChange(event.target.value)}
                  placeholder="Например, 0256"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                    errors.payment_order_number ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.payment_order_number && <p className="text-xs text-red-500 mt-1">{errors.payment_order_number}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Дата оплаты</label>
                <input
                  type="date"
                  value={paymentOrderDate}
                  onChange={event => onPaymentOrderDateChange(event.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                    errors.payment_order_date ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.payment_order_date && <p className="text-xs text-red-500 mt-1">{errors.payment_order_date}</p>}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Сумма оплаты</label>
                <input
                  value={paymentOrderAmount}
                  onChange={event => onPaymentOrderAmountChange(event.target.value)}
                  placeholder="Например, 14232.00"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                    errors.payment_order_amount ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {errors.payment_order_amount && <p className="text-xs text-red-500 mt-1">{errors.payment_order_amount}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
