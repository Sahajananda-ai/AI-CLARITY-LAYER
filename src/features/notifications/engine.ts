import type { Applicant, JourneyType } from '../../shared/types/common';
import { JOURNEY_CONFIG } from '../../shared/utils/constants';
import { formatCurrency } from '../../shared/utils/formatters';
import { calculateEmi, estimateAnnualPremium } from '../eligibility/engine';
import type { LanguageCode, TranslationDict } from '../../shared/i18n';
import { notifyN8n, getN8nWebhookUrl, type N8nDeliveryStatus } from './n8n';

/**
 * Notification engine.
 *
 * Every milestone in the application lifecycle fans out an SMS + WhatsApp
 * message in the applicant's chosen language. Delivery is simulated (this is a
 * browser demo — no gateway) but the message content is real: EMI/premium
 * figures are computed from the live application, and the templates are the
 * same ones a real gateway integration would render. A parallel fire-and-forget
 * POST mirrors each milestone to n8n when the webhook URL is configured.
 */

export type NotificationChannel = 'sms' | 'whatsapp' | 'both';

export type NotificationKind =
  | 'otp'
  | 'application_received'
  | 'eligibility_passed'
  | 'document_issue'
  | 'documents_verified'
  | 'under_review'
  | 'approved'
  | 'finalized'
  | 'rejected';

export interface NotificationRecord {
  id: string;
  kind: NotificationKind;
  /** Human title for the feed, always shown in the active language. */
  title: string;
  /** The rendered message body as it would land on the phone. */
  body: string;
  channels: NotificationChannel;
  phone: string;
  language: LanguageCode;
  sentAt: Date;
  read: boolean;
  /** Outcome of the mirror to the n8n webhook (visible as a chip in the feed). */
  n8nStatus: N8nDeliveryStatus;
}

export type LifecycleStage = 'received' | 'verified' | 'review' | 'approved' | 'finalized' | 'rejected';

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  received: 'Application Received',
  verified: 'Document Verification',
  review: 'Under Review',
  approved: 'Final Approval',
  finalized: 'Disbursement / Policy Issuance',
  rejected: 'Application Rejected',
};

/** The outcome chosen by the underwriter on the dashboard. */
export type Decision = 'approved' | 'rejected';

interface NotificationContext {
  journeyType: JourneyType;
  applicant: Applicant;
  reference: string;
  language: LanguageCode;
  dict: TranslationDict;
  phone: string;
  /** Weighted score, for the eligibility milestone. */
  eligibilityScore?: number;
  /** How many documents have an issue, for the document_issue milestone. */
  documentCount?: number;
  /** Why the underwriter rejected, quoted in the rejected message. */
  rejectionReason?: string;
}

type BodyBuilder = (ctx: NotificationContext) => string;

/** Render the milestone message body. Loan and insurance variants differ. */
const BODIES: Record<NotificationKind, BodyBuilder> = {
  otp: ctx => {
    const { otpSubtitle } = ctx.dict.login;
    return otpSubtitle.replace('{phone}', ctx.phone).replace('{code}', '246810');
  },

  application_received: ctx => {
    const ref = ctx.reference;
    const name = ctx.applicant.fullName.split(' ')[0];
    if (ctx.journeyType === 'loan') {
      const a = ctx.applicant as Extract<Applicant, { loanAmount: number }>;
      return ctx.language === 'hi'
        ? `नमस्ते ${name}! आपका पर्सनल लोन आवेदन ${ref} (${formatCurrency(a.loanAmount)}, ${a.tenureMonths} महीने) प्राप्त हुआ है। दस्तावेज़ सत्यापन शुरू। अपडेट यहीं और WhatsApp पर मिलेंगे। — Paytm`
        : ctx.language === 'kn'
          ? `ನಮಸ್ಕಾರ ${name}! ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ಸಾಲ ಅರ್ಜಿ ${ref} (${formatCurrency(a.loanAmount)}, ${a.tenureMonths} ತಿಂಗಳು) ಸ್ವೀಕೃತವಾಗಿದೆ. ದಸ್ತಾವೇಜು ಪರಿಶೀಲನೆ ಪ್ರಾರಂಭ. ನವೀಕರಣ ಇಲ್ಲಿ ಮತ್ತು ವಾಟ್ಸ್‌ಆಪ್‌ನಲ್ಲಿ. — Paytm`
          : `Hi ${name}! Your personal loan application ${ref} for ${formatCurrency(a.loanAmount)} over ${a.tenureMonths} months has been received. Document verification has started. Updates will arrive here and on WhatsApp. — Paytm`;
    }
    const a = ctx.applicant as Extract<Applicant, { coverageAmount: number }>;
    return ctx.language === 'hi'
      ? `नमस्ते ${name}! आपका टर्म इंश्योरेंस आवेदन ${ref} (${formatCurrency(a.coverageAmount)} कवर, ${a.policyTermYears} वर्ष) प्राप्त हुआ है। अंडरराइटिंग शुरू। अपडेट यहीं और WhatsApp पर मिलेंगे। — Paytm`
      : ctx.language === 'kn'
        ? `ನಮಸ್ಕಾರ ${name}! ನಿಮ್ಮ ಟರ್ಮ್ ವಿಮಾ ಅರ್ಜಿ ${ref} (${formatCurrency(a.coverageAmount)} ಕವರ್, ${a.policyTermYears} ವರ್ಷ) ಸ್ವೀಕೃತವಾಗಿದೆ. ಅಂಡರ್‌ರೈಟಿಂಗ್ ಪ್ರಾರಂಭ. ನವೀಕರಣ ಇಲ್ಲಿ ಮತ್ತು ವಾಟ್ಸ್‌ಆಪ್‌ನಲ್ಲಿ. — Paytm`
        : `Hi ${name}! Your term insurance application ${ref} for ${formatCurrency(a.coverageAmount)} cover over ${a.policyTermYears} years has been received. Underwriting has started. Updates will arrive here and on WhatsApp. — Paytm`;
  },

  documents_verified: ctx =>
    ctx.language === 'hi'
      ? `आवेदन ${ctx.reference}: सभी आवश्यक दस्तावेज़ सत्यापित ✓। अगला चरण: ${ctx.journeyType === 'loan' ? 'क्रेडिट मूल्यांकन' : 'मेडिकल/अंडरराइटिंग'}। PDF विवरण ऐप में उपलब्ध है। — Paytm`
      : ctx.language === 'kn'
        ? `ಅರ್ಜಿ ${ctx.reference}: ಎಲ್ಲಾ ಅಗತ್ಯ ದಸ್ತಾವೇಜುಗಳು ಪರಿಶೀಲಿತ ✓. ಮುಂದಿನ ಹಂತ: ${ctx.journeyType === 'loan' ? 'ಕ್ರೆಡಿಟ್ ಮೌಲ್ಯಮಾಪನ' : 'ಮೆಡಿಕಲ್/ಅಂಡರ್‌ರೈಟಿಂಗ್'}. PDF ಹೇಳಿಕೆ ಆ್ಯಪ್‌ನಲ್ಲಿ ಲಭ್ಯ. — Paytm`
        : `Application ${ctx.reference}: all required documents verified ✓. Next step: ${ctx.journeyType === 'loan' ? 'credit assessment' : 'medical / underwriting'}. Your PDF statement is available in the app. — Paytm`,

  approved: ctx => {
    if (ctx.journeyType === 'loan') {
      const a = ctx.applicant as Extract<Applicant, { loanAmount: number }>;
      const emi = calculateEmi(a.loanAmount, JOURNEY_CONFIG.loan.annualInterestRate, Number(a.tenureMonths));
      return ctx.language === 'hi'
        ? `बधाई ${ctx.applicant.fullName.split(' ')[0]}! आवेदन ${ctx.reference} स्वीकृत ✓। मासिक ईएमआई ≈ ${formatCurrency(emi)} (${a.tenureMonths} महीने)। ई-साइन के बाद 24 घंटे में राशि। — Paytm`
        : ctx.language === 'kn'
          ? `ಅಭಿನಂದನೆಗಳು ${ctx.applicant.fullName.split(' ')[0]}! ಅರ್ಜಿ ${ctx.reference} ಅನುಮೋದಿತ ✓. ಮಾಸಿಕ ಇಎಂಐ ≈ ${formatCurrency(emi)} (${a.tenureMonths} ತಿಂಗಳು). ಇ-ಸೈನ್ ನಂತರ 24 ಗಂಟೆಗಳಲ್ಲಿ ಹಣ. — Paytm`
          : `Congratulations ${ctx.applicant.fullName.split(' ')[0]}! Application ${ctx.reference} approved ✓. Monthly EMI ≈ ${formatCurrency(emi)} for ${a.tenureMonths} months. Funds within 24 hours of e-sign. — Paytm`;
    }
    const a = ctx.applicant as Extract<Applicant, { coverageAmount: number }>;
    const premium = estimateAnnualPremium(
      a.age,
      a.coverageAmount,
      Number(a.policyTermYears),
      (a.preExistingConditions || '').trim().toLowerCase() !== 'none' && a.preExistingConditions.trim() !== '' ? 0.4 : 0
    );
    return ctx.language === 'hi'
      ? `बधाई ${ctx.applicant.fullName.split(' ')[0]}! आवेदन ${ctx.reference} स्वीकृत ✓। वार्षिक प्रीमियम ≈ ${formatCurrency(premium)} (${a.policyTermYears} वर्ष)। पॉलिसी दस्तावेज़ 24 घंटे में। — Paytm`
      : ctx.language === 'kn'
        ? `ಅಭಿನಂದನೆಗಳು ${ctx.applicant.fullName.split(' ')[0]}! ಅರ್ಜಿ ${ctx.reference} ಅನುಮೋದಿತ ✓. ವಾರ್ಷಿಕ ಪ್ರೀಮಿಯಮ್ ≈ ${formatCurrency(premium)} (${a.policyTermYears} ವರ್ಷ). ಪಾಲಿಸಿ ದಸ್ತಾವೇಜು 24 ಗಂಟೆಗಳಲ್ಲಿ. — Paytm`
        : `Congratulations ${ctx.applicant.fullName.split(' ')[0]}! Application ${ctx.reference} approved ✓. Annual premium ≈ ${formatCurrency(premium)} for ${a.policyTermYears} years. Policy document within 24 hours. — Paytm`;
  },

  finalized: ctx =>
    ctx.journeyType === 'loan'
      ? ctx.language === 'hi'
        ? `आवेदन ${ctx.reference} अंतिम ✓। ऋण राशि आपके खाते में जमा हो गई है। पहली ईएमआई अगले महीने की इसी तारीख को। विवरण PDF में। — Paytm`
        : ctx.language === 'kn'
          ? `ಅರ್ಜಿ ${ctx.reference} ಅಂತಿಮ ✓. ಸಾಲ ಮೊತ್ತ ನಿಮ್ಮ ಖಾತೆಗೆ ಜಮಾ ಆಗಿದೆ. ಮೊದಲ ಇಎಂಐ ಮುಂದಿನ ತಿಂಗಳು ಇದೇ ದಿನ. ವಿವರ PDF ನಲ್ಲಿ. — Paytm`
          : `Application ${ctx.reference} finalised ✓. The loan amount has been credited to your account. First EMI is due the same date next month. Full schedule in your PDF statement. — Paytm`
      : ctx.language === 'hi'
        ? `आवेदन ${ctx.reference} अंतिम ✓। पॉलिसी जारी हो गई है — दस्तावेज़ ईमेल और ऐप में। कवर आज से प्रभावी। PDF में पूरी जानकारी। — Paytm`
        : ctx.language === 'kn'
          ? `ಅರ್ಜಿ ${ctx.reference} ಅಂತಿಮ ✓. ಪಾಲಿಸಿ ಜಾರಿಯಾಗಿದೆ — ದಸ್ತಾವೇಜು ಇಮೇಲ್ ಮತ್ತು ಆ್ಯಪ್‌ನಲ್ಲಿ. ಕವರ್ ಇಂದಿನಿಂದ ಜಾರಿ. ವಿವರ PDF ನಲ್ಲಿ. — Paytm`
          : `Application ${ctx.reference} finalised ✓. Your policy has been issued — documents are in your email and the app. Cover is effective today. Full details in your PDF. — Paytm`,

  rejected: ctx => {
    const reason = ctx.rejectionReason ? ` ${ctx.rejectionReason}.` : '';
    return ctx.language === 'hi'
      ? `आवेदन ${ctx.reference}: दुर्भाग्यवश मानक शर्तों पर स्वीकृति संभव नहीं।${reason ? ` मुख्य कारण:${reason}` : ''} ऐप में कारण और सुझाव देखें — सुधार के बाद दोबारा आवेदन स्वागत योग्य है। ट्रैकर पर "क्या बदलाव परिणाम बदलेगा" भी देखें। — Paytm`
      : ctx.language === 'kn'
        ? `ಅರ್ಜಿ ${ctx.reference}: ದುರದೃಷ್ಟವಶಾತ್ ಪ್ರಮಾಣಿತ ಷರತ್ತುಗಳಲ್ಲಿ ಅನುಮೋದನೆ ಸಾಧ್ಯವಿಲ್ಲ.${reason ? ` ಮುಖ್ಯ ಕಾರಣ:${reason}` : ''} ಕಾರಣ ಮತ್ತು ಸಲಹೆಗಳು ಆ್ಯಪ್‌ನಲ್ಲಿ ನೋಡಿ — ಸರಿಪಡಿಸಿದ ನಂತರ ಮರಳಿ ಅರ್ಜಿ ಸ್ವಾಗತವಾಗಿದೆ. — Paytm`
        : `Application ${ctx.reference}: unfortunately we cannot approve at standard terms today.${reason ? ` Main reason:${reason}` : ''} Reasons and suggested fixes are in the app — a re-application after the fix is welcome. See “What would change the outcome” on your tracker. — Paytm`;
  },

  eligibility_passed: ctx => {
    const score = ctx.eligibilityScore ?? 100;
    const verdictWord =
      ctx.language === 'hi' ? 'पात्र' : ctx.language === 'kn' ? 'ಅರ್ಹ' : 'eligible';
    return ctx.language === 'hi'
      ? `शुभ समाचार! आपकी पात्रता जाँच पारित हो गई — स्कोर ${score}%। आप ${verdictWord} घोषित हुए हैं। अगला चरण: दस्तावेज़ अपलोड। — Paytm`
      : ctx.language === 'kn'
        ? `ಶುಭಸುದ್ದಿ! ನಿಮ್ಮ ಅರ್ಹತಾ ಪರಿಶೀಲನೆ ಪಾಸ್ ಆಗಿದೆ — ಸ್ಕೋರ್ ${score}%. ನೀವು ${verdictWord} ಎಂದು ಘೋಷಿತ. ಮುಂದಿನ ಹಂತ: ದಸ್ತಾವೇಜು ಅಪ್‌ಲೋಡ್. — Paytm`
        : `Good news! Your eligibility check passed — score ${score}%. You are declared ${verdictWord}. Next step: upload your documents. — Paytm`;
  },

  document_issue: ctx =>
    ctx.language === 'hi'
      ? `आवेदन ${ctx.reference}: ${ctx.documentCount ?? 1} दस्तावेज़ में समस्या मिली है। ऐप में सटीक दोष और समाधान देखें — उसी फ़ाइल को दोबारा अपलोड करें, समीक्षा तुरंत होगी। — Paytm`
      : ctx.language === 'kn'
        ? `ಅರ್ಜಿ ${ctx.reference}: ${ctx.documentCount ?? 1} ದಸ್ತಾವೇಜಿನಲ್ಲಿ ಸಮಸ್ಯೆ ಕಂಡುಬಂದಿದೆ. ಆ್ಯಪ್‌ನಲ್ಲಿ ನಿಖರ ದೋಷ ಮತ್ತು ಪರಿಹಾರ ನೋಡಿ — ಅದೇ ಫೈಲ್ ಮರು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ, ಪರಿಶೀಲನೆ ತಕ್ಷಣ. — Paytm`
        : `Application ${ctx.reference}: we found an issue in ${ctx.documentCount ?? 1} document. See the exact flaw and fix in the app — re-upload the same slot and the review reruns instantly. — Paytm`,

  under_review: ctx =>
    ctx.language === 'hi'
      ? `आवेदन ${ctx.reference}: सभी दस्तावेज़ सत्यापित। फ़ाइल अब अंडरराइटर के पास है — निर्णय 1-2 कार्यदिवस में, और उसी क्षण आपको SMS मिलेगा। तब तक ऐप के असिस्टेंट से स्थिति पूछें। — Paytm`
      : ctx.language === 'kn'
        ? `ಅರ್ಜಿ ${ctx.reference}: ಎಲ್ಲಾ ದಸ್ತಾವೇಜು ಪರಿಶೀಲಿತ. ಫೈಲ್ ಈಗ ಅಂಡರ್‌ರೈಟರ್ ಬಳಿ — ನಿರ್ಧಾರ 1-2 ಕೆಲಸದ ದಿನದಲ್ಲಿ, ಮತ್ತು ಆ ಕ್ಷಣ ನಿಮಗೆ SMS ಬರುತ್ತದೆ. ಆಗಿನವರೆಗೆ ಆ್ಯಪ್‌ನ ಸಹಾಯಕನಿಂದ ಸ್ಥಿತಿ ಕೇಳಿ. — Paytm`
        : `Application ${ctx.reference}: all documents verified. Your file is now with an underwriter — decision expected in 1-2 working days, and you will get an SMS the moment it is made. Meanwhile, track progress with the in-app assistant. — Paytm`,
};

const TITLES: Record<NotificationKind, (dict: TranslationDict) => string> = {
  otp: () => 'One-time password (OTP)',
  application_received: () => 'Application received',
  eligibility_passed: () => 'Eligibility passed',
  document_issue: () => 'Document issue found',
  documents_verified: dict => dict.documents.allVerified,
  under_review: () => 'Under review',
  approved: () => 'Approved',
  finalized: () => 'Finalised',
  rejected: () => 'Decision: needs work',
};

let notificationCounter = 0;

export function createNotification(
  kind: NotificationKind,
  ctx: Omit<NotificationContext, 'dict'> & { dict: TranslationDict }
): NotificationRecord {
  notificationCounter += 1;
  return {
    id: `ntf-${Date.now().toString(36)}-${notificationCounter}`,
    kind,
    title: TITLES[kind](ctx.dict),
    body: BODIES[kind](ctx),
    channels: kind === 'otp' ? 'both' : 'both',
    phone: ctx.phone,
    language: ctx.language,
    sentAt: new Date(),
    read: false,
    n8nStatus: getN8nWebhookUrl() ? 'pending' : 'not-configured',
  };
}

/**
 * Delivery-status listeners. When the webhook mirror resolves, the engine
 * announces the outcome so the store can update the record's chip. Registered
 * by the app provider; a plain module variable keeps this file store-agnostic.
 */
type DeliveryStatusListener = (id: string, status: N8nDeliveryStatus) => void;
const deliveryListeners = new Set<DeliveryStatusListener>();

export function onN8nDeliveryStatus(listener: DeliveryStatusListener): () => void {
  deliveryListeners.add(listener);
  return () => deliveryListeners.delete(listener);
}

/**
 * Composes and dispatches the milestone message for a lifecycle event.
 * Returns the record so the reducer can append it to the feed; the n8n mirror
 * resolves in the background and updates the record's delivery chip.
 */
export function dispatchNotification(
  kind: NotificationKind,
  ctx: Omit<NotificationContext, 'dict'> & { dict: TranslationDict }
): NotificationRecord {
  const record = createNotification(kind, ctx);
  // Fire-and-forget mirror to n8n; silently ignored when no webhook is configured.
  void notifyN8n({
    event: kind,
    reference: ctx.reference,
    phone: ctx.phone,
    language: ctx.language,
    channels: ['sms', 'whatsapp'],
    message: record.body,
    journeyType: ctx.journeyType,
    sentAt: record.sentAt.toISOString(),
  }).then(status => {
    // The caller appends the record synchronously right after this returns, so
    // the network reply (always at least a macrotask later) lands on a stored id.
    deliveryListeners.forEach(listener => listener(record.id, status));
  });
  return record;
}

export const DEMO_OTP = '246810';
