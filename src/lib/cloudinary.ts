const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function externalizeReturnedSupabaseUrl(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const publicOrigin = String(SUPABASE_URL || '').trim().replace(/\/+$/, '');
    if (publicOrigin && ['kong', 'localhost', '127.0.0.1'].includes(parsed.hostname)) {
      return `${publicOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return raw;
  } catch {
    return raw;
  }
}

export interface PaymentOrderExtractedFields {
  payment_order_number?: string;
  payment_order_date?: string;
  payment_order_amount?: string;
  payment_order_bin_iin?: string;
  payment_order_payer_name?: string;
  payment_order_beneficiary_valid?: boolean;
  payment_order_beneficiary_bin?: string;
  payment_order_beneficiary_account?: string;
  payment_order_beneficiary_name?: string;
  payment_order_beneficiary_bin_matched?: boolean;
  payment_order_beneficiary_account_matched?: boolean;
  payment_order_beneficiary_reason?: string;
  payment_order_detected_bins?: string[];
  payment_order_detected_accounts?: string[];
  payment_order_beneficiary_checks?: PaymentOrderBeneficiaryCheck[];
  payment_order_accepted_beneficiaries?: PaymentOrderAcceptedBeneficiary[];
  payment_verification_source?: 'ocr' | 'user_corrected';
}

export interface PaymentOrderAcceptedBeneficiary {
  name: string;
  bin: string;
  accounts: string[];
}

export interface PaymentOrderBeneficiaryCheck extends PaymentOrderAcceptedBeneficiary {
  bin_matched?: boolean;
  account_matched?: boolean;
}

export interface UploadedPaymentOrder {
  secure_url: string;
  storage_bucket?: string;
  storage_path?: string;
}

export interface UploadedCommentAttachment {
  secure_url: string;
  storage_bucket?: string;
  storage_path?: string;
  name?: string;
  size?: number;
  content_type?: string;
  uploaded_at?: string;
}

const PARTICIPANT_PHOTO_WIDTH = 600;
const PARTICIPANT_PHOTO_HEIGHT = 800;
const PARTICIPANT_PHOTO_TYPE = 'image/jpeg';
const PARTICIPANT_PHOTO_QUALITY = 0.9;

function isImageFile(file: File): boolean {
  return String(file.type || '').toLowerCase().startsWith('image/');
}

function participantPhotoFileName(file: File): string {
  const base = String(file.name || 'participant-photo')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^_+|_+$/g, '') || 'participant-photo';
  return `${base}.jpg`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Не удалось подготовить фото'));
    }, type, quality);
  });
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = imageUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export async function prepareParticipantPhotoFile(file: File): Promise<File> {
  if (!isImageFile(file) || typeof document === 'undefined') return file;

  const image = await loadImageElement(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return file;

  const targetRatio = PARTICIPANT_PHOTO_WIDTH / PARTICIPANT_PHOTO_HEIGHT;
  const sourceRatio = sourceWidth / sourceHeight;
  const cropWidth = sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth;
  const cropHeight = sourceRatio > targetRatio ? sourceHeight : sourceWidth / targetRatio;
  const cropX = Math.max(0, (sourceWidth - cropWidth) / 2);
  const cropY = Math.max(0, (sourceHeight - cropHeight) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = PARTICIPANT_PHOTO_WIDTH;
  canvas.height = PARTICIPANT_PHOTO_HEIGHT;

  const context = canvas.getContext('2d');
  if (!context) return file;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    PARTICIPANT_PHOTO_WIDTH,
    PARTICIPANT_PHOTO_HEIGHT,
  );

  const blob = await canvasToBlob(canvas, PARTICIPANT_PHOTO_TYPE, PARTICIPANT_PHOTO_QUALITY);
  return new File([blob], participantPhotoFileName(file), {
    type: PARTICIPANT_PHOTO_TYPE,
    lastModified: Date.now(),
  });
}

export async function uploadPhoto(file: File, folder = 'hse-participants'): Promise<string> {
  const uploadFile = await prepareParticipantPhotoFile(file);
  const formData = new FormData();
  formData.append('file', uploadFile);
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

  return externalizeReturnedSupabaseUrl(data.secure_url);
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
    secure_url: externalizeReturnedSupabaseUrl(data.secure_url),
    storage_bucket: String(data.storage_bucket || ''),
    storage_path: String(data.storage_path || ''),
  };
}

export async function uploadCommentAttachment(file: File): Promise<UploadedCommentAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', 'hse-comment-attachments');
  formData.append('mode', 'comment_attachment');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-photo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Не удалось загрузить вложение');
  }

  return {
    secure_url: externalizeReturnedSupabaseUrl(data.secure_url),
    storage_bucket: String(data.storage_bucket || ''),
    storage_path: String(data.storage_path || ''),
    name: String(data.name || file.name || ''),
    size: Number(data.size || file.size || 0),
    content_type: String(data.content_type || file.type || ''),
    uploaded_at: String(data.uploaded_at || ''),
  };
}
