import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface AnimatedListProps {
  items: string[];
  onItemSelect?: (item: string, index: number) => void;
  showGradients?: boolean;
  enableArrowNavigation?: boolean;
  displayScrollbar?: boolean;
  className?: string;
  itemClassName?: string;
}

/**
 * An animated vertical list: each row slides in staggered, lights up on hover
 * with a gradient sheen, and supports arrow-key navigation. Used for the
 * problem picker so the demo "choose a problem" moment feels like a menu,
 * not a row of identical buttons.
 */
export function AnimatedList({
  items,
  onItemSelect,
  showGradients = true,
  enableArrowNavigation = true,
  displayScrollbar = false,
  className,
  itemClassName,
}: AnimatedListProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!enableArrowNavigation) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!listRef.current?.contains(document.activeElement) && document.activeElement !== listRef.current) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusIndex(index => (index + 1) % items.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusIndex(index => (index - 1 + items.length) % items.length);
      } else if (event.key === 'Enter' && document.activeElement instanceof HTMLButtonElement) {
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enableArrowNavigation, items.length]);

  useEffect(() => {
    itemRefs.current[focusIndex]?.focus({ preventScroll: true });
  }, [focusIndex]);

  return (
    <ul
      ref={listRef}
      className={cn('space-y-2 outline-none', !displayScrollbar && 'scrollbar-hide', className)}
      style={{ overflowY: displayScrollbar ? 'auto' : 'visible' }}
    >
      {items.map((item, index) => {
        const isSelected = selectedIndex === index;
        return (
          <li
            key={item}
            style={{
              animation: `slide-in-item 420ms cubic-bezier(0.22, 1, 0.36, 1) both`,
              animationDelay: `${index * 55}ms`,
            }}
          >
            <button
              ref={node => {
                itemRefs.current[index] = node;
              }}
              type="button"
              onClick={() => {
                setSelectedIndex(index);
                onItemSelect?.(item, index);
              }}
              className={cn(
                'group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-200',
                isSelected
                  ? 'border-primary-500 bg-primary-50 text-primary-800 shadow-sm'
                  : 'border-surface-200 bg-white text-surface-700 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md',
                itemClassName
              )}
              onFocus={() => setFocusIndex(index)}
            >
              {showGradients && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      'linear-gradient(110deg, transparent 20%, rgba(59,130,246,0.10) 45%, rgba(147,197,253,0.18) 55%, transparent 80%)',
                  }}
                />
              )}
              <span className="relative z-10 flex-1">{item}</span>
              <ArrowRight
                className={cn(
                  'relative z-10 h-4 w-4 flex-shrink-0 transition-all',
                  isSelected ? 'translate-x-0 text-primary-600 opacity-100' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                )}
              />
            </button>
          </li>
        );
      })}
      <style>{`@keyframes slide-in-item { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </ul>
  );
}

export type AnimatedListStyle = CSSProperties;
