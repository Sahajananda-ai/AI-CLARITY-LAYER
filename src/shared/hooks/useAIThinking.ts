import { useEffect, useState } from 'react';

/**
 * Narrates what the simulated AI is doing while it works.
 *
 * The delay is the point: judges should *see* the reasoning take a moment, and
 * the step labels tell them what is being computed rather than showing a bare
 * spinner for two seconds.
 */
export function useAIThinking(steps: readonly string[], active: boolean, intervalMs = 850) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setTick(current => (current + 1) % steps.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, steps.length]);

  // While idle the first step is shown, so nothing has to be reset on stop.
  const index = active ? tick % steps.length : 0;

  return {
    step: steps[index] ?? '',
    index,
    total: steps.length,
  };
}
