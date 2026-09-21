import type { LocalParticipant } from '../features/public-form/model';
import { getParticipantDisplayName } from './participantName';

interface SubmissionPdfData {
  requestNumber?: number | null;
  engineerName?: string;
  requestType: 'external' | 'internal';
  regionName: string;
  objectName: string;
  isGeneralContractor: boolean;
  companyName: string;
  companyBin: string;
  companyPhone: string;
  companyEmail: string;
  companyCity: string;
  companyComments: string;
  paymentOrderNumber: string;
  paymentOrderDate: string;
  paymentOrderAmount: string;
  paymentBeneficiaryName: string;
  paymentBeneficiaryBin: string;
  paymentBeneficiaryAccount: string;
  participants: LocalParticipant[];
  submittedAt: Date;
}

const PAGE_WIDTH = 1240;
const PAGE_HEIGHT = 1754;
const PAGE_MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = String(value || '—').split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['—'];

  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function createPage(): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  context.textBaseline = 'top';
  return { canvas, context };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      if (!blob) {
        reject(new Error('Не удалось сформировать итоговый PDF'));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/jpeg', 0.92);
  });
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function buildPdfFromJpegs(images: Uint8Array[]): Blob {
  const encoder = new TextEncoder();
  const objectCount = 2 + images.length * 3;
  const objects = new Map<number, Uint8Array>();
  const pageRefs = images.map((_, index) => `${3 + index * 3} 0 R`).join(' ');

  objects.set(1, encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(2, encoder.encode(`<< /Type /Pages /Kids [${pageRefs}] /Count ${images.length} >>`));

  images.forEach((image, index) => {
    const pageObject = 3 + index * 3;
    const imageObject = pageObject + 1;
    const contentObject = pageObject + 2;
    const imageName = `Im${index + 1}`;
    const content = encoder.encode(`q 595.28 0 0 841.89 0 0 cm /${imageName} Do Q`);

    objects.set(pageObject, encoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /${imageName} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
    ));
    objects.set(imageObject, concatBytes([
      encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${PAGE_WIDTH} /Height ${PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),
      image,
      encoder.encode('\nendstream'),
    ]));
    objects.set(contentObject, concatBytes([
      encoder.encode(`<< /Length ${content.length} >>\nstream\n`),
      content,
      encoder.encode('\nendstream'),
    ]));
  });

  const parts: Uint8Array[] = [encoder.encode('%PDF-1.4\n')];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let currentOffset = parts[0].length;
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    const body = objects.get(objectNumber);
    if (!body) throw new Error(`Missing PDF object ${objectNumber}`);
    const objectBytes = concatBytes([
      encoder.encode(`${objectNumber} 0 obj\n`),
      body,
      encoder.encode('\nendobj\n'),
    ]);
    offsets[objectNumber] = currentOffset;
    parts.push(objectBytes);
    currentOffset += objectBytes.length;
  }

  const xrefOffset = currentOffset;
  const xref = [
    `xref\n0 ${objectCount + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  ].join('');
  parts.push(encoder.encode(xref));
  return new Blob([concatBytes(parts)], { type: 'application/pdf' });
}

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

export async function downloadQuestionnaireSubmissionPdf(data: SubmissionPdfData): Promise<void> {
  const pages: HTMLCanvasElement[] = [];
  let page = createPage();
  let y = PAGE_MARGIN;

  const addPage = () => {
    pages.push(page.canvas);
    page = createPage();
    y = PAGE_MARGIN;
  };
  const ensureSpace = (height: number) => {
    if (y + height > PAGE_HEIGHT - PAGE_MARGIN) addPage();
  };
  const drawText = (value: string, x: number, maxWidth: number, options: { size?: number; color?: string; bold?: boolean; lineHeight?: number } = {}) => {
    const size = options.size || 28;
    const lineHeight = options.lineHeight || Math.round(size * 1.35);
    page.context.font = `${options.bold ? '700' : '400'} ${size}px Arial, sans-serif`;
    page.context.fillStyle = options.color || '#111827';
    const lines = wrapText(page.context, value, maxWidth);
    for (const line of lines) {
      page.context.fillText(line, x, y);
      y += lineHeight;
    }
    return lines.length * lineHeight;
  };
  const drawField = (label: string, value: string) => {
    ensureSpace(78);
    page.context.font = '400 20px Arial, sans-serif';
    page.context.fillStyle = '#6b7280';
    page.context.fillText(label, PAGE_MARGIN, y);
    y += 27;
    drawText(value || '—', PAGE_MARGIN, CONTENT_WIDTH, { size: 25, bold: true, lineHeight: 32 });
    y += 15;
  };

  drawText(`Анкета${data.requestNumber ? ` №${data.requestNumber}` : ''}`, PAGE_MARGIN, CONTENT_WIDTH, { size: 46, bold: true, lineHeight: 58 });
  y += 8;
  drawText(`Дата и время заполнения: ${data.submittedAt.toLocaleString('ru-RU')}`, PAGE_MARGIN, CONTENT_WIDTH, { size: 22, color: '#4b5563' });
  y += 28;

  page.context.fillStyle = '#eff6ff';
  page.context.fillRect(PAGE_MARGIN, y, CONTENT_WIDTH, 58);
  y += 14;
  drawText('Информация о компании', PAGE_MARGIN + 18, CONTENT_WIDTH - 36, { size: 26, color: '#1d4ed8', bold: true, lineHeight: 34 });
  y += 22;
  drawField('Название компании', data.companyName);
  drawField('БИН/ИИН', data.companyBin);
  drawField('Телефон', data.companyPhone);
  drawField('Электронная почта', data.companyEmail);
  drawField('Город', data.companyCity);
  drawField('Инженер (ФИО)', data.engineerName || '—');
  drawField('Тип заявки', data.requestType === 'internal' ? 'Внутренняя' : 'Внешняя');
  drawField('Регион / отдел', data.regionName);
  drawField('Объект', data.objectName);
  drawField('Генподряд', data.isGeneralContractor ? 'Да' : 'Нет');
  drawField('Комментарии', data.companyComments);

  if (data.paymentOrderNumber || data.paymentOrderDate || data.paymentOrderAmount) {
    ensureSpace(240);
    page.context.fillStyle = '#f8fafc';
    page.context.fillRect(PAGE_MARGIN, y, CONTENT_WIDTH, 58);
    y += 14;
    drawText('Оплата', PAGE_MARGIN + 18, CONTENT_WIDTH - 36, { size: 26, color: '#334155', bold: true, lineHeight: 34 });
    y += 22;
    drawField('Номер платежного поручения / квитанции', data.paymentOrderNumber);
    drawField('Дата оплаты', formatDate(data.paymentOrderDate));
    drawField('Сумма оплаты', data.paymentOrderAmount ? `${data.paymentOrderAmount} ₸` : '—');
    drawField('Компания-получатель', data.paymentBeneficiaryName);
    drawField('БИН получателя', data.paymentBeneficiaryBin);
    drawField('Счет получателя', data.paymentBeneficiaryAccount);
  }

  ensureSpace(130);
  y += 10;
  drawText(`Список участников (${data.participants.length})`, PAGE_MARGIN, CONTENT_WIDTH, { size: 32, bold: true, lineHeight: 42 });
  y += 14;

  data.participants.forEach((participant, index) => {
    const name = getParticipantDisplayName(participant) || '—';
    const courses = participant.courses.join('; ') || '—';
    page.context.font = '400 22px Arial, sans-serif';
    const courseLines = wrapText(page.context, courses, CONTENT_WIDTH - 50);
    const rowHeight = 154 + Math.max(0, courseLines.length - 1) * 29;
    ensureSpace(rowHeight + 18);

    page.context.strokeStyle = '#d1d5db';
    page.context.lineWidth = 2;
    page.context.strokeRect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight);
    const rowTop = y;
    y += 16;
    drawText(`${index + 1}. ${name}`, PAGE_MARGIN + 18, CONTENT_WIDTH - 36, { size: 25, bold: true, lineHeight: 34 });
    drawText(`Должность: ${participant.position || '—'}`, PAGE_MARGIN + 18, CONTENT_WIDTH - 36, { size: 21, color: '#374151', lineHeight: 29 });
    drawText(`Категория: ${participant.category || '—'}`, PAGE_MARGIN + 18, CONTENT_WIDTH - 36, { size: 21, color: '#374151', lineHeight: 29 });
    drawText(`Email: ${participant.email || '—'}`, PAGE_MARGIN + 18, CONTENT_WIDTH - 36, { size: 21, color: '#374151', lineHeight: 29 });
    drawText(`Курсы: ${courses}`, PAGE_MARGIN + 18, CONTENT_WIDTH - 36, { size: 21, color: '#374151', lineHeight: 29 });
    y = rowTop + rowHeight + 18;
  });

  pages.push(page.canvas);
  const jpegPages = await Promise.all(pages.map(canvasToJpeg));
  const pdfBlob = buildPdfFromJpegs(jpegPages);
  const url = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Анкета${data.requestNumber ? `-${data.requestNumber}` : ''}-${data.submittedAt.toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
