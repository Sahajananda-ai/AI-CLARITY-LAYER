import { useEffect, useRef } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useI18n } from '../../shared/i18n';
import { dispatchNotification, type NotificationKind, type LifecycleStage } from './engine';
import { buildReference } from '../chat/engine';

/**
 * Simulated backend clock.
 *
 * After submission, the application "moves" through the lifecycle roughly once
 * a minute (demo-compressed; production would be days), and each advance sends
 * the matching SMS + WhatsApp milestone in the applicant's language. The timer
 * lives in a tiny component instead of an effect in the provider so the
 * provider file stays data-only and the interval cannot double-register under
 * React StrictMode (the cleanup drops the first instance).
 *
 * Judges who do not want to wait can click **Advance stage now** on the
 * dashboard, which jumps the clock forward immediately.
 */

/** Milliseconds between milestone advances in the demo. */
const ADVANCE_INTERVAL_MS = 60_000;

const STAGE_ORDER: LifecycleStage[] = ['received', 'verified', 'approved', 'finalized'];

const KIND_BY_STAGE: Record<LifecycleStage, NotificationKind | null> = {
  received: null, // sent immediately at submit time, not by the clock
  verified: 'documents_verified',
  approved: 'approved',
  finalized: 'finalized',
};

export function LifecycleRunner() {
  const { state, actions } = useApp();
  const { dict, language } = useI18n();
  const { submitted, journeyType, applicant, phone, lifecycle, lifecycleAdvancedAt } = state;

  const busyRef = useRef(false);

  useEffect(() => {
    if (!submitted || !journeyType || !applicant || !phone) return;

    const nextStage = lifecycle ? STAGE_ORDER[STAGE_ORDER.indexOf(lifecycle) + 1] : 'verified';
    if (!nextStage) return;

    const base = lifecycleAdvancedAt ?? Date.now();

    const advance = () => {
      if (busyRef.current) return;
      busyRef.current = true;
      const kind = KIND_BY_STAGE[nextStage];
      if (kind) {
        actions.addNotification(
          dispatchNotification(kind, {
            journeyType,
            applicant,
            reference: buildReference({ journeyType, applicant }),
            language,
            dict,
            phone,
          })
        );
      }
      actions.advanceLifecycle(nextStage);
      busyRef.current = false;
    };

    const elapsed = Date.now() - base;
    const wait = Math.max(0, ADVANCE_INTERVAL_MS - elapsed);

    const timer = window.setTimeout(advance, wait);
    return () => window.clearTimeout(timer);
    // Re-arm after every advance because `lifecycle` changes the schedule.
  }, [submitted, journeyType, applicant, phone, lifecycle, lifecycleAdvancedAt, actions, dict, language]);

  // `advanceLifecycle` is a reducer dispatch that only moves the timestamp; the
  // stage label itself is derived from the notification kinds already sent, so
  // the tracker stays honest with what the applicant has actually received.
  return null;
}
