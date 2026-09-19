import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, AlertTriangle, ChevronRight } from 'lucide-react';

export interface SlideCommitProps {
  /** Text on the track before the drag completes. */
  label: string;
  /** Text flashed once the action commits. */
  doneLabel?: string;
  /** Text flashed when `onConfirm` rejects. */
  errorLabel?: string;
  /** Return true (or a resolving promise) to commit; false/throw shows the error state. */
  onConfirm: () => boolean | void | Promise<boolean | void>;
  onDone?: () => void;
  onError?: (reason: 'rejected' | 'error') => void;
  trackColor?: string;
  handleColor?: string;
  successColor?: string;
  dangerColor?: string;
  textColor?: string;
  width?: number;
  height?: number;
  radius?: number;
  /** Pixels of travel after which the drag commits. */
  speed?: number;
  returnBounce?: number;
  holdMs?: number;
  disabled?: boolean;
  className?: string;
}

type Phase = 'idle' | 'dragging' | 'committing' | 'done' | 'error';

/**
 * Slide-to-confirm: the submit interaction used for the loan/insurance
 * application. Prevents accidental submissions and gives the demo a
 * deliberate, physical "this action counts" moment.
 */
export function SlideCommit({
  label,
  doneLabel = 'Done',
  errorLabel = 'Something went wrong',
  onConfirm,
  onDone,
  onError,
  trackColor = '#0f172a',
  handleColor = '#ffffff',
  successColor = '#16a34a',
  dangerColor = '#dc2626',
  textColor = '#ffffff',
  width = 320,
  height = 56,
  radius = 999,
  speed = 60,
  holdMs = 1400,
  disabled = false,
  className,
}: SlideCommitProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [dragX, setDragX] = useState(0);
  const pointer = useRef({ startX: 0, active: false });
  const trackRef = useRef<HTMLDivElement>(null);

  const maxTravel = Math.max(24, width - height - 8);
  const commitPoint = Math.max(speed, maxTravel * 0.72);

  const reset = useCallback((delay = holdMs) => {
    window.setTimeout(() => {
      setPhase('idle');
      setDragX(0);
    }, delay);
  }, [holdMs]);

  useEffect(() => () => window.clearTimeout(holdMs), [holdMs]);

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || phase === 'committing' || phase === 'done' || phase === 'error') return;
    pointer.current = { startX: event.clientX - dragX, active: true };
    setPhase('dragging');
    // Pointer capture keeps the drag alive when the cursor leaves the handle;
    // some environments (older WebKit, synthetic events) reject it, so degrade
    // gracefully instead of breaking the whole gesture.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* drag continues without capture — move events still land while hovering */
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!pointer.current.active) return;
    const x = Math.min(maxTravel, Math.max(0, event.clientX - pointer.current.startX));
    setDragX(x);
  };

  const onPointerUp = async () => {
    if (!pointer.current.active) return;
    pointer.current.active = false;
    if (dragX < commitPoint) {
      setDragX(0);
      setPhase('idle');
      return;
    }
    setPhase('committing');
    try {
      const result = await onConfirm();
      if (result === false) {
        setPhase('error');
        onError?.('rejected');
        reset();
        return;
      }
      setPhase('done');
      setDragX(maxTravel);
      onDone?.();
      reset();
    } catch {
      setPhase('error');
      onError?.('error');
      reset();
    }
  };

  const background =
    phase === 'done' ? successColor : phase === 'error' ? dangerColor : phase === 'committing' ? trackColor : trackColor;

  const showCheck = phase === 'done';
  const showWarn = phase === 'error';
  const progress = phase === 'done' ? 1 : dragX / maxTravel;

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={label}
      className={className}
      style={{ width: '100%', maxWidth: width }}
    >
      <div
        className="relative w-full select-none"
        style={{
          height,
          borderRadius: radius,
          background,
          opacity: disabled ? 0.55 : 1,
          transition: 'background 300ms ease, opacity 200ms ease',
          boxShadow: '0 10px 30px -12px rgba(2, 6, 23, 0.55)',
        }}
      >
        <p
          className="absolute inset-0 flex items-center justify-center gap-1.5 px-12 text-sm font-semibold tracking-wide"
          style={{ color: textColor, opacity: showCheck || showWarn ? 0 : Math.max(0.25, 1 - progress * 1.4), transition: 'opacity 200ms ease' }}
        >
          <ChevronRight className="h-4 w-4" />
          {label}
        </p>
        {showCheck && (
          <p className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: textColor }}>
            {doneLabel}
          </p>
        )}
        {showWarn && (
          <p className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: textColor }}>
            {errorLabel}
          </p>
        )}

        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute top-1 left-1 flex items-center justify-center shadow-lg"
          style={{
            width: height - 8,
            height: height - 8,
            borderRadius: radius,
            background: handleColor,
            transform: `translateX(${dragX}px)`,
            transition: phase === 'dragging' ? 'none' : 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
            cursor: disabled ? 'not-allowed' : 'grab',
            touchAction: 'none',
          }}
        >
          {showCheck ? (
            <Check className="h-5 w-5" style={{ color: successColor }} />
          ) : showWarn ? (
            <AlertTriangle className="h-5 w-5" style={{ color: dangerColor }} />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
}
