import { useEffect, useRef, useState } from 'react';
import { cn } from '../../utils/cn';

export interface RubberSegmentProps {
  items: readonly string[];
  defaultValue?: string;
  onChange?: (value: string, index: number) => void;
  trackColor?: string;
  thumbColor?: string;
  textColor?: string;
  activeTextColor?: string;
  size?: 'sm' | 'md' | 'lg';
  radius?: number;
  /** Fixed slot count — pads/truncates the item list for an even split. */
  equalSlots?: boolean;
  className?: string;
}

const SIZES = {
  sm: { h: 28, px: 10, text: 'text-xs' },
  md: { h: 34, px: 14, text: 'text-sm' },
  lg: { h: 40, px: 18, text: 'text-base' },
} as const;

/**
 * A segmented control with a rubber thumb that stretches between slots as you
 * move across it. Used for the EN/हिंदी/ಕನ್ನಡ switcher so even the language
 * toggle feels alive.
 */
export function RubberSegment({
  items,
  defaultValue,
  onChange,
  trackColor = 'rgba(15, 23, 42, 0.06)',
  thumbColor = '#ffffff',
  textColor = '#334155',
  activeTextColor = '#0f172a',
  size = 'md',
  radius = 12,
  className,
}: RubberSegmentProps) {
  const [value, setValue] = useState(defaultValue ?? items[0]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [thumb, setThumb] = useState({ left: 0, width: 0, stretch: 0 });
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeIndex = items.indexOf(value);
  const targetIndex = hovered ?? activeIndex;
  const dims = SIZES[size];

  // Measure and position the rubber thumb.
  useEffect(() => {
    const container = containerRef.current;
    const from = itemRefs.current[activeIndex];
    const to = itemRefs.current[targetIndex];
    if (!container || !from || !to) return;

    const cRect = container.getBoundingClientRect();
    const fRect = from.getBoundingClientRect();
    const tRect = to.getBoundingClientRect();
    const left = fRect.left - cRect.left;
    const right = tRect.right - cRect.left;
    const width = Math.max(fRect.width, tRect.width);
    const stretch = Math.max(0, right - left - width);

    setThumb({ left, width, stretch });
  }, [activeIndex, targetIndex, items]);

  const select = (item: string, index: number) => {
    setValue(item);
    onChange?.(item, index);
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      className={cn('relative inline-flex items-center', className)}
      style={{ background: trackColor, borderRadius: radius, padding: 3, height: dims.h + 6 }}
      onMouseLeave={() => setHovered(null)}
    >
      <div
        aria-hidden
        className="absolute top-[3px] shadow-sm"
        style={{
          left: thumb.left,
          width: thumb.width + thumb.stretch,
          height: dims.h,
          borderRadius: radius - 3,
          background: thumbColor,
          transition: hovered !== null
            ? 'left 140ms cubic-bezier(0.34, 1.56, 0.64, 1), width 140ms cubic-bezier(0.34, 1.56, 0.64, 1)'
            : 'left 260ms cubic-bezier(0.22, 1, 0.36, 1), width 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      />
      {items.map((item, index) => (
        <button
          key={item}
          ref={node => {
            itemRefs.current[index] = node;
          }}
          type="button"
          role="tab"
          aria-selected={item === value}
          onMouseEnter={() => setHovered(index)}
          onClick={() => select(item, index)}
          className={cn('relative z-10 whitespace-nowrap font-semibold transition-colors', dims.text)}
          style={{
            padding: `0 ${dims.px}px`,
            height: dims.h,
            color: item === value ? activeTextColor : textColor,
          }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
