# Paytm AI Clarity Layer

A unified clarity layer over Paytm's Loan and Insurance journeys. It translates the moments
where applicants silently drop off into plain language — and now stays with them all the way
past submission:

1. **OTP login, Paytm-style** — phone number in, one-time password out (delivered as *both* an
   SMS and a WhatsApp message, visible in-app). The number doubles as the destination for every
   later update.
2. **Eligibility, explained like a human would** — a weighted verdict that names every criterion
   you clear, every one you miss, and the exact change that would flip the outcome.
3. **Document feedback before submission** — every upload is reviewed instantly and the specific
   flaw (blur, name mismatch, stale statement, wrong document in the slot) is explained with a
   concrete fix.
4. **SMS + WhatsApp milestones, in your language** — application received → documents verified →
   approved → finalised, each milestone rendered as a real message in **English, हिंदी or ಕನ್ನಡ**,
   in a phone-style feed on the dashboard. Language toggle sits in every header.
5. **A real-time status assistant** — answers from your live application file: where it stands,
   what is pending, what it costs, when to expect movement, **how to repay, what happens if you
   miss a month, what the policy covers, and how to become more eligible if your score came out
   low.** Free-text typing is the primary interaction; one-tap suggestions back it up.
6. **A downloadable PDF statement** — one document with six sections: application summary,
   eligibility verdict, documents verified, exact costs (EMI/premium maths), **how the loan or
   insurance works** (repayment rules, missed-payment policy, claims, eligibility levers), and
   every notification sent. Generated on-device with jsPDF.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173). No API keys, no accounts, no network calls —
everything is simulated in the browser.

**Demo OTP:** `246810` (any valid 10-digit number works).

Other scripts: `npm run build` (typecheck + production build), `npm run preview`, `npm run lint`.

## A 4-minute demo script

| Step | What to do | What to point out |
| --- | --- | --- |
| 1 | Land on the login screen, switch the header language to **हिंदी**, enter any 10-digit number, request the OTP | The language toggle on the very first screen; the OTP arrives as an SMS *and* WhatsApp message in the feed below |
| 2 | Enter OTP **246810** | Session established; the number is now the delivery target for all milestones |
| 3 | Click **Start personal loan**, pick the **Rahul Sharma** persona, **Check my eligibility** | Narrated reasoning, then the verdict screen with per-criterion comparisons and *"How we reached 100%"* |
| 4 | **Continue to documents** → **Demo: add all samples** → **Submit application** | Four documents reviewed one-by-one with real verdicts; submit is blocked until required docs pass |
| 5 | On the dashboard, watch the stage tracker — then click **Advance stage now** three times | Each milestone fires an **SMS + WhatsApp** message into the feed — received → verified → approved (with the real EMI) → finalised |
| 6 | Open the assistant and type free-text: *"what happens if I miss one month repayment?"* | The day-by-day answer: reminder, ₹500+GST late fee, CIBIL impact at day 30, recovery, the catch-up path |
| 7 | Then ask *"how can I become more eligible?"* and *"what does the policy cover?"* | The improve answer **re-runs the eligibility engine** on a corrected profile and reports the projected score |
| 8 | Click **Download PDF statement** | Six-section PDF: summary, verdict, verified documents, exact EMI/premium maths, **how the loan works**, and the notification log |
| 9 | Open **⚙ settings** on the notification feed, paste an n8n webhook URL | Every milestone mirrors to n8n → Slack/Sheets/real WhatsApp send (see `docs/n8n-clarity-workflow.json`) |

> **Sample files:** you do not need a real PAN card PDF. Every upload slot offers
> *Use a sample file* (a clean, applicant-named file) and *Show a problem* (a deliberately flawed one).
> They are real `File` objects pushed through the same review pipeline as a genuine upload.

## How the "AI" actually works

No external model is called. Each capability is a deterministic engine that reasons over real data,
which is what makes the demo reliable and the output explainable.

- **Eligibility** (`src/features/eligibility/engine.ts`) scores six weighted underwriting criteria per
  journey with **partial credit for near misses**, applies a penalty for heavyweight failures, then
  picks between `Eligible / Conditionally Eligible / Not Eligible` using both the score *and* which
  criteria failed. That is why declared diabetes (weight 0.1) stays *Eligible* at 95% while a weak
  CIBIL (weight 0.25) drops the same profile to *Conditionally Eligible*.
- **Documents** (`src/features/documents/validator.ts`) runs seven named checks — format, size,
  right-document-for-the-slot, legibility, name match, recency, statement period. Verdicts are derived
  from signals it can point at in the file name, size and MIME type, hashed per file, so the same
  upload always produces the same feedback.
- **Status assistant** (`src/features/chat/engine.ts`) classifies intent with **weighted, scored**
  pattern matching across **12 intents** (now including repayment, missed-payment and policy
  explainer), so overlapping questions ("how do I repay", "what if I miss a month", "what does the
  policy cover") resolve correctly. Answers are composed from the live application: the stage is
  *derived* from document state, EMIs use the amortisation formula, premiums use an age-band table
  with condition loading, timelines are real business days, and "how can I become more eligible?"
  **re-runs the eligibility engine** on a corrected profile to report the score and verdict it would
  produce.
- **Notifications** (`src/features/notifications/engine.ts`) renders every milestone as a real
  SMS + WhatsApp message **in the applicant's language** (English/Hindi/Kannada templates), with the
  EMI or premium figures computed from the live application — then mirrors it to n8n when a webhook
  is configured. The dashboard's phone-style feed shows exactly what would land on the applicant's
  device.
- **PDF statement** (`src/features/statement/pdfGenerator.ts`) builds the six-section statement
  entirely on-device with jsPDF — no server, works offline, section titles follow the active
  language.

Every simulated delay (700–2500 ms) exists so the reasoning is visibly *taking a moment* rather than
snapping to a canned answer.

## Project structure

```
src/
├── features/
│   ├── eligibility/      engine.ts (rules + scoring)          components/EligibilityForm, EligibilityResult
│   ├── documents/        validator.ts (checks + samples)      components/DocumentUpload, DocumentList,
│   │                                                          DocumentStatusList, UploadedDocumentCard
│   ├── chat/             engine.ts (12-intent classifier)     components/ChatWindow
│   ├── notifications/    engine.ts (SMS/WhatsApp templates),  components/NotificationFeed
│   │                     n8n.ts (webhook mirror), LifecycleRunner.tsx (milestone clock)
│   └── statement/        pdfGenerator.ts (6-section jsPDF statement)
├── shared/
│   ├── components/       Button, Input, Select, Card, Badge, Modal, Spinner, RichText, ErrorBoundary,
│   │                     LanguageToggle
│   ├── i18n/             translations.ts (full EN/हिंदी/ಕನ್ನಡ dictionaries), I18nProvider
│   ├── hooks/            useAIThinking (narrates simulated reasoning)
│   ├── types/            common.ts (journey, applicant, document, chat, notification types)
│   └── utils/            constants.ts (journeys, documents, personas, rate tables), formatters.ts, cn.ts
├── pages/                AuthGate (OTP login), Landing, Wizard (3 steps), Dashboard (4 panels)
├── contexts/             AppContext.tsx (reducer + localStorage persistence with date revival)
└── App.tsx               I18nProvider → AppProvider → Router wrapped in AuthGate
docs/
├── design-spec.md              The original product spec this MVP was built against
├── n8n-clarity-workflow.json   Importable n8n workflow (webhook → Slack + Sheets + WhatsApp send)
└── COGNEE_N8N_INTEGRATION.md   How to claim and wire both sponsor credits into the project
```

## Design notes

- **State + routing**: the router owns "which screen", the reducer owns application data. Progress is
  persisted to `localStorage` (with `Date` revival on load) so a mid-demo refresh never loses work.
  The OTP session and the notification feed survive a reset of the application — logging out is not
  the same as wiping the phone's messages.
- **AI transparency**: assistant replies show the classified intent and matched terms, and document
  cards expose every check performed. Judges probing "is this just if/else?" can see the actual inputs.
- **Accessibility basics**: labelled inputs with `aria-invalid`/`aria-describedby`, `aria-expanded` on
  disclosures, semantic lists, and visible focus rings on every interactive element.

## Sponsor integrations

- **Cognee** (code `HACKBRIVEN2`) — add conversational memory to the assistant. See
  `docs/COGNEE_N8N_INTEGRATION.md` for the three integration points and the boundary that keeps the
  demo safe (memory adds context; the deterministic engines keep the numbers).
- **n8n** — import `docs/n8n-clarity-workflow.json`, paste the webhook URL into the notification
  settings, and every milestone mirrors to Slack + Google Sheets + a real WhatsApp Business send.

## Out of scope (v1)

No backend, no real OTP gateway, no real OCR, and no automated test suite — verification was manual
through the demo flow above. The n8n and Cognee integrations are wired and documented but optional:
the product runs fully offline without them.
