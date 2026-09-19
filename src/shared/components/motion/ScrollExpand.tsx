import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MousePointerClick } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface ScrollExpandProps {
  src?: string;
  alt?: string;
  title?: string;
  scrollHint?: string;
  children?: ReactNode;
  /** Zoom applied to the media at the start of the scroll (1 = none). */
  mediaZoom?: number;
  useWindowScroll?: boolean;
  height?: number;
  className?: string;
}

/**
 * A media frame that starts as a rounded card and expands toward full-bleed as
 * the page scrolls, handing the stage to the content inside. Used on the
 * landing page hero so the first screen has a signature motion moment.
 */
export function ScrollExpand({
  src,
  alt = '',
  title,
  scrollHint,
  children,
  mediaZoom = 1.15,
  useWindowScroll = true,
  height = 460,
  className,
}: ScrollExpandProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!useWindowScroll) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const node = ref.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const vh = window.innerHeight;
        // 0 when the block enters from below, 1 once it reaches the top third.
        const raw = 1 - (rect.top - vh * 0.08) / (vh * 0.7);
        setProgress(Math.min(1, Math.max(0, raw)));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [useWindowScroll]);

  const radius = 28 - 22 * progress;
  const scale = 1 + (mediaZoom - 1) * (1 - progress);

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <div
        className="relative w-full overflow-hidden"
        style={{
          height,
          borderRadius: `${radius}px`,
          boxShadow: `0 ${12 + 18 * progress}px ${30 + 30 * progress}px -18px rgba(15, 23, 42, 0.35)`,
          transition: 'box-shadow 200ms ease',
        }}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: `scale(${scale})`, transition: 'transform 80ms linear' }}
          />
        ) : (
          children
        )}
        {src && children && (
          <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent p-6 sm:p-10">
            {children}
          </div>
        )}
        {(title || scrollHint) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent p-6 sm:p-10">
            <h3 className="text-2xl font-bold text-white sm:text-4xl">{title}</h3>
            {scrollHint && progress < 0.55 && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                <MousePointerClick className="h-3.5 w-3.5" />
                {scrollHint}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
