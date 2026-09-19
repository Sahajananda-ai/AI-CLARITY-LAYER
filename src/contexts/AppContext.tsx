import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type {
  JourneyType,
  Applicant,
  EligibilityResult,
  UploadedDocument,
  ChatMessage,
  BankDetails,
} from '../shared/types/common';
import { DOCUMENT_REQUIREMENTS } from '../shared/utils/constants';
import { getInitialUploadedDocuments } from '../features/documents';
import { createWelcomeMessage } from '../features/chat/engine';
import { onN8nDeliveryStatus } from '../features/notifications/engine';
import type { NotificationRecord, LifecycleStage, Decision } from '../features/notifications/engine';
import type { N8nDeliveryStatus } from '../features/notifications/n8n';

export type WizardStep = 'details' | 'eligibility' | 'documents' | 'bank';

interface AppState {
  journeyType: JourneyType | null;
  applicant: Applicant | null;
  eligibilityResult: EligibilityResult | null;
  uploadedDocuments: UploadedDocument[];
  chatMessages: ChatMessage[];
  submitted: boolean;
  wizardStep: WizardStep;
  /** Authentication: the verified phone number, or null when logged out. */
  phone: string | null;
  notifications: NotificationRecord[];
  /** Post-submit simulation clock: which milestone has fired. */
  lifecycle: LifecycleStage | null;
  lifecycleAdvancedAt: number | null;
  /** The underwriter's outcome — set by the dashboard decision control. */
  decision: Decision | null;
  /** Bank account that receives the disbursal; collected in the new wizard step. */
  bankDetails: BankDetails | null;
  bankVerified: boolean;
  /** Freshly delivered milestones awaiting their popup toast. */
  pendingToastIds: string[];
}

type AppAction =
  | { type: 'SET_JOURNEY'; payload: JourneyType }
  | { type: 'SET_APPLICANT'; payload: Applicant }
  | { type: 'SET_ELIGIBILITY'; payload: EligibilityResult }
  | { type: 'UPDATE_DOCUMENT'; payload: { id: string; updates: Partial<UploadedDocument> } }
  | { type: 'REMOVE_DOCUMENT'; payload: string }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_WIZARD_STEP'; payload: WizardStep }
  | { type: 'SUBMIT_APPLICATION' }
  | { type: 'SET_PHONE'; payload: string | null }
  | { type: 'ADD_NOTIFICATION'; payload: NotificationRecord }
  | { type: 'SET_N8N_STATUS'; payload: { id: string; status: N8nDeliveryStatus } }
  | { type: 'MARK_NOTIFICATIONS_READ' }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'ADVANCE_LIFECYCLE'; payload: LifecycleStage }
  | { type: 'SET_DECISION'; payload: Decision | null }
  | { type: 'SET_BANK_DETAILS'; payload: BankDetails | null }
  | { type: 'SET_BANK_VERIFIED'; payload: boolean }
  | { type: 'CONSUME_TOAST'; payload: string }
  | { type: 'RESET' };

const initialState: AppState = {
  journeyType: null,
  applicant: null,
  eligibilityResult: null,
  uploadedDocuments: [],
  chatMessages: [],
  submitted: false,
  wizardStep: 'details',
  phone: null,
  notifications: [],
  lifecycle: null,
  lifecycleAdvancedAt: null,
  decision: null,
  bankDetails: null,
  bankVerified: false,
  pendingToastIds: [],
};

const STORAGE_KEY = 'paytm-clarity-state-v2';

/**
 * The router is the single source of truth for "which screen am I on" — the
 * reducer only owns application data. (An earlier version mirrored the route in
 * state as `currentView`, which meant journey cards changed data without ever
 * navigating, leaving the demo stuck on the landing page.)
 */
function reviveApplicationState(raw: string): AppState {
  try {
    const parsed = JSON.parse(raw) as Partial<AppState> & { pendingToastIds?: unknown };
    if (!parsed || typeof parsed !== 'object') return initialState;

    return {
      ...initialState,
      ...parsed,
      // JSON turns Date objects into strings, and Intl crashes on those.
      uploadedDocuments: Array.isArray(parsed.uploadedDocuments)
        ? parsed.uploadedDocuments.map(doc => ({
            ...doc,
            uploadedAt: doc.uploadedAt ? new Date(doc.uploadedAt) : new Date(),
          }))
        : [],
      chatMessages: Array.isArray(parsed.chatMessages)
        ? parsed.chatMessages.map(message => ({
            ...message,
            timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
          }))
        : [],
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications.map(notification => ({
            ...notification,
            sentAt: notification.sentAt ? new Date(notification.sentAt) : new Date(),
          }))
        : [],
      wizardStep: parsed.wizardStep ?? 'details',
      // Sessions persisted before the lifecycle clock existed have submitted
      // applications with no stage — seed them so the tracker resumes from
      // "received" instead of falling back to document-derived step 3 forever.
      lifecycle: parsed.submitted ? (parsed.lifecycle ?? 'received') : null,
      lifecycleAdvancedAt: parsed.submitted ? (parsed.lifecycleAdvancedAt ?? Date.now()) : null,
      // Popups are ephemeral: never revive them across a refresh.
      pendingToastIds: [],
      decision: parsed.decision ?? null,
      bankDetails: parsed.bankDetails ?? null,
      bankVerified: parsed.bankVerified ?? false,
    };
  } catch {
    return initialState;
  }
}

function loadInitialState(): AppState {
  if (typeof window === 'undefined') return initialState;
  // v1 sessions predate bank details / decisions; starting fresh avoids a
  // half-migrated shape breaking the new wizard step.
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem('paytm-clarity-state-v1');
  if (raw && !window.localStorage.getItem(STORAGE_KEY)) {
    try {
      window.localStorage.setItem(STORAGE_KEY, raw);
    } catch {
      /* ignore */
    }
  }
  return raw ? reviveApplicationState(raw) : initialState;
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_JOURNEY':
      return {
        ...initialState,
        // The login session survives starting a new application.
        phone: state.phone,
        notifications: state.notifications,
        journeyType: action.payload,
        uploadedDocuments: getInitialUploadedDocuments(DOCUMENT_REQUIREMENTS[action.payload]),
        wizardStep: 'details',
      };
    case 'SET_APPLICANT':
      // Storing the applicant must not advance the step on its own: the
      // explanation screen only makes sense once a result exists.
      return { ...state, applicant: action.payload };
    case 'SET_ELIGIBILITY':
      // Land on the explanation, never on the upload screen. Advancing straight
      // to documents hid the verdict, the criteria breakdown and the suggestions
      // — the entire reason this layer exists.
      return { ...state, eligibilityResult: action.payload, wizardStep: 'eligibility' };
    case 'UPDATE_DOCUMENT':
      return {
        ...state,
        uploadedDocuments: state.uploadedDocuments.map(doc =>
          doc.id === action.payload.id ? { ...doc, ...action.payload.updates } : doc
        ),
      };
    case 'REMOVE_DOCUMENT':
      return {
        ...state,
        uploadedDocuments: state.uploadedDocuments.map(doc =>
          doc.id === action.payload
            ? {
                ...doc,
                fileName: '',
                fileSize: 0,
                fileType: '',
                status: 'pending',
                feedback: undefined,
                fixAction: undefined,
                summary: undefined,
                confidence: undefined,
                checks: undefined,
                signals: undefined,
              }
            : doc
        ),
      };
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.payload] };
    case 'SET_WIZARD_STEP':
      return { ...state, wizardStep: action.payload };
    case 'SUBMIT_APPLICATION': {
      // Seed the assistant's greeting here rather than in an effect, so the
      // transcript exists the moment the applicant lands on the dashboard.
      const chatMessages =
        state.chatMessages.length === 0 && state.journeyType && state.applicant
          ? [createWelcomeMessage(state.journeyType, state.applicant)]
          : state.chatMessages;
      return { ...state, submitted: true, chatMessages };
    }
    case 'SET_PHONE':
      return { ...state, phone: action.payload };
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
        // Every new message pops up as a toast (the demo's "SMS lands on your
        // phone" moment), except the OTP which already has its own screen hint.
        pendingToastIds:
          action.payload.kind === 'otp' ? state.pendingToastIds : [...state.pendingToastIds, action.payload.id],
      };
    case 'SET_N8N_STATUS':
      return {
        ...state,
        notifications: state.notifications.map(notification =>
          notification.id === action.payload.id
            ? { ...notification, n8nStatus: action.payload.status }
            : notification
        ),
      };
    case 'MARK_NOTIFICATIONS_READ':
      return {
        ...state,
        notifications: state.notifications.map(notification => ({ ...notification, read: true })),
      };
    case 'CLEAR_NOTIFICATIONS':
      return { ...state, notifications: [], pendingToastIds: [] };
    case 'ADVANCE_LIFECYCLE':
      // Both the stage and the timestamp move together: the runner re-arms its
      // timer from the new timestamp, and the dashboard derives the tracker
      // position from the stage.
      return { ...state, lifecycle: action.payload, lifecycleAdvancedAt: Date.now() };
    case 'SET_DECISION':
      return { ...state, decision: action.payload };
    case 'SET_BANK_DETAILS':
      return { ...state, bankDetails: action.payload };
    case 'SET_BANK_VERIFIED':
      return { ...state, bankVerified: action.payload };
    case 'CONSUME_TOAST':
      return { ...state, pendingToastIds: state.pendingToastIds.filter(id => id !== action.payload) };
    case 'RESET':
      return {
        ...initialState,
        // Keep the session and the notification history: logging out is not
        // the same as wiping the phone's message feed.
        phone: state.phone,
        notifications: state.notifications,
      };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  actions: {
    setJourney: (type: JourneyType) => void;
    setApplicant: (applicant: Applicant) => void;
    setEligibility: (result: EligibilityResult) => void;
    updateDocument: (id: string, updates: Partial<UploadedDocument>) => void;
    removeDocument: (id: string) => void;
    addChatMessage: (message: ChatMessage) => void;
    setWizardStep: (step: WizardStep) => void;
    submitApplication: () => void;
    setPhone: (phone: string | null) => void;
    addNotification: (record: NotificationRecord) => void;
    setN8nStatus: (id: string, status: N8nDeliveryStatus) => void;
    markNotificationsRead: () => void;
    clearNotifications: () => void;
    advanceLifecycle: (stage: LifecycleStage) => void;
    setDecision: (decision: Decision | null) => void;
    setBankDetails: (details: BankDetails | null) => void;
    setBankVerified: (verified: boolean) => void;
    consumeToast: (id: string) => void;
    reset: () => void;
  };
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  // Persist so a refresh (or an accidental reload mid-demo) never loses progress.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — the app still works in memory */
    }
  }, [state]);

  // Record the outcome of each n8n webhook mirror so the feed can show a real
  // delivery chip (queued → delivered ✓ / n8n failed) per message.
  useEffect(() => {
    return onN8nDeliveryStatus((id, status) =>
      dispatch({ type: 'SET_N8N_STATUS', payload: { id, status } })
    );
  }, []);

  const actions = useMemo(
    () => ({
      setJourney: (journeyType: JourneyType) => dispatch({ type: 'SET_JOURNEY', payload: journeyType }),
      setApplicant: (applicant: Applicant) => dispatch({ type: 'SET_APPLICANT', payload: applicant }),
      setEligibility: (result: EligibilityResult) => dispatch({ type: 'SET_ELIGIBILITY', payload: result }),
      updateDocument: (id: string, updates: Partial<UploadedDocument>) =>
        dispatch({ type: 'UPDATE_DOCUMENT', payload: { id, updates } }),
      removeDocument: (id: string) => dispatch({ type: 'REMOVE_DOCUMENT', payload: id }),
      addChatMessage: (message: ChatMessage) => dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message }),
      setWizardStep: (step: WizardStep) => dispatch({ type: 'SET_WIZARD_STEP', payload: step }),
      submitApplication: () => dispatch({ type: 'SUBMIT_APPLICATION' }),
      setPhone: (phone: string | null) => dispatch({ type: 'SET_PHONE', payload: phone }),
      addNotification: (record: NotificationRecord) => dispatch({ type: 'ADD_NOTIFICATION', payload: record }),
      setN8nStatus: (id: string, status: N8nDeliveryStatus) =>
        dispatch({ type: 'SET_N8N_STATUS', payload: { id, status } }),
      markNotificationsRead: () => dispatch({ type: 'MARK_NOTIFICATIONS_READ' }),
      clearNotifications: () => dispatch({ type: 'CLEAR_NOTIFICATIONS' }),
      advanceLifecycle: (stage: LifecycleStage) => dispatch({ type: 'ADVANCE_LIFECYCLE', payload: stage }),
      setDecision: (decision: Decision | null) => dispatch({ type: 'SET_DECISION', payload: decision }),
      setBankDetails: (details: BankDetails | null) => dispatch({ type: 'SET_BANK_DETAILS', payload: details }),
      setBankVerified: (verified: boolean) => dispatch({ type: 'SET_BANK_VERIFIED', payload: verified }),
      consumeToast: (id: string) => dispatch({ type: 'CONSUME_TOAST', payload: id }),
      reset: () => {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* nothing to clear */
        }
        dispatch({ type: 'RESET' });
      },
    }),
    []
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// The provider and its hook are intentionally colocated: every consumer imports
// both from one place, and this file has nothing else to fast-refresh.
// eslint-disable-next-line react/only-export-components
export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
