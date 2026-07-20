import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const PDF_RENDER_MAX_WIDTH = 2600;
const PDF_RENDER_MAX_HEIGHT = 3600;
const PDF_RENDER_MAX_SCALE = 4.5;
const OUTPUT_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.92;

function pdfImageFileName(file: File): string {
  const base = String(file.name || 'participant-id')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^_+|_+$/g, '') || 'participant-id';
  return `${base}.jpg`;
}

function canvasToJpegFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Не удалось конвертировать PDF в JPG'));
        return;
      }

      resolve(new File([blob], fileName, {
        type: OUTPUT_TYPE,
        lastModified: Date.now(),
      }));
    }, OUTPUT_TYPE, OUTPUT_QUALITY);
  });
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export async function renderPdfFirstPageToJpeg(file: File): Promise<File> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;

  try {
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const fitScale = Math.min(
      PDF_RENDER_MAX_WIDTH / baseViewport.width,
      PDF_RENDER_MAX_HEIGHT / baseViewport.height,
    );
    const scale = Math.max(1, Math.min(PDF_RENDER_MAX_SCALE, fitScale));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not supported');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    return await canvasToJpegFile(canvas, pdfImageFileName(file));
  } finally {
    await document.destroy();
  }
}
