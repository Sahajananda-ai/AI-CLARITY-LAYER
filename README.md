# Paytm AI Clarity Layer

A unified clarity layer over Paytm's Loan and Insurance journeys. It translates the three moments
where applicants silently drop off into plain language:

1. **Eligibility, explained like a human would** — a weighted verdict that names every criterion you
   clear, every one you miss, and the exact change that would flip the outcome.
2. **Document feedback before submission** — every upload is reviewed instantly and the specific flaw
   (blur, name mismatch, stale statement, wrong document in the slot) is explained with a concrete fix.
3. **A real-time status assistant** — a conversational assistant that answers from your live
   application file: where it stands, what is pending, what it costs, when to expect movement.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173). No API keys, no accounts, no network calls —
everything is simulated in the browser.

Other scripts: `npm run build` (typecheck + production build), `npm run preview`, `npm run lint`.

## A 3-minute demo script

| Step | What to do | What to point out |
| --- | --- | --- |
| 1 | Land on the home page, click **Start personal loan** | Journey switcher; both journeys share one clarity layer |
| 2 | Click the **Rahul Sharma** persona, then **Check my eligibility** | Watch the narrated reasoning: *"Scoring 6 underwriting criteria…"* |
| 3 | Read the verdict screen | Score meter with the 50/78 verdict thresholds, per-criterion comparisons (`₹18.0 L vs ₹1.5 L required`), the generated summary, and *"How we reached 100%"* |
| 4 | Click **Continue to documents**, then **Demo: add all samples** | Four documents reviewed one-by-one with real verdicts |
| 5 | On the PAN card, click **Show me a problem** | A deliberately blurry WhatsApp-forwarded photo: 18% text confidence, the detected signals, and the exact retake instruction |
| 6 | Click **Swap for a clean copy**, then **Submit application** | Submit is blocked while a required document is failing |
| 7 | On the dashboard, ask the assistant: *"Which documents are still pending?"* then *"When will I hear back?"* then *"What would improve my score?"* | Three visibly different, state-derived answers. Each reply shows the classified intent and matched terms |
| 8 | Click **New application → Start term insurance** | Clean journey switch; try **Farhan Qureshi** to see declared diabetes change the price but not the approval |

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
  upload always produces the same feedback. The card lists every check it ran, plus the signals it
  noticed and a text-confidence score.
- **Status assistant** (`src/features/chat/engine.ts`) classifies intent with **weighted, scored**
  pattern matching (not first-match), so overlapping questions resolve correctly. Answers are composed
  from the live application: the stage is *derived* from document state, EMIs use the amortisation
  formula, premiums use an age-band table with condition loading, timelines are real business days, and
  "what would improve my score?" **re-runs the eligibility engine** on a corrected profile to report
  the score and verdict it would produce.

Every simulated delay (700–2500 ms) exists so the reasoning is visibly *taking a moment* rather than
snapping to a canned answer.

## Project structure

```
src/
├── features/
│   ├── eligibility/   engine.ts (rules + scoring)      components/EligibilityForm, EligibilityResult
│   ├── documents/     validator.ts (checks + samples)  components/DocumentUpload, DocumentList,
│   │                                                   DocumentStatusList, UploadedDocumentCard
│   └── chat/          engine.ts (intent + answers)     components/ChatWindow
├── shared/
│   ├── components/    Button, Input, Select, Card, Badge, Modal, Spinner, RichText, ErrorBoundary
│   ├── hooks/         useAIThinking (narrates simulated reasoning)
│   ├── types/         common.ts (journey, applicant, document, chat types)
│   └── utils/         constants.ts (journeys, documents, personas, rate tables), formatters.ts, cn.ts
├── pages/             Landing, Wizard (3 steps), Dashboard (3 panels + live stage tracker)
├── contexts/          AppContext.tsx (reducer + localStorage persistence with date revival)
└── App.tsx            Router inside a global error boundary
docs/design-spec.md    The original product spec this MVP was built against
```

## Design notes

- **State + routing**: the router owns "which screen", the reducer owns application data. Progress is
  persisted to `localStorage` (with `Date` revival on load) so a mid-demo refresh never loses work.
- **AI transparency**: assistant replies show the classified intent and matched terms, and document
  cards expose every check performed. Judges probing "is this just if/else?" can see the actual inputs.
- **Accessibility basics**: labelled inputs with `aria-invalid`/`aria-describedby`, `aria-expanded` on
  disclosures, semantic lists, and visible focus rings on every interactive element.

## Out of scope (v1)

No backend, no authentication, no real OCR, no multi-language support, and no automated test suite —
verification was manual through the demo flow above.
