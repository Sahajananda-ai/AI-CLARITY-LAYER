import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface ThoughtLineProps {
  /** When true, cycles through `steps` with a breathing shimmer. */
  working: boolean;
  steps: string[];
  label?: string;
  doneLabel?: string;
  /** Time (s) from last step to settle, shown by the timer chip. */
  onSettle?: (seconds: number) => void;
  glyph?: 'sparkle' | 'pulse' | 'orbit';
  fontSize?: number;
  breathPeriod?: number;
  breathDepth?: number;
  settleDuration?: number;
  settleBlur?: number;
  collapsible?: boolean;
  collapseOnSettle?: boolean;
  showTimer?: boolean;
  className?: string;
}

/**
 * The assistant's "thinking" line: cycling reasoning steps with a soft
 * breathing emphasis, collapsing to a tidy "Thought for Xs" chip when the
 * reply lands. Used in the chat window while the reply is composed.
 */
export function ThoughtLine({
  working,
  steps,
  label = 'Thinking…',
  doneLabel = 'Thought for',
  onSettle,
  glyph = 'sparkle',
  fontSize = 14,
  breathPeriod = 1.6,
  breathDepth = 0.45,
  settleDuration = 350,
  settleBlur = 2,
  collapsible = true,
  collapseOnSettle = false,
  showTimer = false,
  className,
}: ThoughtLineProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [settled, setSettled] = useState(false);
  const [collapsed, setCollapsed] = useState(collapseOnSettle && collapsible);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!working) return;
    startedAt.current = Date.now();
    setSettled(false);
    setCollapsed(false);
    setElapsed(0);
    setStepIndex(0);

    const stepTimer = window.setInterval(() => {
      setStepIndex(index => Math.min(index + 1, steps.length - 1));
    }, 1400);

    const clockTimer = window.setInterval(() => {
      setElapsed((Date.now() - startedAt.current) / 1000);
    }, 200);

    return () => {
      window.clearInterval(stepTimer);
      window.clearInterval(clockTimer);
    };
  }, [working, steps.length]);

  useEffect(() => {
    if (working || settled) return;
    if (startedAt.current === 0) return;
    setSettled(true);
    onSettle?.(Math.round((Date.now() - startedAt.current) / 100) / 10);
    if (collapseOnSettle && collapsible) {
      const timer = window.setTimeout(() => setCollapsed(true), settleDuration + 400);
      return () => window.clearTimeout(timer);
    }
  }, [working, settled, onSettle, collapseOnSettle, collapsible, settleDuration]);

  if (settled && collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className={cn('text-xs text-surface-400 transition-colors hover:text-surface-600', className)}
      >
        {doneLabel} {elapsed.toFixed(1)}s
      </button>
    );
  }

  const active = !settled;

  return (
    <div
      className={cn('flex items-center gap-2', className)}
      style={{
        filter: settled && settleBlur > 0 ? `blur(${settleBlur * 0.4}px)` : undefined,
        opacity: settled ? 0.75 : 1,
        transition: `opacity ${settleDuration}ms ease, filter ${settleDuration}ms ease`,
      }}
    >
      {glyph === 'sparkle' && (
        <Sparkles
          className="h-4 w-4 flex-shrink-0 text-primary-500"
          style={
            active
              ? {
                  animation: `breathe ${breathPeriod}s ease-in-out infinite`,
                  opacity: 1 - breathDepth * 0.4,
                }
              : undefined
          }
        />
      )}
      {glyph === 'pulse' && (
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-500" />
        </span>
      )}
      {glyph === 'orbit' && (
        <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
          <span
            className="h-3 w-3 rounded-full border-2 border-primary-200"
            style={{ borderTopColor: '#3b82f6', animation: active ? 'spin 1.1s linear infinite' : undefined }}
          />
        </span>
      )}

      <span
        className="font-medium text-surface-500"
        style={{ fontSize, animation: active ? `breathe ${breathPeriod}s ease-in-out infinite` : undefined }}
      >
        {active ? (stepIndex === 0 ? label : steps[stepIndex]) : `${doneLabel} ${elapsed.toFixed(1)}s`}
      </span>

      {showTimer && active && <span className="text-xs tabular-nums text-surface-300">{elapsed.toFixed(1)}s</span>}

      {collapsible && settled && (
        <button type="button" onClick={() => setCollapsed(true)} className="text-xs text-surface-300 hover:text-surface-500">
          (hide)
        </button>
      )}

      <style>{`@keyframes breathe { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: ${1 - breathDepth}; transform: scale(0.96); } }`}</style>
    </div>
  );
}
