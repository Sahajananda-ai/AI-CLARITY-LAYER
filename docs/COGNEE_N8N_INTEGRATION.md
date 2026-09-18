# Cognee + n8n integration guide

Both hackathon sponsors offer credits for this project. This is how each one plugs in, and where each one makes the demo *stronger* rather than just decorated.

---

## Cognee — persistent memory for the assistant (`HACKBRIVEN2`)

**Claim:** [platform.cognee.ai/billing](https://platform.cognee.ai/billing) → sign in → Billing → redeem code → enter `HACKBRIVEN2` → Claim.

### Why it matters for this project

The assistant is currently **stateless between sessions**: it re-derives everything from the localStorage application file on every question. That is honest and explainable, but it forgets the *conversation* the moment the applicant closes the tab. Cognee fixes exactly that, and gives the demo a line no judge has heard before:

> *"The assistant remembers that last Tuesday you told it you lost your job — and it has already adjusted the advice it gives today."*

### The three integration points, in order of demo value

**1. Conversation memory (smallest change, best story)**
After each chat turn, `add()` the user message + composed answer, tagged with the application reference. Before composing a reply, `search()` the reference and pass the top memories as context. Concretely:

```ts
// features/chat/engine.ts — inside generateChatResponse, before classifyIntent
const memories = await cognee.search({
  query: message,
  filter: { applicationRef: reference },
  limit: 3,
});
// memories become a new `history` field on ChatContext; the response builders
// prepend a line like "Earlier you asked about X — here is what changed since."
```

**2. Applicant statements as first-class facts**
When an applicant says something durable ("I get paid weekly", "I have a CIBIL dispute open"), `cognify()` it into the knowledge graph. The eligibility explainer can then *cite* it: "You told us on 12 Sep that your dispute is open — that typically resolves in 30 days, which is why your conditional verdict is worth re-checking then."

**3. Document feedback learning**
Every document verdict already carries named signals (`blur`, `whatsapp-forwarded`, `stale`). Pushing those verdicts into Cognee lets the assistant answer "why do my documents keep failing?" from accumulated history instead of only the latest upload.

### Boundary that keeps the demo safe

The deterministic engines stay the source of truth for *numbers* (EMI, verdicts, timelines). Cognee adds **memory and continuity**, not arithmetic. If the network drops mid-demo, the engines still answer — the Cognee calls are wrapped in try/catch and degrade to today's behaviour. Never let the sponsored dependency sit on the critical path.

---

## n8n — the automation spine

n8n is the answer to the question every fintech judge asks: *"nice demo, but what happens after the demo?"* The app already fires a milestone webhook on every OTP, application-received, documents-verified, approved and finalised event (see `src/features/notifications/n8n.ts`). Drop a webhook URL into **Dashboard → SMS & WhatsApp updates → ⚙ settings → n8n webhook URL** and every milestone is mirrored out.

### The bundled workflow

`docs/n8n-clarity-workflow.json` imports directly (n8n → Workflows → Import from file):

1. **Webhook** `POST /paytm-clarity` — receives the milestone payload.
2. **Switch** — routes `approved` / `finalized` to the ops path, everything else falls through.
3. **Slack** — posts "🎉 PL-82431706 approved, message sent to +91…" to `#loan-ops` (ops visibility that a real Paytm team would need on day one).
4. **Google Sheets** — appends one audit row per milestone (timestamp, reference, phone, event, language, message).
5. **WhatsApp Business send** — the production path that delivers the *exact message the demo rendered*, via the real WhatsApp Business API. This is the strongest line in the presentation: the demo feed is not a mock-up, it is a preview of a real delivery.

### The 60-second judge script

> "Every milestone you see in this feed is simultaneously mirrored to n8n — here is the Slack alert, here is the audit sheet, and here is the real WhatsApp send. The clarity layer is not a screen; it is a pipeline."

### Cognee × n8n combined (the winning move)

One more n8n branch closes the loop between the two sponsors: on `documents_verified`, an n8n **HTTP Request** node calls Cognee's `cognify` endpoint with the document signals. The assistant's next answer can then draw on weeks of accumulated signals ("your last three uploads were WhatsApp forwards — here is the shooting checklist"). Judges see *one system*: browser clarity layer → n8n automation → Cognee memory → back into the assistant.

### Where to point the webhook in a live demo

- **n8n Cloud trial:** create a workflow with a Webhook node, copy the production URL into the settings panel. No auth headers needed — the payload is non-sensitive demo data.
- **Local n8n:** `npx n8n` → webhook URL `http://localhost:5678/webhook/paytm-clarity`. The browser app calls it directly (CORS is open for local webhooks).
- **No n8n at all:** everything works exactly as before; `notifyN8n()` is a no-op without a URL. Zero risk to the live demo.
