import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { ImagePlus, Minus, Plus, Save, X } from 'lucide-react';
import { isPdfFile, renderPdfFirstPageToJpeg } from '../lib/pdfToImage';

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
}

interface ImageSize {
  width: number;
  height: number;
}

interface Offset {
  x: number;
  y: number;
}

const OUTPUT_WIDTH = 600;
const OUTPUT_HEIGHT = 800;
const OUTPUT_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.9;
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const ZOOM_BUTTON_STEP = 0.5;
const ZOOM_WHEEL_STEP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function outputFileName(file: File): string {
  const base = String(file.name || 'participant-photo')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^_+|_+$/g, '') || 'participant-photo';
  return `${base}.jpg`;
}

function canvasToFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Не удалось подготовить фото'));
        return;
      }

      resolve(new File([blob], fileName, {
        type: OUTPUT_TYPE,
        lastModified: Date.now(),
      }));
    }, OUTPUT_TYPE, OUTPUT_QUALITY);
  });
}

export default function PhotoCropModal({ file, onCancel, onConfirm }: Props) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [frameSize, setFrameSize] = useState<ImageSize>({ width: 300, height: 400 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let url = '';

    async function prepareImage() {
      setImageUrl('');
      setPrepareError('');
      setPreparing(isPdfFile(file));
      setImageSize(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });

      try {
        const imageFile = isPdfFile(file) ? await renderPdfFirstPageToJpeg(file) : file;
        url = URL.createObjectURL(imageFile);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        setImageUrl(url);
      } catch {
        if (!cancelled) {
          setPrepareError('Не удалось открыть PDF. Попробуйте другой файл или загрузите фото в JPG/PNG.');
        }
      } finally {
        if (!cancelled) setPreparing(false);
      }
    }

    void prepareImage();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setFrameSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    if (!imageSize || !frameSize.width || !frameSize.height) return null;
    const baseScale = Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height);
    const scale = baseScale * zoom;
    const displayWidth = imageSize.width * scale;
    const displayHeight = imageSize.height * scale;
    const maxX = Math.max(0, (displayWidth - frameSize.width) / 2);
    const maxY = Math.max(0, (displayHeight - frameSize.height) / 2);

    return {
      baseScale,
      scale,
      displayWidth,
      displayHeight,
      maxX,
      maxY,
    };
  }, [frameSize.height, frameSize.width, imageSize, zoom]);

  function clampOffset(nextOffset: Offset, nextZoom = zoom): Offset {
    if (!imageSize || !frameSize.width || !frameSize.height) return nextOffset;
    const baseScale = Math.max(frameSize.width / imageSize.width, frameSize.height / imageSize.height);
    const displayWidth = imageSize.width * baseScale * nextZoom;
    const displayHeight = imageSize.height * baseScale * nextZoom;
    const maxX = Math.max(0, (displayWidth - frameSize.width) / 2);
    const maxY = Math.max(0, (displayHeight - frameSize.height) / 2);
    return {
      x: clamp(nextOffset.x, -maxX, maxX),
      y: clamp(nextOffset.y, -maxY, maxY),
    };
  }

  function updateZoom(value: number) {
    const nextZoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    setZoom(nextZoom);
    setOffset(current => clampOffset(current, nextZoom));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setOffset(current => clampOffset({ x: current.x + dx, y: current.y + dy }));
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    updateZoom(zoom + (event.deltaY > 0 ? -ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP));
  }

  async function handleSave() {
    const image = imageRef.current;
    if (!image || !imageSize || !geometry) return;

    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not supported');

      const imageLeft = frameSize.width / 2 - geometry.displayWidth / 2 + offset.x;
      const imageTop = frameSize.height / 2 - geometry.displayHeight / 2 + offset.y;
      const sourceX = (0 - imageLeft) / geometry.scale;
      const sourceY = (0 - imageTop) / geometry.scale;
      const sourceWidth = frameSize.width / geometry.scale;
      const sourceHeight = frameSize.height / geometry.scale;

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        OUTPUT_WIDTH,
        OUTPUT_HEIGHT,
      );

      await onConfirm(await canvasToFile(canvas, outputFileName(file)));
    } finally {
      setSaving(false);
    }
  }

  const previewRatio = 120 / frameSize.width;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Загрузка фото</h2>
            <p className="mt-0.5 text-sm text-gray-500">Передвиньте фото и настройте масштаб</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg p-1.5 text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => updateZoom(zoom - ZOOM_BUTTON_STEP)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                <Minus size={15} />
              </button>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.05}
                value={zoom}
                onChange={event => updateZoom(Number(event.target.value))}
                className="h-2 flex-1 cursor-pointer accent-blue-600"
              />
              <button
                type="button"
                onClick={() => updateZoom(zoom + ZOOM_BUTTON_STEP)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                <Plus size={15} />
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-slate-100 p-4">
              <div
                ref={frameRef}
                className="relative mx-auto aspect-[3/4] w-[min(72vw,330px)] touch-none cursor-grab overflow-hidden rounded-xl bg-gray-200 active:cursor-grabbing"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onWheel={handleWheel}
              >
                {imageUrl ? (
                  <img
                    ref={imageRef}
                    src={imageUrl}
                    alt=""
                    draggable={false}
                    onLoad={event => {
                      const image = event.currentTarget;
                      setImageSize({
                        width: image.naturalWidth || image.width,
                        height: image.naturalHeight || image.height,
                      });
                    }}
                    className="absolute left-1/2 top-1/2 max-w-none select-none"
                    style={{
                      width: geometry?.displayWidth || 'auto',
                      height: geometry?.displayHeight || 'auto',
                      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
                    }}
                  />
                ) : null}
                {preparing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm font-medium text-gray-600">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    Конвертируем PDF в JPG...
                  </div>
                )}
                {prepareError && !preparing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white px-5 text-center text-sm text-red-600">
                    {prepareError}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-white/90 ring-offset-0" />
                <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/50" />
                <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/50" />
                <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/50" />
                <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/50" />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <ImagePlus size={20} />
            </div>
            <div className="mb-3 text-sm font-medium text-gray-700">Предпросмотр</div>
            <div className="relative h-40 w-[120px] overflow-hidden rounded-lg border border-gray-200 bg-gray-200">
              {imageUrl && geometry ? (
                <img
                  src={imageUrl}
                  alt=""
                  draggable={false}
                  className="absolute left-1/2 top-1/2 max-w-none select-none"
                  style={{
                    width: geometry.displayWidth * previewRatio,
                    height: geometry.displayHeight * previewRatio,
                    transform: `translate(-50%, -50%) translate(${offset.x * previewRatio}px, ${offset.y * previewRatio}px)`,
                  }}
                />
              ) : null}
            </div>
            <p className="mt-4 text-center text-xs leading-5 text-gray-500">
              PDF сначала конвертируется в JPG. Итоговый файл сохранится в формате 3:4 для удостоверений.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Отменить
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSave();
            }}
            disabled={saving || preparing || !imageSize}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {saving ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Save size={16} />
            )}
            Сохранить фото
          </button>
        </div>
      </div>
    </div>
  );
}
