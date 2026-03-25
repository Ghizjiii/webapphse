import { callBitrix } from './client';
import { attachPaymentFileToDeal } from './files';

export async function createDeal(dealData: {
  title: string;
  companyId: string;
  city?: string;
  paymentOrderUrl?: string;
  paymentOrderName?: string;
  paymentIsPaid?: boolean;
}): Promise<string> {
  const fields: Record<string, unknown> = {
    TITLE: dealData.title,
    COMPANY_ID: dealData.companyId,
    STAGE_ID: 'NEW',
  };
  if (dealData.city) {
    fields['UF_CRM_1772560175'] = dealData.city;
    fields['UF_CRM_CITY'] = dealData.city;
  }
  const paymentFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FIELD || '').trim();
  if (paymentFieldCode && dealData.paymentOrderUrl) {
    fields[paymentFieldCode] = dealData.paymentOrderUrl;
  }
  const paymentStatusFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_STATUS_FIELD || '').trim();
  if (paymentStatusFieldCode && typeof dealData.paymentIsPaid === 'boolean') {
    fields[paymentStatusFieldCode] = dealData.paymentIsPaid ? 'Y' : 'N';
  }

  const result = await callBitrix('crm.deal.add', { fields });
  const dealId = String(result);

  const paymentFileFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FILE_FIELD || '').trim();
  if (paymentFileFieldCode && dealData.paymentOrderUrl) {
    await attachPaymentFileToDeal({
      bitrixDealId: dealId,
      paymentFieldCode: paymentFileFieldCode,
      paymentOrderUrl: dealData.paymentOrderUrl,
      paymentOrderName: dealData.paymentOrderName || '',
    });
  }

  return dealId;
}

export async function updateDeal(bitrixDealId: string, dealData: {
  title: string;
  companyId: string;
  city?: string;
  paymentOrderUrl?: string;
  paymentOrderName?: string;
  paymentIsPaid?: boolean;
}): Promise<void> {
  const fields: Record<string, unknown> = {
    TITLE: dealData.title,
    COMPANY_ID: dealData.companyId,
  };
  if (dealData.city) {
    fields['UF_CRM_1772560175'] = dealData.city;
    fields['UF_CRM_CITY'] = dealData.city;
  }
  const paymentFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FIELD || '').trim();
  if (paymentFieldCode && dealData.paymentOrderUrl) {
    fields[paymentFieldCode] = dealData.paymentOrderUrl;
  }
  const paymentStatusFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_STATUS_FIELD || '').trim();
  if (paymentStatusFieldCode && typeof dealData.paymentIsPaid === 'boolean') {
    fields[paymentStatusFieldCode] = dealData.paymentIsPaid ? 'Y' : 'N';
  }
  await callBitrix('crm.deal.update', { id: bitrixDealId, fields });

  const paymentFileFieldCode = String(import.meta.env.VITE_BITRIX_DEAL_PAYMENT_FILE_FIELD || '').trim();
  if (paymentFileFieldCode && dealData.paymentOrderUrl) {
    await attachPaymentFileToDeal({
      bitrixDealId,
      paymentFieldCode: paymentFileFieldCode,
      paymentOrderUrl: dealData.paymentOrderUrl,
      paymentOrderName: dealData.paymentOrderName || '',
    });
  }
}
