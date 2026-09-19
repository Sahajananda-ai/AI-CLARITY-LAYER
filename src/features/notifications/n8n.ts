/**
 * n8n integration.
 *
 * When the judge (or a real deployment) drops an n8n webhook URL into
 * localStorage, every application milestone is mirrored to that webhook as a
 * JSON POST — which is exactly the trigger an n8n workflow expects. The bundled
 * workflow (docs/n8n-clarity-workflow.json) receives the payload, can enrich it
 * with Cognee memory, and routes it to Slack/Sheets/anything else.
 *
 * With no URL configured this is a deliberate no-op, and each notification is
 * labelled `preview only` in the feed so the demo never pretends a delivery
 * happened. When a URL IS configured, every mirror attempt records an outcome
 * (`delivered ✓` / `n8n failed`) that the feed shows as a chip per message.
 */

export const N8N_WEBHOOK_STORAGE_KEY = 'paytm-clarity-n8n-webhook';

/** Outcome of one mirror attempt, stored on the NotificationRecord. */
export type N8nDeliveryStatus = 'not-configured' | 'pending' | 'sent' | 'failed';

export interface N8nMilestonePayload {
  event: string;
  reference: string;
  phone: string;
  language: string;
  channels: string[];
  message: string;
  journeyType: string;
  sentAt: string;
}

export function getN8nWebhookUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(N8N_WEBHOOK_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setN8nWebhookUrl(url: string): void {
  try {
    if (url) window.localStorage.setItem(N8N_WEBHOOK_STORAGE_KEY, url);
    else window.localStorage.removeItem(N8N_WEBHOOK_STORAGE_KEY);
  } catch {
    /* storage blocked — the in-memory value still works for this session */
  }
}

/** Shared POST body for milestones and the manual test ping. */
function postJson(url: string, payload: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * POSTs the milestone to the configured n8n webhook. Fire-and-forget by design:
 * a missing or dead webhook must never delay or break the applicant flow.
 * Resolves to the delivery outcome so the caller can record it on the message.
 */
export async function notifyN8n(payload: N8nMilestonePayload): Promise<N8nDeliveryStatus> {
  const url = getN8nWebhookUrl();
  if (!url) return 'not-configured';
  try {
    const response = await postJson(url, payload);
    return response.ok ? 'sent' : 'failed';
  } catch {
    /* offline / blocked / misconfigured — the demo keeps running */
    return 'failed';
  }
}

/**
 * Sends a sample `application_received` milestone so the judge can prove the
 * wiring without waiting for the next real milestone. Unlike notifyN8n this
 * resolves with `{ ok, detail }` so the UI can show an explicit result.
 */
export async function testN8nWebhook(url: string): Promise<{ ok: boolean; detail: string }> {
  if (!url) return { ok: false, detail: 'No webhook URL entered.' };
  try {
    const response = await postJson(url, {
      event: 'test',
      reference: 'PL-TEST0001',
      phone: '0000000000',
      language: 'en',
      channels: ['sms', 'whatsapp'],
      message: 'Test ping from the Paytm AI Clarity Layer demo — if you can read this in n8n, the workflow trigger works.',
      journeyType: 'loan',
      sentAt: new Date().toISOString(),
    });
    return response.ok
      ? { ok: true, detail: `Webhook replied ${response.status}` }
      : { ok: false, detail: `Webhook replied ${response.status}` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'network error';
    return { ok: false, detail: reason };
  }
}
