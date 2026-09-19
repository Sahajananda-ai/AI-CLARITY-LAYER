import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface DockItem {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}

export interface DockProps {
  items: DockItem[];
  panelHeight?: number;
  baseItemSize?: number;
  magnification?: number;
  distance?: number;
  className?: string;
  side?: 'bottom' | 'top';
}

/**
 * macOS-style magnifying dock, rendered as a fixed pill near the bottom of the
 * viewport. On the dashboard it gives one-tap access to the key surfaces
 * (tracker, messages, assistant, PDF) from anywhere on the page.
 */
export function Dock({
  items,
  panelHeight = 64,
  baseItemSize = 46,
  magnification = 66,
  distance = 140,
  className,
  side = 'bottom',
}: DockProps) {
  const [mouseX, setMouseX] = useState<number | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (event: PointerEvent) => setMouseX(event.clientX);
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const dockLeft = dockRef.current?.getBoundingClientRect().left ?? 0;

  const resolveSize = (index: number): number => {
    if (mouseX === null) return baseItemSize;
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return baseItemSize;
    const center = dockLeft + (rect.width / items.length) * (index + 0.5);
    const delta = Math.abs(mouseX - center);
    if (delta >= distance) return baseItemSize;
    // Bell-curve magnification.
    const ratio = 1 - delta / distance;
    return baseItemSize + (magnification - baseItemSize) * Math.sin((ratio * Math.PI) / 2);
  };

  return (
    <div
      className={`fixed left-1/2 z-[70] -translate-x-1/2 ${className ?? ''}`}
      style={{ [side]: 20 } as React.CSSProperties}
    >
      <div
        ref={dockRef}
        className="flex items-end gap-2 rounded-2xl border border-white/40 bg-white/70 px-3 shadow-2xl shadow-slate-900/10 backdrop-blur-xl"
        style={{ height: panelHeight }}
        role="navigation"
      >
        {items.map((item, index) => {
          const size = resolveSize(index);
          return (
            <button
              key={item.label}
              type="button"
              title={item.label}
              aria-label={item.label}
              onClick={item.onClick}
              className={`flex flex-shrink-0 items-center justify-center rounded-xl border border-surface-200 bg-white text-surface-600 shadow-sm transition-colors hover:border-primary-300 hover:text-primary-600 ${item.className ?? ''}`}
              style={{
                width: size,
                height: size,
                transformOrigin: side === 'bottom' ? 'bottom center' : 'top center',
                transition: 'width 120ms ease-out, height 120ms ease-out',
              }}
            >
              {item.icon}
            </button>
          );
        })}
        <span className="sr-only">
          <X className="hidden" />
        </span>
      </div>
    </div>
  );
}
