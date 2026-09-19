import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';

export type SwipeToastCloseReason = 'timeout' | 'swipe' | 'button' | 'action';

export interface SwipeToastProps {
  open: boolean;
  onClose: (reason: SwipeToastCloseReason) => void;
  title: ReactNode;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  /** Leading icon (channel glyph, milestone icon…). */
  icon?: ReactNode;
  background?: string;
  color?: string;
  fuseColor?: string;
  width?: number;
  radius?: number;
  slideMs?: number;
  /** 0 = no overshoot on arrival, 0.4 = playful spring. */
  settleBounce?: number;
  /** Horizontal drag (px) that counts as a swipe-out. */
  swipeDistance?: number;
  /** Auto-dismiss window in ms. 0 disables the fuse. */
  duration?: number;
  fuse?: 'bottom' | 'top' | 'none';
  pauseOnHover?: boolean;
  closeButton?: boolean;
  /** Render in normal flow (for stacking inside a host container). */
  inline?: boolean;
}

const DEFAULTS = {
  background: '#18181b',
  color: '#fafafa',
  fuseColor: '#f5a524',
  width: 360,
  radius: 14,
  slideMs: 380,
  settleBounce: 0.25,
  swipeDistance: 64,
  duration: 5200,
};

/**
 * A phone-style popup toast: springs in, counts down with a fuse bar, pauses
 * on hover, and can be flicked away to the right. Used to surface every SMS /
 * WhatsApp milestone the moment it is dispatched so the notification story is
 * impossible to miss during the demo.
 */
export function SwipeToast({
  open,
  onClose,
  title,
  description,
  actionLabel,
  onAction,
  icon,
  background = DEFAULTS.background,
  color = DEFAULTS.color,
  fuseColor = DEFAULTS.fuseColor,
  width = DEFAULTS.width,
  radius = DEFAULTS.radius,
  slideMs = DEFAULTS.slideMs,
  settleBounce = DEFAULTS.settleBounce,
  swipeDistance = DEFAULTS.swipeDistance,
  duration = DEFAULTS.duration,
  fuse = 'bottom',
  pauseOnHover = true,
  closeButton = true,
  inline = false,
}: SwipeToastProps) {
  const [phase, setPhase] = useState<'enter' | 'in' | 'leave'>('enter');
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [fuseProgress, setFuseProgress] = useState(0);

  const dragRef = useRef(0);
  const pointer = useRef({ startX: 0, active: false });
  const elapsed = useRef(0);
  const paused = useRef(false);
  const closingRef = useRef(false);
  const leaveTimer = useRef<number>(0);

  const close = useCallback(
    (reason: SwipeToastCloseReason) => {
      if (closingRef.current) return;
      closingRef.current = true;
      setPhase('leave');
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = window.setTimeout(() => onClose(reason), slideMs);
    },
    [onClose, slideMs]
  );

  // Kick the enter transition one frame after mount so the transform animates.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('in'));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Re-arm when reopened.
  useEffect(() => {
    if (open) {
      closingRef.current = false;
      setPhase('enter');
      requestAnimationFrame(() => setPhase('in'));
    }
  }, [open]);

  // Fuse countdown driven by rAF so hover-pause is exact.
  useEffect(() => {
    if (!open || duration <= 0 || fuse === 'none') return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (phase === 'in' && !paused.current && !dragging) {
        elapsed.current += dt;
        const progress = Math.min(1, elapsed.current / duration);
        setFuseProgress(progress);
        if (progress >= 1) {
          close('timeout');
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, duration, fuse, phase, dragging, close]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== 'in') return;
    pointer.current = { startX: event.clientX, active: true };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointer.current.active) return;
    const dx = Math.max(0, event.clientX - pointer.current.startX);
    dragRef.current = dx;
    setDragX(dx);
  };

  const handlePointerUp = () => {
    if (!pointer.current.active) return;
    pointer.current.active = false;
    setDragging(false);
    if (dragRef.current > swipeDistance) {
      dragRef.current = width + 120;
      setDragX(dragRef.current);
      window.setTimeout(() => onClose('swipe'), slideMs);
    } else {
      dragRef.current = 0;
      setDragX(0);
    }
  };

  if (!open && phase !== 'leave') return null;

  const x = phase === 'enter' ? width + 60 : phase === 'leave' ? Math.max(dragX, 0) + width + 120 : dragX;
  const overshoot = 1 + settleBounce;
  const transition = dragging
    ? 'none'
    : `transform ${slideMs}ms cubic-bezier(0.22, 1, 0.36, ${overshoot.toFixed(2)}), opacity ${slideMs}ms ease`;

  return (
    <div
      style={{
        width,
        opacity: phase === 'enter' ? 0 : 1,
        pointerEvents: phase === 'leave' ? 'none' : 'auto',
      }}
      className={inline ? 'relative' : 'fixed bottom-6 right-6 z-[80]'}
    >
      <div
        role="status"
        aria-live="polite"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseEnter={() => {
          if (pauseOnHover) paused.current = true;
        }}
        onMouseLeave={() => {
          if (pauseOnHover) paused.current = false;
        }}
        className="cursor-grab touch-pan-y select-none overflow-hidden shadow-2xl shadow-black/25 active:cursor-grabbing"
        style={{
          background,
          color,
          borderRadius: radius,
          transform: `translateX(${x}px)`,
          transition,
          touchAction: 'pan-y',
        }}
      >
        {fuse === 'top' && (
          <div className="h-[3px] w-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <div
              className="h-full origin-left"
              style={{ background: fuseColor, transform: `scaleX(${fuseProgress})`, transition: dragging ? 'none' : 'transform 90ms linear' }}
            />
          </div>
        )}

        <div className="flex items-start gap-3 px-4 py-3">
          {icon && <div className="mt-0.5 flex-shrink-0">{icon}</div>}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{title}</p>
            {description && <p className="mt-1 line-clamp-3 text-xs leading-relaxed opacity-80">{description}</p>}
            {actionLabel && (
              <button
                type="button"
                onClick={() => {
                  onAction?.();
                  close('action');
                }}
                className="mt-2 rounded-md px-2 py-1 text-xs font-semibold transition-colors hover:bg-white/10"
                style={{ color }}
              >
                {actionLabel}
              </button>
            )}
          </div>
          {closeButton && (
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => close('button')}
              className="flex-shrink-0 rounded-full p-1 opacity-60 transition hover:bg-white/10 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {fuse === 'bottom' && (
          <div className="h-[3px] w-full" style={{ background: 'rgba(255,255,255,0.12)' }}>
            <div
              className="h-full origin-left"
              style={{ background: fuseColor, transform: `scaleX(${fuseProgress})`, transition: dragging ? 'none' : 'transform 90ms linear' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
