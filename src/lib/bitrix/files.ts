import { callBitrix } from './client';
import { sanitizeFileName, extensionFromContentType, fileNameFromUrl, safeJson } from './utils';
import { dealFieldKeyVariants, getBitrixFieldValue, resolvePhotoFieldKeys, smartUfCamelFromUpper } from './fields';

type PreparedPhoto = { fileName: string; dataUri: string; base64: string };
type PhotoPayloadKind = 'tuple' | 'wrapped' | 'wrappedWithId' | 'tupleArray';
type PhotoContract = { fieldKey: string; payloadKind: PhotoPayloadKind };

const preparedPhotoCache = new Map<string, Promise<PreparedPhoto>>();
const photoContractCache = new Map<number, PhotoContract>();

export async function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

export async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode JPEG'));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function blobToDataUri(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image as base64'));
    reader.readAsDataURL(blob);
  });
}

export function fileFieldSignature(value: unknown): string {
  if (value == null) return '';

  if (Array.isArray(value)) {
    return value.map(fileFieldSignature).filter(Boolean).join('|');
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const atoms = [
      obj.id,
      obj.ID,
      obj.fileId,
      obj.FILE_ID,
      obj.name,
      obj.NAME,
      obj.originalName,
      obj.ORIGINAL_NAME,
      obj.url,
      obj.URL,
      obj.src,
      obj.SRC,
      obj.downloadUrl,
      obj.DOWNLOAD_URL,
      obj.value,
      obj.VALUE,
    ]
      .map(v => String(v || '').trim())
      .filter(Boolean);

    if (atoms.length > 0) return atoms.join('|');

    return Object.keys(obj)
      .sort()
      .map(k => `${k}:${fileFieldSignature(obj[k])}`)
      .join('|');
  }

  return String(value || '').trim();
}

export function hasPersistedFileValue(value: unknown): boolean {
  if (value == null) return false;

  if (typeof value === 'number') return value > 0;

  if (typeof value === 'string') {
    const v = value.trim();
    if (!v) return false;
    if (/^\d+$/.test(v)) return Number(v) > 0;
    return !/^(null|undefined|0)$/i.test(v);
  }

  if (Array.isArray(value)) {
    return value.some(v => hasPersistedFileValue(v));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return [
      obj.id,
      obj.ID,
      obj.fileId,
      obj.FILE_ID,
      obj.value,
      obj.VALUE,
      obj.url,
      obj.URL,
      obj.src,
      obj.SRC,
      obj.downloadUrl,
      obj.DOWNLOAD_URL,
    ].some(v => hasPersistedFileValue(v));
  }

  return false;
}

export function buildCloudinaryJpgCandidates(photoUrl: string): string[] {
  const base = String(photoUrl || '').trim();
  if (!base) return [];

  const out = new Set<string>([base]);

  if (/res\.cloudinary\.com/i.test(base) && /\/upload\//i.test(base)) {
    out.add(base.replace('/upload/', '/upload/f_jpg,q_auto:good/'));
    out.add(base.replace('/upload/', '/upload/f_jpg/'));
    out.add(base.replace('/upload/', '/upload/f_auto,q_auto/'));
  }

  return Array.from(out);
}

export async function preparePhotoForBitrix(photoUrl: string, participantName: string): Promise<PreparedPhoto> {
  let response: Response | null = null;
  let fetchError: unknown = null;

  for (const url of buildCloudinaryJpgCandidates(photoUrl)) {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        response = r;
        break;
      } catch (e) {
        fetchError = e;
        await new Promise(resolve => setTimeout(resolve, 280 * (i + 1)));
      }
    }
    if (response) break;
  }

  if (!response) {
    const msg = fetchError instanceof Error ? fetchError.message : String(fetchError || 'Failed to fetch');
    throw new Error('Failed to fetch: ' + msg);
  }

  const sourceBlob = await response.blob();
  const img = await loadImageFromBlob(sourceBlob);

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || 1) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context is not available');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const qualities = [0.9, 0.82, 0.74, 0.66];
  const maxBytes = 1_500_000;
  let jpegBlob: Blob | null = null;

  for (const quality of qualities) {
    const candidate = await canvasToJpegBlob(canvas, quality);
    jpegBlob = candidate;
    if (candidate.size <= maxBytes) break;
  }

  if (!jpegBlob) throw new Error('Failed to convert photo to JPG');

  const dataUri = await blobToDataUri(jpegBlob);
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;

  const baseName = String(participantName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\.+$/, '');
  const safeBase = baseName.length > 0 ? baseName : `Фото ${Date.now().toString(36)}`;
  const fileName = `${safeBase}.jpg`;

  return { fileName, dataUri, base64 };
}

export function getPreparedPhotoForBitrix(photoUrl: string, participantName: string): Promise<PreparedPhoto> {
  const cacheKey = `${String(photoUrl || '').trim()}::${String(participantName || '').trim()}`;
  const cached = preparedPhotoCache.get(cacheKey);
  if (cached) return cached;

  const pending = preparePhotoForBitrix(photoUrl, participantName).catch(error => {
    preparedPhotoCache.delete(cacheKey);
    throw error;
  });
  preparedPhotoCache.set(cacheKey, pending);
  return pending;
}

export async function preparePaymentFileForBitrix(params: {
  paymentOrderUrl: string;
  paymentOrderName?: string;
}): Promise<{ fileName: string; base64: string }> {
  const response = await fetch(params.paymentOrderUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch payment file: HTTP ${response.status}`);
  }

  const blob = await response.blob();
  const dataUri = await blobToDataUri(blob);
  const base64 = dataUri.includes(',') ? dataUri.split(',')[1] || '' : dataUri;

  let fileName = sanitizeFileName(params.paymentOrderName || '');
  if (!fileName) fileName = fileNameFromUrl(params.paymentOrderUrl);
  if (!fileName) {
    const ext = extensionFromContentType(response.headers.get('content-type') || '');
    fileName = `payment_order${ext ? `.${ext}` : ''}`;
  }
  if (!/\.[a-z0-9]{2,6}$/i.test(fileName)) {
    const ext = extensionFromContentType(response.headers.get('content-type') || '');
    if (ext) fileName = `${fileName}.${ext}`;
  }

  if (!base64) {
    throw new Error('Failed to encode payment file as base64');
  }

  return { fileName, base64 };
}

export async function fetchDealFieldValue(bitrixDealId: string, paymentFieldCode: string): Promise<unknown> {
  const raw = await callBitrix('crm.deal.get', { id: bitrixDealId });
  const deal = (raw || {}) as Record<string, unknown>;

  for (const key of dealFieldKeyVariants(paymentFieldCode)) {
    if (Object.prototype.hasOwnProperty.call(deal, key)) return deal[key];
  }

  return undefined;
}

export async function readDealFileFieldSignature(bitrixDealId: string, paymentFieldCode: string): Promise<string> {
  try {
    const value = await fetchDealFieldValue(bitrixDealId, paymentFieldCode);
    return fileFieldSignature(value);
  } catch {
    return '';
  }
}

export async function verifyDealFileAttached(params: {
  bitrixDealId: string;
  paymentFieldCode: string;
  expectedFileName: string;
  beforeSignature?: string;
}): Promise<boolean> {
  const expectedFileNameNorm = String(params.expectedFileName || '').trim().toLowerCase();
  const tries = 3;

  for (let i = 0; i < tries; i++) {
    try {
      const value = await fetchDealFieldValue(params.bitrixDealId, params.paymentFieldCode);
      if (hasPersistedFileValue(value)) {
        const signature = fileFieldSignature(value);
        if (expectedFileNameNorm && signature.toLowerCase().includes(expectedFileNameNorm)) return true;

        const before = String(params.beforeSignature || '').trim();
        if (before && signature && signature !== before) return true;
        if (!before && signature) return true;
      }
    } catch {
      // best effort probe
    }

    if (i < tries - 1) {
      await new Promise(resolve => setTimeout(resolve, 220));
    }
  }

  return false;
}

export async function attachPaymentFileToDeal(params: {
  bitrixDealId: string;
  paymentFieldCode: string;
  paymentOrderUrl: string;
  paymentOrderName?: string;
}): Promise<void> {
  const prepared = await preparePaymentFileForBitrix({
    paymentOrderUrl: params.paymentOrderUrl,
    paymentOrderName: params.paymentOrderName,
  });

  const fileData: [string, string] = [prepared.fileName, prepared.base64];
  const beforeSignature = await readDealFileFieldSignature(params.bitrixDealId, params.paymentFieldCode);
  const variants: unknown[] = [
    fileData,
    [fileData],
    { fileData },
    [{ fileData }],
    { n0: fileData },
    { n0: { fileData } },
    [{ id: '', fileData }],
  ];

  const errors: string[] = [];
  for (const variant of variants) {
    try {
      await callBitrix('crm.deal.update', {
        id: params.bitrixDealId,
        fields: {
          [params.paymentFieldCode]: variant,
        },
      });

      const attached = await verifyDealFileAttached({
        bitrixDealId: params.bitrixDealId,
        paymentFieldCode: params.paymentFieldCode,
        expectedFileName: prepared.fileName,
        beforeSignature,
      });

      if (attached) return;
      errors.push(`accepted but not persisted: ${safeJson(variant)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e || 'unknown error');
      errors.push(`${safeJson(variant)} -> ${msg}`);
    }
  }

  throw new Error(`Не удалось прикрепить платежное поручение в сделку Bitrix (поле ${params.paymentFieldCode}): ${errors.join(' | ')}`);
}

export async function verifyPhotoAttached(params: {
  entityTypeId: number;
  itemId: string;
  fieldKeys: string[];
  maxTries?: number;
}): Promise<boolean> {
  const keys = Array.from(new Set(params.fieldKeys.filter(Boolean)));
  const tries = Math.max(1, params.maxTries || 3);

  for (let i = 0; i < tries; i++) {
    try {
      const raw = await callBitrix('crm.item.get', {
        entityTypeId: params.entityTypeId,
        id: params.itemId,
      });
      const item = ((raw as Record<string, unknown>)?.item || raw || {}) as Record<string, unknown>;
      const itemFields = (item.fields && typeof item.fields === 'object')
        ? item.fields as Record<string, unknown>
        : null;

      for (const key of keys) {
        if (hasPersistedFileValue(getBitrixFieldValue(item, key))) return true;
        if (itemFields && hasPersistedFileValue(getBitrixFieldValue(itemFields, key))) return true;
      }
    } catch {
      // best effort probe
    }

    if (i < tries - 1) {
      await new Promise(resolve => setTimeout(resolve, 420 * (i + 1)));
    }
  }

  return false;
}

export async function attachPhotoToSmartItem(params: {
  entityTypeId: number;
  itemId: string;
  photoUrl: string;
  participantName: string;
}): Promise<void> {
  const photoFieldKeys = await resolvePhotoFieldKeys(params.entityTypeId);

  let prepared: PreparedPhoto | null = null;
  let prepareError: unknown = null;
  try {
    prepared = await getPreparedPhotoForBitrix(params.photoUrl, params.participantName);
  } catch (e) {
    prepareError = e;
  }

  let lastError: unknown = prepareError;
  const fileData = prepared ? [prepared.fileName, prepared.base64] as [string, string] : null;
  const cachedContract = photoContractCache.get(params.entityTypeId);

  const buildPhotoPayload = (fieldKey: string, payloadKind: PhotoPayloadKind): Record<string, unknown> => {
    if (!fileData) return { [fieldKey]: null };
    switch (payloadKind) {
      case 'tuple':
        return { [fieldKey]: fileData };
      case 'wrapped':
        return { [fieldKey]: { fileData } };
      case 'wrappedWithId':
        return { [fieldKey]: { id: '', fileData } };
      case 'tupleArray':
        return { [fieldKey]: [fileData] };
    }
  };

  for (const fieldKeyRaw of photoFieldKeys) {
    const variants = new Set<string>([fieldKeyRaw]);
    const upper = String(fieldKeyRaw).toUpperCase();
    variants.add(upper);
    const camel = smartUfCamelFromUpper(upper);
    if (camel) variants.add(camel);

    for (const fieldKey of variants) {
      const payloadKinds: PhotoPayloadKind[] = ['tuple', 'wrapped', 'wrappedWithId', 'tupleArray'];
      const attempts: Array<{ fieldKey: string; payloadKind: PhotoPayloadKind; isCached: boolean }> = [];

      if (cachedContract && cachedContract.fieldKey === fieldKey) {
        attempts.push({
          fieldKey,
          payloadKind: cachedContract.payloadKind,
          isCached: true,
        });
      }

      for (const payloadKind of payloadKinds) {
        if (cachedContract && cachedContract.fieldKey === fieldKey && cachedContract.payloadKind === payloadKind) continue;
        attempts.push({
          fieldKey,
          payloadKind,
          isCached: false,
        });
      }

      for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
        const attempt = attempts[attemptIndex];
        const photoFieldPayload = buildPhotoPayload(attempt.fieldKey, attempt.payloadKind);
        try {
          await callBitrix('crm.item.update', {
            entityTypeId: params.entityTypeId,
            id: params.itemId,
            fields: photoFieldPayload,
          });

          const probeKeys = [attempt.fieldKey];
          const upperProbe = String(attempt.fieldKey).toUpperCase();
          if (upperProbe !== attempt.fieldKey) probeKeys.push(upperProbe);
          const camelProbe = smartUfCamelFromUpper(upperProbe);
          if (camelProbe) probeKeys.push(camelProbe);

          if (await verifyPhotoAttached({
            entityTypeId: params.entityTypeId,
            itemId: params.itemId,
            fieldKeys: probeKeys,
            maxTries: attempt.isCached ? 1 : (attemptIndex === 0 ? 3 : 1),
          })) {
            photoContractCache.set(params.entityTypeId, {
              fieldKey: attempt.fieldKey,
              payloadKind: attempt.payloadKind,
            });
            return;
          }

          lastError = new Error(`Bitrix accepted update but photo field stayed empty (${attempt.fieldKey})`);
        } catch (e) {
          lastError = e;
        }
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError || 'photo attachment failed');
  throw new Error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0444\u043e\u0442\u043e \u0432 \u043f\u043e\u043b\u0435 "\u0424\u043e\u0442\u043e" \u0441\u043c\u0430\u0440\u0442-\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u0430: ' + msg);
}
