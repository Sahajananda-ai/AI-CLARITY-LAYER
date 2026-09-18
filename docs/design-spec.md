# Paytm AI Clarity Layer & Status Tracker - Design Spec

## Project Overview
MVP for Paytm's "AI-Powered Financial Journeys" hackathon. A unified interface that sits on top of Loan and Insurance journeys, translating confusing moments into plain language using simulated AI at three points: eligibility explanation, document feedback, and real-time status chat.

## Tech Stack
- **Framework:** React 18 + Vite + TypeScript
- **Styling:** Tailwind CSS
- **State Management:** React Context + useReducer (lightweight, no external deps)
- **Routing:** React Router v6
- **Build:** `npm run dev` for development, `npm run build` for production

## File Structure
```
src/
├── features/
│   ├── eligibility/
│   │   ├── components/     # EligibilityForm, EligibilityResult, CriteriaCard
│   │   ├── engine.ts       # Rule-based eligibility evaluation
│   │   ├── types.ts        # Applicant, Criteria, EligibilityResult types
│   │   └── index.ts
│   ├── documents/
│   │   ├── components/     # DocumentUpload, DocumentList, FeedbackCard
│   │   ├── validator.ts    # File validation + AI feedback simulation
│   │   ├── types.ts        # Document, ValidationResult types
│   │   └── index.ts
│   └── chat/
│       ├── components/     # ChatWindow, MessageBubble, TypingIndicator
│       ├── engine.ts       # Intent classification + response generation
│       ├── types.ts        # Message, Intent, ChatState types
│       └── index.ts
├── shared/
│   ├── components/         # Button, Input, Select, Card, Modal, Badge, Spinner
│   ├── hooks/
│   │   ├── useSimulatedAI.ts      # Simulated delay + response generation
│   │   ├── useLocalStorage.ts     # Persist demo state
│   │   └── useWizard.ts           # Wizard step management
│   ├── utils/
│   │   ├── formatters.ts   # Currency, dates, percentages
│   │   └── constants.ts    # Journey configs, document requirements
│   └── types/
│       └── common.ts       # JourneyType, ApplicantBase, etc.
├── pages/
│   ├── Landing.tsx         # Journey selection (Loan vs Insurance)
│   ├── Wizard.tsx          # 3-step progressive flow
│   └── Dashboard.tsx       # Three-panel view after submission
├── contexts/
│   └── AppContext.tsx      # Global state: journey, applicant, documents, chat
├── App.tsx                 # Router + providers
├── main.tsx                # Entry point
└── index.css               # Tailwind imports + global styles
```

## User Flow

### 1. Landing Page
- Hero with Paytm-style branding
- Two journey cards: "Personal Loan" and "Insurance"
- Click → stores journey type → navigates to Wizard Step 1

### 2. Wizard - Step 1: Applicant Details
- Form with fields based on journey type:
  - **Loan:** Age, Annual Income, Employment Type, Existing EMIs, Credit Score, Loan Amount, Tenure
  - **Insurance:** Age, Annual Income, Employment Type, Coverage Amount, Policy Term, Pre-existing Conditions
- Pre-filled persona buttons (Salaried Professional, Self-Employed, Low Credit Score, High Income)
- "Check Eligibility" button → simulates AI → navigates to Step 2

### 3. Wizard - Step 2: Eligibility Explanation
- Overall verdict badge (Eligible / Conditionally Eligible / Not Eligible)
- Criteria breakdown: each criterion shows Pass/Fail with plain-English reason
- "Why this matters" expandable for each failed criterion
- Actionable suggestions: "Increase income by ₹X" or "Reduce EMIs by ₹Y"
- "Continue to Documents" button

### 4. Wizard - Step 3: Document Upload & Feedback
- Required document list per journey (PAN, Aadhaar, Salary Slips, Bank Statements, etc.)
- Drag-and-drop / click upload per document
- Instant validation: file type, size, name matching, expiry check
- AI feedback card per document: status + specific issue + fix instruction
- "Submit Application" button (enabled when all required docs pass)

### 5. Dashboard (Three Panels)
- **Left Panel:** Eligibility Summary - verdict + key criteria + suggestions
- **Center Panel:** Document Status - list with status badges, re-upload option
- **Right Panel:** Status Chat Assistant - SMS/WhatsApp style conversation
  - Pre-seeded with application context
  - Handles intents: status, documents, timeline, general
  - Simulated typing indicator + contextual responses

## AI Simulation Design

### Eligibility Engine (`features/eligibility/engine.ts`)
- Evaluates 6-8 criteria per journey with weighted scoring
- Returns: `verdict`, `score`, `criteria[]`, `suggestions[]`
- Criteria example: `{ id: 'income', label: 'Minimum Income', passed: true, reason: '₹12L exceeds ₹6L minimum', weight: 0.25 }`
- Deterministic but feels reasoned - explains WHY each passed/failed

### Document Validator (`features/documents/validator.ts`)
- Checks: MIME type, file size (<5MB), filename contains applicant name, expiry date (if applicable)
- Feedback templates per failure type:
  - Blurry/Unreadable: "Text detection confidence low. Retake in good lighting."
  - Name Mismatch: "Name 'R. Sharma' doesn't match applicant 'Rahul Sharma'."
  - Expired: "Document expired 12 Jan 2024. Upload renewed version."
- Returns: `{ documentId, status: 'pass'|'fail'|'warning', feedback, fixAction }`

### Chat Engine (`features/chat/engine.ts`)
- Intent classification via keyword matching:
  - `status` → "Your loan is at 'Verification' stage. Documents under review."
  - `documents` → "PAN & Aadhaar verified. Salary slips pending."
  - `timeline` → "Typically 2-3 business days from now."
  - `general` → Contextual fallback
- Response templates with variable injection (applicant name, stage, dates)
- Simulated typing delay: 800-2500ms

## Visual Design System

### Colors
- Primary: `#2563EB` (Blue 600)
- Success: `#16A34A` (Green 600)
- Warning: `#F59E0B` (Amber 500)
- Error: `#DC2626` (Red 600)
- Background: `#F8FAFC` (Slate 50)
- Surface: `#FFFFFF` (White)
- Text Primary: `#0F172A` (Slate 900)
- Text Secondary: `#475569` (Slate 600)
- Border: `#E2E8F0` (Slate 200)

### Typography
- Font: Inter (via Google Fonts)
- Scale: xs(12px), sm(14px), base(16px), lg(18px), xl(20px), 2xl(24px), 3xl(30px)
- Weight: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

### Spacing & Layout
- Base unit: 4px (Tailwind default)
- Card radius: 12px (rounded-xl)
- Shadow: `0 1px 3px rgba(0,0,0,0.1)` (shadow-sm), `0 4px 6px rgba(0,0,0,0.1)` (shadow-md)
- Container max-width: 1200px
- Mobile-first breakpoints: 375px, 768px, 1024px, 1440px

### Components
- **Button:** Primary, Secondary, Ghost, Danger variants; loading state with spinner
- **Input:** Label, error state, helper text, icon support
- **Select:** Native select styled consistently
- **Card:** Surface background, border, padding variants
- **Badge:** Status indicators (success, warning, error, info, neutral)
- **Modal:** Overlay, centered, focus trap, ESC to close
- **Spinner:** Animated, multiple sizes

## Demo Data (Pre-filled Personas)

### Loan Personas
1. **Salaried Professional** - Age 28, ₹18L income, Salaried, ₹15k EMIs, 780 credit, ₹10L loan, 60mo
2. **Self-Employed** - Age 35, ₹25L income, Self-Employed, ₹0 EMIs, 720 credit, ₹15L loan, 84mo
3. **Low Credit Score** - Age 30, ₹12L income, Salaried, ₹8k EMIs, 580 credit, ₹5L loan, 48mo
4. **High Income** - Age 40, ₹50L income, Salaried, ₹50k EMIs, 800 credit, ₹40L loan, 120mo

### Insurance Personas
1. **Young Professional** - Age 26, ₹15L income, Salaried, ₹1Cr cover, 20yr term, No conditions
2. **Family Breadwinner** - Age 38, ₹35L income, Salaried, ₹2Cr cover, 25yr term, No conditions
3. **Pre-existing Condition** - Age 45, ₹28L income, Self-Employed, ₹1.5Cr cover, 15yr term, Diabetes
4. **Senior Applicant** - Age 55, ₹20L income, Salaried, ₹50L cover, 10yr term, Hypertension

## Error Handling
- Form validation: inline errors, prevent submission until valid
- File upload: client-side validation before simulated AI
- Chat: graceful fallback for unrecognized intents
- Global error boundary for React errors
- No console errors during demo flow

## Performance & Reliability
- All AI simulated client-side - zero network dependencies
- LocalStorage persistence for demo continuity
- Code splitting: lazy load Dashboard, Chat
- Bundle size target: <200KB gzipped
- Works offline after initial load

## Acceptance Criteria for Demo
- [ ] Judge can run `npm install && npm run dev` and have app running in <60 seconds
- [ ] Switch between Loan/Insurance journeys cleanly
- [ ] Enter details → get reasoned eligibility explanation (not just true/false)
- [ ] Upload document → get specific AI feedback with fix action
- [ ] Chat with status bot → get contextual answers for status/documents/timeline
- [ ] UI feels polished: consistent design, responsive, no dead ends, no console errors
- [ ] Pre-filled personas work for quick demo
- [ ] Works on mobile viewport (375px)

## Out of Scope (v1)
- Real backend/API integration
- Actual OCR/document parsing
- User authentication
- Multi-language support
- Accessibility audit (basic semantic HTML only)
- Automated tests (manual demo verification only)