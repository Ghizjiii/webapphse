const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export interface PaymentOrderExtractedFields {
  payment_order_number?: string;
  payment_order_date?: string;
  payment_order_amount?: string;
  payment_order_bin_iin?: string;
}

export interface UploadedPaymentOrder {
  secure_url: string;
  storage_bucket?: string;
  storage_path?: string;
}

export async function uploadPhoto(file: File, folder = 'hse-participants'): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Не удалось загрузить файл');
  }

  return String(data.secure_url || '');
}

export async function uploadPaymentOrder(file: File): Promise<UploadedPaymentOrder> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'hse-payment-orders');
  formData.append('mode', 'payment_order');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Не удалось загрузить платежное поручение');
  }

  return {
    secure_url: String(data.secure_url || ''),
    storage_bucket: String(data.storage_bucket || ''),
    storage_path: String(data.storage_path || ''),
  };
}
