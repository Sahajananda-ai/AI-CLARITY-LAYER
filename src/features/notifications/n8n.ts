/**
 * n8n integration.
 *
 * When the judge (or a real deployment) drops an n8n webhook URL into
 * localStorage, every application milestone is mirrored to that webhook as a
 * JSON POST — which is exactly the trigger an n8n workflow expects. The bundled
 * workflow (docs/n8n-clarity-workflow.json) receives the payload, can enrich it
 * with Cognee memory, and routes it to Slack/Sheets/anything else.
 *
 * In the sandboxed demo (no URL configured) this is a no-op, so nothing breaks
 * and no network call leaves the page.
 */

export const N8N_WEBHOOK_STORAGE_KEY = 'paytm-clarity-n8n-webhook';

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

/**
 * POSTs the milestone to the configured n8n webhook. Fire-and-forget by design:
 * a missing or dead webhook must never delay or break the applicant flow.
 */
export async function notifyN8n(payload: N8nMilestonePayload): Promise<void> {
  const url = getN8nWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    /* offline / blocked / misconfigured — the demo keeps running */
  }
}
