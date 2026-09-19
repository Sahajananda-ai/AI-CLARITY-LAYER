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
 * the matching SMS + WhatsApp milestone in the applicant's language:
 *
 *   received → verified → under review → ⏸ waits for the decision
 *
 * The clock deliberately stops at "under review": the approve/reject outcome
 * belongs to the underwriter, who exercises it from the dashboard's decision
 * control (or the automatic demo timer, if enabled). A rejection is terminal —
 * the clock disarms itself and the dashboard switches to its rejection state.
 */

/** Milliseconds between milestone advances in the demo. */
const ADVANCE_INTERVAL_MS = 60_000;

const STAGE_ORDER: LifecycleStage[] = ['received', 'verified', 'review'];

const KIND_BY_STAGE: Record<LifecycleStage, NotificationKind | null> = {
  received: null, // sent immediately at submit time, not by the clock
  verified: 'documents_verified',
  review: 'under_review',
  approved: 'approved', // fired by the decision control, not the clock
  finalized: 'finalized', // fired after an approval
  rejected: 'rejected', // fired by the decision control
};

export function LifecycleRunner() {
  const { state, actions } = useApp();
  const { dict, language } = useI18n();
  const { submitted, journeyType, applicant, phone, lifecycle, lifecycleAdvancedAt, decision } = state;

  const busyRef = useRef(false);

  useEffect(() => {
    // Terminal state: the underwriter has decided; nothing more fires.
    if (decision) return;
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
  }, [submitted, journeyType, applicant, phone, lifecycle, lifecycleAdvancedAt, decision, actions, dict, language]);

  // `advanceLifecycle` is a reducer dispatch that only moves the timestamp; the
  // stage label itself is derived from the notification kinds already sent, so
  // the tracker stays honest with what the applicant has actually received.
  return null;
}
