import { useCallback, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

type ResizeMode = 'x' | 'y' | 'xy';

interface Props {
  children: ReactNode;
  initialHeight?: number;
  minHeight?: number;
  minWidthPx?: number;
  className?: string;
}

export default function ResizableTableContainer({
  children,
  initialHeight = 900,
  minHeight = 900,
  minWidthPx = 900,
  className = '',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(initialHeight);
  const [width, setWidth] = useState<number | null>(null);

  const startResize = useCallback((mode: ResizeMode, event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = containerRef.current?.offsetWidth ?? 0;
    const startHeight = containerRef.current?.offsetHeight ?? initialHeight;

    const onMove = (e: globalThis.MouseEvent) => {
      if (mode === 'x' || mode === 'xy') {
        const nextWidth = Math.max(minWidthPx, startWidth + (e.clientX - startX));
        setWidth(nextWidth);
      }

      if (mode === 'y' || mode === 'xy') {
        const nextHeight = Math.max(minHeight, startHeight + (e.clientY - startY));
        setHeight(nextHeight);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [initialHeight, minHeight, minWidthPx]);

  return (
    <div
      ref={containerRef}
      className={`relative rounded-xl border border-gray-200 ${className}`.trim()}
      style={{
        height: `${height}px`,
        minHeight: `${minHeight}px`,
        minWidth: '100%',
        width: width ? `${width}px` : undefined,
        overflow: 'auto',
      }}
    >
      {children}

      <div
        className="absolute top-0 right-0 h-full w-2 cursor-ew-resize z-20 hover:bg-blue-200/20"
        onMouseDown={(e) => startResize('x', e)}
        title="Тянуть вправо"
      />
      <div
        className="absolute left-0 bottom-0 h-2 w-full cursor-ns-resize z-20 hover:bg-blue-200/20"
        onMouseDown={(e) => startResize('y', e)}
        title="Тянуть вниз"
      />
      <div
        className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize z-30 bg-gradient-to-tl from-blue-500/30 to-transparent"
        onMouseDown={(e) => startResize('xy', e)}
        title="Тянуть вниз и вправо"
      />
    </div>
  );
}
