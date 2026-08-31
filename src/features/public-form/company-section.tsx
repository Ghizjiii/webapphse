import type { RefObject } from 'react';
import { Building2, CheckCircle2, Loader2, Paperclip, Search, X } from 'lucide-react';
import type { CommentAttachment, RefCompanyDirectory } from '../../types';
import type { PaymentOrderRecognitionDetails, PaymentOrderStage, ValidationErrors } from './model';

interface CompanySectionProps {
  paymentOrderOptional: boolean;
  companyName: string;
  companyPhone: string;
  companyEmail: string;
  companyBin: string;
  companyCity: string;
  companyComments: string;
  commentAttachments: CommentAttachment[];
  directoryMatch: RefCompanyDirectory | null;
  lookupLoading: boolean;
  lookupTouched: boolean;
  noContractConfirmed: boolean;
  paymentOrderUrl: string;
  paymentOrderName: string;
  paymentOrderNumber: string;
  paymentOrderDate: string;
  paymentOrderAmount: string;
  paymentBeneficiaryBin: string;
  paymentBeneficiaryAccount: string;
  paymentValidationLoading: boolean;
  paymentManualCorrection: boolean;
  paymentCorrectedFields: string[];
  paymentAutofillHint: string;
  paymentBeneficiaryHint: string;
  paymentRecognitionDetails: PaymentOrderRecognitionDetails | null;
  uploadingPaymentOrder: boolean;
  paymentOrderStage: PaymentOrderStage;
  uploadingCommentAttachments: boolean;
  errors: ValidationErrors;
  lockCompanyFields: boolean;
  canConfirmNoContract: boolean;
  hasActiveContract: boolean;
  paymentStagePercent: number;
  paymentStageLabel: string;
  paymentOrderInputRef: RefObject<HTMLInputElement | null>;
  commentAttachmentInputRef: RefObject<HTMLInputElement | null>;
  onCompanyNameChange: (value: string) => void;
  onCompanyPhoneChange: (value: string) => void;
  onCompanyEmailChange: (value: string) => void;
  onCompanyBinChange: (value: string) => void;
  onCompanyCityChange: (value: string) => void;
  onCompanyCommentsChange: (value: string) => void;
  onCommentAttachmentPick: (files: FileList | File[]) => void;
  onCommentAttachmentRemove: (attachmentId: string) => void;
  onLookupCompany: () => void;
  onEnableCompanyCreateMode: () => void;
  onNoContractConfirmedChange: (value: boolean) => void;
  onPaymentOrderPick: (file: File) => void;
  onPaymentOrderNumberChange: (value: string) => void;
  onPaymentOrderDateChange: (value: string) => void;
  onPaymentOrderAmountChange: (value: string) => void;
  onPaymentBeneficiaryBinChange: (value: string) => void;
  onPaymentBeneficiaryAccountChange: (value: string) => void;
  onValidatePaymentBeneficiary: () => void;
}

function formatAttachmentSize(size: number | undefined): string {
  if (!size || !Number.isFinite(size)) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

function formatRecognitionValue(value: string | undefined): string {
  const normalized = String(value || '').trim();
  return normalized || '—';
}

function formatRecognitionDate(value: string | undefined): string {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return formatRecognitionValue(normalized);
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function renderMatchStatus(value: boolean | undefined) {
  if (value === true) {
    return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Совпало</span>;
  }
  if (value === false) {
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Не совпало</span>;
  }
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Не определено</span>;
}

function PaymentRecognitionDetailsBox({ details }: { details: PaymentOrderRecognitionDetails }) {
  const boxClass = details.beneficiaryValid === false
    ? 'border-red-200 bg-red-50'
    : details.beneficiaryValid === true
      ? 'border-emerald-200 bg-emerald-50'
      : 'border-amber-200 bg-amber-50';
  const title = details.beneficiaryValid === false
    ? 'Платеж не принят'
    : details.beneficiaryValid === true
      ? 'Платеж принят'
      : 'Реквизиты не определены автоматически';

  return (
    <div className={`mt-3 rounded-xl border p-3 text-xs ${boxClass}`}>
      <div className="font-semibold text-gray-900">{title}</div>
      {details.manualCorrection && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-white/80 px-2 py-1.5 text-amber-700">
          Данные платежного поручения исправлены пользователем
          {details.correctedFields?.length ? `: ${details.correctedFields.join(', ')}` : ''}
        </div>
      )}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <div className="text-gray-500">Номер</div>
          <div className="font-medium text-gray-900">{formatRecognitionValue(details.number)}</div>
        </div>
        <div>
          <div className="text-gray-500">Дата</div>
          <div className="font-medium text-gray-900">{formatRecognitionDate(details.date)}</div>
        </div>
        <div>
          <div className="text-gray-500">Сумма</div>
          <div className="font-medium text-gray-900">{formatRecognitionValue(details.amount)}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/70 bg-white/70 p-2">
          <div className="text-gray-500">Получатель</div>
          <div className="mt-1 font-medium text-gray-900">{formatRecognitionValue(details.beneficiaryName)}</div>
          <div className="mt-1 text-gray-600">БИН: {formatRecognitionValue(details.beneficiaryBin)}</div>
          <div className="text-gray-600">Счет: {formatRecognitionValue(details.beneficiaryAccount)}</div>
        </div>
        <div className="rounded-lg border border-white/70 bg-white/70 p-2">
          <div className="text-gray-500">Проверка условий</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span>БИН получателя</span>
            {renderMatchStatus(details.beneficiaryBinMatched)}
          </div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span>Счет получателя</span>
            {renderMatchStatus(details.beneficiaryAccountMatched)}
          </div>
          <div className="mt-1 text-gray-600">Нужно совпадение БИН и счета одной разрешенной компании.</div>
        </div>
      </div>

      {(details.detectedBins?.length || details.detectedAccounts?.length) && (
        <div className="mt-3 rounded-lg border border-white/70 bg-white/70 p-2 text-gray-600">
          <div>Найденные БИН: {details.detectedBins?.join(', ') || '—'}</div>
          <div>Найденные счета: {details.detectedAccounts?.join(', ') || '—'}</div>
        </div>
      )}

      {details.beneficiaryReason && (
        <div className="mt-2 font-medium text-red-700">Причина: {details.beneficiaryReason}</div>
      )}

      {details.acceptedBeneficiaries?.length ? (
        <div className="mt-3 rounded-lg border border-white/70 bg-white/70 p-2">
          <div className="font-medium text-gray-900">Разрешенные получатели</div>
          <div className="mt-1 space-y-1 text-gray-600">
            {details.acceptedBeneficiaries.map(item => (
              <div key={`${item.bin}-${item.name}`}>
                {item.name}: БИН {item.bin}, счет {item.accounts.join(', ')}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CompanySection(props: CompanySectionProps) {
  const {
    companyName,
    paymentOrderOptional,
    companyPhone,
    companyEmail,
    companyBin,
    companyCity,
    companyComments,
    commentAttachments,
    directoryMatch,
    lookupLoading,
    lookupTouched,
    noContractConfirmed,
    paymentOrderUrl,
    paymentOrderName,
    paymentOrderNumber,
    paymentOrderDate,
    paymentOrderAmount,
    paymentBeneficiaryBin,
    paymentBeneficiaryAccount,
    paymentValidationLoading,
    paymentManualCorrection,
    paymentCorrectedFields,
    paymentAutofillHint,
    paymentBeneficiaryHint,
    paymentRecognitionDetails,
    uploadingPaymentOrder,
    paymentOrderStage,
    uploadingCommentAttachments,
    errors,
    lockCompanyFields,
    canConfirmNoContract,
    hasActiveContract,
    paymentStagePercent,
    paymentStageLabel,
    paymentOrderInputRef,
    commentAttachmentInputRef,
    onCompanyNameChange,
    onCompanyPhoneChange,
    onCompanyEmailChange,
    onCompanyBinChange,
    onCompanyCityChange,
    onCompanyCommentsChange,
    onCommentAttachmentPick,
    onCommentAttachmentRemove,
    onLookupCompany,
    onEnableCompanyCreateMode,
    onNoContractConfirmedChange,
    onPaymentOrderPick,
    onPaymentOrderNumberChange,
    onPaymentOrderDateChange,
    onPaymentOrderAmountChange,
    onPaymentBeneficiaryBinChange,
    onPaymentBeneficiaryAccountChange,
    onValidatePaymentBeneficiary,
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
              onMouseDown={event => event.preventDefault()}
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
                accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif"
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
            {paymentBeneficiaryHint && <p className="text-xs font-medium text-emerald-600 mt-1">{paymentBeneficiaryHint}</p>}
            {errors.payment_order && <p className="text-xs text-red-500 mt-1">{errors.payment_order}</p>}
            {paymentRecognitionDetails && <PaymentRecognitionDetailsBox details={paymentRecognitionDetails} />}
            {paymentOrderUrl && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Реквизиты получателя платежа</div>
                    <div className="text-xs text-gray-600">Можно исправить ошибку OCR, затем повторно проверить по разрешенному списку.</div>
                  </div>
                  {paymentManualCorrection && (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      <CheckCircle2 size={13} />
                      Исправлено: {paymentCorrectedFields.join(', ') || 'реквизиты'}
                    </div>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] md:items-start">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">БИН получателя</label>
                    <input
                      value={paymentBeneficiaryBin}
                      onChange={event => onPaymentBeneficiaryBinChange(event.target.value)}
                      placeholder="211040027532"
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                        errors.payment_order_beneficiary_bin ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
                      }`}
                    />
                    {errors.payment_order_beneficiary_bin && <p className="text-xs text-red-500 mt-1">{errors.payment_order_beneficiary_bin}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Счет получателя IBAN</label>
                    <input
                      value={paymentBeneficiaryAccount}
                      onChange={event => onPaymentBeneficiaryAccountChange(event.target.value)}
                      placeholder="KZ30601A871001584291"
                      className={`w-full px-3 py-2 border rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                        errors.payment_order_beneficiary_account ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
                      }`}
                    />
                    {errors.payment_order_beneficiary_account && <p className="text-xs text-red-500 mt-1">{errors.payment_order_beneficiary_account}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={onValidatePaymentBeneficiary}
                    disabled={paymentValidationLoading || uploadingPaymentOrder}
                    className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 md:mt-5"
                  >
                    {paymentValidationLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Проверить
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Номер платежного поручения</label>
                <input
                  type="text"
                  inputMode="text"
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

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Комментарии</label>
          <textarea
            value={companyComments}
            onChange={event => onCompanyCommentsChange(event.target.value)}
            rows={3}
            placeholder="Дополнительная информация для координатора"
            className="w-full resize-y rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          <div className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
            <input
              ref={commentAttachmentInputRef as RefObject<HTMLInputElement>}
              type="file"
              multiple
              className="hidden"
              onChange={event => {
                const files = event.target.files;
                if (files?.length) onCommentAttachmentPick(files);
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-gray-500">Можно прикрепить несколько файлов, до 5 МБ каждый.</div>
              <button
                type="button"
                onClick={() => commentAttachmentInputRef.current?.click()}
                disabled={uploadingCommentAttachments}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadingCommentAttachments ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                {uploadingCommentAttachments ? 'Загрузка...' : 'Прикрепить файлы'}
              </button>
            </div>
            {commentAttachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {commentAttachments.map(attachment => (
                  <div key={attachment.id || attachment.storage_path || attachment.name} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 flex-1 truncate text-xs font-medium text-blue-700 hover:underline"
                      title={attachment.name}
                    >
                      {attachment.name}
                    </a>
                    <span className="shrink-0 text-[11px] text-gray-400">{formatAttachmentSize(attachment.size)}</span>
                    <button
                      type="button"
                      onClick={() => onCommentAttachmentRemove(String(attachment.id || ''))}
                      className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Удалить вложение"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {errors.comment_attachments && <p className="mt-2 text-xs text-red-500">{errors.comment_attachments}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
