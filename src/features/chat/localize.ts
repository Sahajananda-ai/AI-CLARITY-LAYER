import type { LanguageCode } from '../../shared/i18n';
import type { ChatContext } from './engine';
import { JOURNEY_STAGES } from '../../shared/utils/constants';
import { formatCurrency } from '../../shared/utils/formatters';
import { calculateEmi, estimateAnnualPremium } from '../eligibility/engine';
import { getDocumentSnapshot, getApplicationStage, withLifecycleExport } from './engine';
import type { LoanApplicant, InsuranceApplicant } from '../../shared/types/common';

/**
 * Trilingual assistant output.
 *
 * The English engine computes every number from the live application; this
 * module re-renders the same computed data as natural Hindi or Kannada
 * sentences. Financial figures stay in standard notation (₹, %) which is how
 * real Indian bank SMS messages are written, so nothing is lost in translation.
 */

type Lang = LanguageCode;

const pick = (lang: Lang, en: string, hi: string, kn: string) => (lang === 'hi' ? hi : lang === 'kn' ? kn : en);

const jword = (lang: Lang, journeyType: ChatContext['journeyType']) =>
  journeyType === 'loan' ? pick(lang, 'loan', 'लोन', 'ಸಾಲ') : pick(lang, 'insurance', 'बीमा', 'ವಿಮೆ');

export function localizeWelcome(lang: Lang, journeyType: ChatContext['journeyType'], applicantName: string): string {
  const first = applicantName.split(' ')[0] || '';
  return pick(
    lang,
    `Hi ${first}, I am your application assistant. I can tell you where your ${jword(lang, journeyType)} stands, what is pending, what it costs, and what to do next. Ask me anything — or tap a suggestion below.`,
    `नमस्ते ${first}, मैं आपका आवेदन सहायक हूँ। मैं बता सकता हूँ कि आपका ${jword(lang, journeyType)} कहाँ खड़ा है, क्या बाकी है, लागत कितनी है, और आगे क्या करना है। कुछ भी पूछें — या नीचे सुझाव चुनें।`,
    `ನಮಸ್ಕಾರ ${first}, ನಾನು ನಿಮ್ಮ ಅರ್ಜಿ ಸಹಾಯಕ. ನಿಮ್ಮ ${jword(lang, journeyType)} ಎಲ್ಲಿದೆ, ಏನು ಉಳಿದಿದೆ, ವೆಚ್ಚ ಎಷ್ಟು, ಮುಂದೆ ಏನು ಮಾಡಬೇಕು ಎಂದು ಹೇಳಬಲ್ಲೆ. ಏನನ್ನೂ ಕೇಳಿ — ಅಥವಾ ಕೆಳಗಿನ ಸಲಹೆ ಆರಿಸಿ.`
  );
}

export function localizeGeneral(lang: Lang, ctx: ChatContext, reference: string): string {
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);
  const stage = withLifecycleExport(getApplicationStage(ctx.journeyType, snapshot), ctx);
  const stages = JOURNEY_STAGES[ctx.journeyType];
  const step = Math.min(stage.index + 1, stages.length);
  return pick(
    lang,
    `Your ${jword(lang, ctx.journeyType)} application ${reference} is at step ${step} of ${stages.length} (${stage.label}). ${snapshot.verified.length} document(s) verified. Ask me: "where is my application?", "which documents are pending?", "when will I hear back?", "what is my EMI?" or "how can I improve my score?"`,
    `आपका ${jword(lang, ctx.journeyType)} आवेदन ${reference} चरण ${step}/${stages.length} (${stage.label}) पर है। ${snapshot.verified.length} दस्तावेज़ सत्यापित। पूछें: "मेरा आवेदन कहाँ है?", "कौन से दस्तावेज़ बाकी हैं?", "जवाब कब मिलेगा?", "मेरी ईएमआई कितनी है?" या "स्कोर कैसे सुधरेगा?"`,
    `ನಿಮ್ಮ ${jword(lang, ctx.journeyType)} ಅರ್ಜಿ ${reference} ಹಂತ ${step}/${stages.length} (${stage.label}) ನಲ್ಲಿದೆ. ${snapshot.verified.length} ದಸ್ತಾವೇಜು ಪರಿಶೀಲಿತ. ಕೇಳಿ: "ನನ್ನ ಅರ್ಜಿ ಎಲ್ಲಿದೆ?", "ಯಾವ ದಸ್ತಾವೇಜು ಉಳಿದಿದೆ?", "ಉತ್ತರ ಯಾವಾಗ?", "ನನ್ನ ಇಎಂಐ ಎಷ್ಟು?" ಅಥವಾ "ಸ್ಕೋರ್ ಹೇಗೆ ಸುಧಾರಿಸುವುದು?"`
  );
}

export function localizeStatus(lang: Lang, ctx: ChatContext, reference: string): string {
  const stages = JOURNEY_STAGES[ctx.journeyType];
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);
  const stage = withLifecycleExport(getApplicationStage(ctx.journeyType, snapshot), ctx);
  const step = Math.min(stage.index + 1, stages.length);
  const done = stage.index >= stages.length;

  const markerLine = (label: string, index: number) => {
    const mark = index < stage.index ? '✓' : index === stage.index ? '▶' : '○';
    const you = lang === 'en' ? ' ← you are here' : lang === 'hi' ? ' ← आप यहाँ हैं' : ' ← ನೀವು ಇಲ್ಲಿದ್ದೀರಿ';
    return `${mark} ${label}${index === stage.index ? you : ''}`;
  };

  if (ctx.lifecycle === 'rejected') {
    return pick(
      lang,
      `Your application ${reference} was **not approved** at standard terms. The exact reasons and your fastest fixes are in the "What would change the outcome" panel on the tracker — most applicants clear them and re-apply successfully.`,
      `आपका आवेदन ${reference} मानक शर्तों पर **स्वीकृत नहीं** हुआ। सटीक कारण और सबसे तेज़ समाधान ट्रैकर के "क्या बदलाव परिणाम बदलेगा" पैनल में हैं — ज़्यादातर लोग इन्हें ठीक करके दोबारा सफल होते हैं।`,
      `ನಿಮ್ಮ ಅರ್ಜಿ ${reference} ಪ್ರಮಾಣಿತ ಷರತ್ತುಗಳಲ್ಲಿ **ಅನುಮೋದಿತವಾಗಿಲ್ಲ**. ನಿಖರ ಕಾರಣ ಮತ್ತು ವೇಗದ ಪರಿಹಾರ ಟ್ರ್ಯಾಕರ್‌ನ "ಯಾವ ಬದಲಾವಣೆ ಫಲಿತಾಂಶ ಬದಲಿಸುತ್ತದೆ" ಪ್ಯಾನೆಲ್‌ನಲ್ಲಿವೆ — ಬಹುಪಾಲು ಜನ ಇವನ್ನು ಸರಿಪಡಿಸಿ ಮರಳಿ ಯಶಸ್ವಿಯಾಗುತ್ತಾರೆ.`
    );
  }

  const head = done
    ? pick(
        lang,
        `Your ${jword(lang, ctx.journeyType)} application ${reference} is **finalised ✓** — all ${stages.length} steps are complete.`,
        `आपका ${jword(lang, ctx.journeyType)} आवेदन ${reference} **अंतिम हो गया ✓** — सभी ${stages.length} चरण पूरे।`,
        `ನಿಮ್ಮ ${jword(lang, ctx.journeyType)} ಅರ್ಜಿ ${reference} **ಅಂತಿಮವಾಗಿದೆ ✓** — ಎಲ್ಲಾ ${stages.length} ಹಂತ ಪೂರ್ಣ.`
      )
    : pick(
        lang,
        `Your ${jword(lang, ctx.journeyType)} application ${reference} is at **${stage.label}** — step ${step} of ${stages.length}.`,
        `आपका ${jword(lang, ctx.journeyType)} आवेदन ${reference} **${stage.label}** पर है — चरण ${step}/${stages.length}।`,
        `ನಿಮ್ಮ ${jword(lang, ctx.journeyType)} ಅರ್ಜಿ ${reference} **${stage.label}** ನಲ್ಲಿದೆ — ಹಂತ ${step}/${stages.length}.`
      );

  const blocker = stage.blocker
    ? pick(lang, `**Why it has not moved:** ${stage.blocker}.`, `**आगे क्यों नहीं बढ़ा:** ${stage.blocker}।`, `**ಮುಂದೆ ಏಕೆ ಇಲ್ಲ:** ${stage.blocker}.`)
    : pick(
        lang,
        `**Nothing is blocking you.** ${snapshot.verified.length} required document(s) passed review.`,
        `**कुछ भी रोक नहीं रहा।** ${snapshot.verified.length} आवश्यक दस्तावेज़ पारित।`,
        `**ಏನೂ ತಡೆಯುತ್ತಿಲ್ಲ.** ${snapshot.verified.length} ಅಗತ್ಯ ದಸ್ತಾವೇಜು ಪಾಸ್.`
      );

  return [head, '', ...stages.map(markerLine), '', blocker].join('\n');
}

export function localizeDocuments(lang: Lang, ctx: ChatContext): string {
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);
  const labels = {
    verified: pick(lang, 'verified ✓', 'सत्यापित ✓', 'ಪರಿಶೀಲಿತ ✓'),
    missing: pick(lang, 'not uploaded yet', 'अभी अपलोड नहीं हुआ', 'ಇನ್ನೂ ಅಪ್‌ಲೋಡ್ ಆಗಿಲ್ಲ'),
    fail: pick(lang, 'must be replaced', 'बदलना होगा', 'ಬದಲಿಸಬೇಕು'),
    warn: pick(lang, 'usable, review advised', 'उपयोग योग्य, समीक्षा सुझाई', 'ಬಳಸಬಹುದು, ಪರಿಶೀಲನೆ ಸಲಹೆ'),
  };
  const rows = ctx.uploadedDocs
    .filter(doc => doc.fileName)
    .map(doc => {
      const status = doc.status === 'pass' ? labels.verified : doc.status === 'fail' ? labels.fail : labels.warn;
      return `• ${doc.fileName} — ${status}`;
    });
  const missing = snapshot.notUploaded.map(doc => `• ${doc.name} — ${labels.missing}`);
  return pick(
    lang,
    `**${snapshot.verified.length} of your documents verified.** Full picture:`,
    `**${snapshot.verified.length} दस्तावेज़ सत्यापित।** पूरी स्थिति:`,
    `**${snapshot.verified.length} ದಸ್ತಾವೇಜು ಪರಿಶೀಲಿತ.** ಪೂರ್ಣ ಚಿತ್ರ:`
  )
    .concat('\n', [...rows, ...missing].join('\n') || '—');
}

export function localizeTimeline(lang: Lang, ctx: ChatContext): string {
  const snapshot = getDocumentSnapshot(ctx.journeyType, ctx.uploadedDocs);
  const stage = withLifecycleExport(getApplicationStage(ctx.journeyType, snapshot), ctx);
  const stages = JOURNEY_STAGES[ctx.journeyType];

  if (ctx.lifecycle === 'rejected') {
    return pick(
      lang,
      'There is no waiting left — the decision was made. Open the reasons panel on the tracker, fix the top item, and a fresh application usually clears in days.',
      'इंतज़ार खत्म — निर्णय हो चुका है। ट्रैकर पर कारण पैनल खोलें, सबसे बड़ी दिक्कत ठीक करें, दोबारा आवेदन आम तौर पर कुछ दिनों में पास होता है।',
      'ಕಾಯುವುದಿಲ್ಲ — ನಿರ್ಧಾರವಾಗಿದೆ. ಟ್ರ್ಯಾಕರ್‌ನಲ್ಲಿ ಕಾರಣ ಪ್ಯಾನೆಲ್ ತೆರೆಯಿರಿ, ದೊಡ್ಡ ಸಮಸ್ಯೆ ಸರಿಪಡಿಸಿ, ಮರಳಿ ಅರ್ಜಿ ಸಾಮಾನ್ಯವಾಗಿ ದಿನಗಳಲ್ಲಿ ಪಾಸ್ ಆಗುತ್ತದೆ.'
    );
  }

  if (stage.index >= stages.length) {
    return pick(
      lang,
      'Everything is done — the money/cover is with you. First EMI is due the same date next month; the full schedule is in your PDF statement.',
      'सब पूरा — राशि/कवर आपके पास है। पहली ईएमआई अगले महीने इसी तारीख को; पूरा शेड्यूल PDF में है।',
      'ಎಲ್ಲವೂ ಪೂರ್ಣ — ಹಣ/ಕವರ್ ನಿಮ್ಮ ಬಳಿ. ಮೊದಲ ಇಎಂಐ ಮುಂದಿನ ತಿಂಗಳು ಇದೇ ದಿನ; ಪೂರ್ಣ ವೇಳಾಪಟ್ಟಿ PDF ನಲ್ಲಿ.'
    );
  }

  return pick(
    lang,
    `All verified documents are with the underwriter. Expected decision window: 1–2 working days, and an SMS arrives the moment it is made. ${stage.blocker ? `Right now: ${stage.blocker}.` : 'Nothing is pending from your side.'}`,
    `सत्यापित दस्तावेज़ अंडरराइटर के पास हैं। संभावित निर्णय: 1–2 कार्यदिवस, और निर्णय होते ही SMS आएगा। ${stage.blocker ? `अभी: ${stage.blocker}।` : 'आपकी तरफ से कुछ बाकी नहीं।'}`,
    `ಪರಿಶೀಲಿತ ದಸ್ತಾವೇಜು ಅಂಡರ್‌ರೈಟರ್ ಬಳಿ. ನಿರೀಕ್ಷಿತ ನಿರ್ಧಾರ: 1–2 ಕೆಲಸದ ದಿನ, ನಿರ್ಧಾರವಾದ ತಕ್ಷಣ SMS ಬರುತ್ತದೆ. ${stage.blocker ? `ಈಗ: ${stage.blocker}.` : 'ನಿಮ್ಮ ಕಡೆಯಿಂದ ಏನೂ ಉಳಿದಿಲ್ಲ.'}`
  );
}

export function localizeAmount(lang: Lang, ctx: ChatContext): string {
  if ('loanAmount' in ctx.applicant) {
    const a = ctx.applicant as LoanApplicant;
    const emi = calculateEmi(a.loanAmount, 0.115, Number(a.tenureMonths));
    const total = emi * Number(a.tenureMonths);
    return pick(
      lang,
      `On your ${formatCurrency(a.loanAmount)} loan over ${a.tenureMonths} months: EMI **${formatCurrency(emi)}/month**, total repayment **${formatCurrency(total)}**, processing fee ${formatCurrency(a.loanAmount * 0.02)} + GST. That is about ${Math.round(((a.existingEMIs + emi) / (a.annualIncome / 12)) * 100)}% of your monthly income.`,
      `आपके ${formatCurrency(a.loanAmount)} लोन पर ${a.tenureMonths} महीनों के लिए: ईएमआई **${formatCurrency(emi)}/माह**, कुल भुगतान **${formatCurrency(total)}**, प्रोसेसिंग शुल्क ${formatCurrency(a.loanAmount * 0.02)} + GST। यह आपकी मासिक आय का लगभग ${Math.round(((a.existingEMIs + emi) / (a.annualIncome / 12)) * 100)}% है।`,
      `ನಿಮ್ಮ ${formatCurrency(a.loanAmount)} ಸಾಲದ ಮೇಲೆ ${a.tenureMonths} ತಿಂಗಳು: ಇಎಂಐ **${formatCurrency(emi)}/ತಿಂಗಳು**, ಒಟ್ಟು ಪಾವತಿ **${formatCurrency(total)}**, ಪ್ರೊಸೆಸಿಂಗ್ ಶುಲ್ಕ ${formatCurrency(a.loanAmount * 0.02)} + GST. ಇದು ನಿಮ್ಮ ಮಾಸಿಕ ಆದಾಯದ ಸುಮಾರು ${Math.round(((a.existingEMIs + emi) / (a.annualIncome / 12)) * 100)}%.`
    );
  }
  const a = ctx.applicant as InsuranceApplicant;
  const loading = (a.preExistingConditions || '').trim().toLowerCase() !== 'none' && a.preExistingConditions.trim() !== '' ? 0.4 : 0;
  const annual = estimateAnnualPremium(a.age, a.coverageAmount, Number(a.policyTermYears), loading);
  return pick(
    lang,
    `For ${formatCurrency(a.coverageAmount)} cover over ${a.policyTermYears} years: annual premium **${formatCurrency(annual)}** (≈ ${formatCurrency(annual / 12)}/month).${loading ? ' Includes a ~40% loading for your declared condition.' : ''}`,
    `${formatCurrency(a.coverageAmount)} कवर पर ${a.policyTermYears} वर्षों के लिए: वार्षिक प्रीमियम **${formatCurrency(annual)}** (≈ ${formatCurrency(annual / 12)}/माह)।${loading ? ' आपकी घोषित बीमारी के कारण ~40% लोडिंग शामिल है।' : ''}`,
    `${formatCurrency(a.coverageAmount)} ಕವರ್ ಮೇಲೆ ${a.policyTermYears} ವರ್ಷ: ವಾರ್ಷಿಕ ಪ್ರೀಮಿಯಮ್ **${formatCurrency(annual)}** (≈ ${formatCurrency(annual / 12)}/ತಿಂಗಳು).${loading ? ' ನಿಮ್ಮ ಘೋಷಿತ ಕಾಯಿಲೆಗೆ ~40% ಲೋಡಿಂಗ್ ಸೇರಿದೆ.' : ''}`
  );
}

export function localizeRepayment(lang: Lang, ctx: ChatContext): string {
  if ('loanAmount' in ctx.applicant) {
    const a = ctx.applicant as LoanApplicant;
    const emi = calculateEmi(a.loanAmount, 0.115, Number(a.tenureMonths));
    return pick(
      lang,
      `Your EMI is **${formatCurrency(emi)}/month** for ${a.tenureMonths} months, starting one month after disbursal. Pay by UPI Autopay (set once, automatic), debit-card mandate or net banking. Part-payment any time after 6 EMIs is free, and so is full foreclosure.`,
      `आपकी ईएमआई **${formatCurrency(emi)}/माह** है, ${a.tenureMonths} महीनों के लिए, डिस्बर्सल के एक महीने बाद शुरू। भुगतान: UPI ऑटोपे (एक बार सेट, फिर अपने आप), डेबिट-कार्ड मांडेट या नेट बैंकिंग। 6 ईएमआई के बाद कभी भी आंशिक भुगतान मुफ़्त, पूर्व-चुकती भी मुफ़्त।`,
      `ನಿಮ್ಮ ಇಎಂಐ **${formatCurrency(emi)}/ತಿಂಗಳು**, ${a.tenureMonths} ತಿಂಗಳು, ಡಿಸ್ಬರ್ಸಲ್ ಒಂದು ತಿಂಗಳ ನಂತರ ಪ್ರಾರಂಭ. ಪಾವತಿ: UPI ಆಟೋಪೇ (ಒಮ್ಮೆ ಸೆಟ್, ಸ್ವಯಂಚಾಲಿತ), ಡೆಬಿಟ್-ಕಾರ್ಡ್ ಮ್ಯಾಂಡೇಟ್ ಅಥವಾ ನೆಟ್ ಬ್ಯಾಂಕಿಂಗ್. 6 ಇಎಂಐ ನಂತರ ಭಾಗಶಃ ಪಾವತಿ ಉಚಿತ, ಪೂರ್ವ ಪಾವತಿಯೂ ಉಚಿತ.`
    );
  }
  return pick(
    lang,
    'For insurance, you pay an annual premium — UPI autopay or card mandate both work. Premiums are level for the whole term, with a 30-day grace period if a payment slips.',
    'बीमा में आप वार्षिक प्रीमियम चुकाते हैं — UPI ऑटोपे या कार्ड मांडेट दोनों चलते हैं। प्रीमियम पूरी अवधि के लिए स्थिर रहता है, और छूटने पर 30 दिन की राहत अवधि मिलती है।',
    'ವಿಮೆಯಲ್ಲಿ ವಾರ್ಷಿಕ ಪ್ರೀಮಿಯಮ್ ಪಾವತಿಸುತ್ತೀರಿ — UPI ಆಟೋಪೇ ಅಥವಾ ಕಾರ್ಡ್ ಮ್ಯಾಂಡೇಟ್ ಎರಡೂ ಸರಿ. ಪ್ರೀಮಿಯಮ್ ಪೂರ್ಣ ಅವಧಿಗೆ ಸ್ಥಿರ, ತಪ್ಪಿದರೆ 30 ದಿನದ ಗ್ರೇಸ್ ಅವಧಿ.'
  );
}

export function localizeMissed(lang: Lang, ctx: ChatContext): string {
  if ('loanAmount' in ctx.applicant) {
    const a = ctx.applicant as LoanApplicant;
    const emi = calculateEmi(a.loanAmount, 0.115, Number(a.tenureMonths));
    return pick(
      lang,
      `If your ${formatCurrency(emi)} EMI bounces: days 1–3 a reminder, day 4 a ₹500+GST late fee, day 4–30 it is reported to CIBIL (score drop of 40–80 points), and after 90 days the full amount can be recalled. Pay the overdue EMI + fee before day 90 and the account returns to good standing.`,
      `अगर आपकी ${formatCurrency(emi)} ईएमआई छूटे: दिन 1–3 रिमाइंडर, दिन 4 पर ₹500+GST लेट फीस, दिन 4–30 में CIBIL में रिपोर्ट (स्कोर 40–80 अंक गिर सकता है), और 90 दिन बाद पूरी राशि मांगी जा सकती है। 90 दिन से पहले बकाया ईएमआई + फीस चुकाएँ तो खाता फिर सामान्य हो जाता है।`,
      `ನಿಮ್ಮ ${formatCurrency(emi)} ಇಎಂಐ ತಪ್ಪಿದರೆ: ದಿನ 1–3 ರಿಮೈಂಡರ್, ದಿನ 4 ಕ್ಕೆ ₹500+GST ಲೇಟ್ ಫೀ, ದಿನ 4–30 ರಲ್ಲಿ CIBIL ಗೆ ವರದಿ (ಸ್ಕೋರ್ 40–80 ಇಳಿಯಬಹುದು), 90 ದಿನ ನಂತರ ಪೂರ್ಣ ಮೊತ್ತ ವಸೂಲಿ ಸಾಧ್ಯ. 90 ದಿನದ ಮೊದಲು ಬಾಕಿ ಇಎಂಐ + ಫೀ ಪಾವತಿಸಿದರೆ ಖಾತೆ ಸಾಮಾನ್ಯವಾಗುತ್ತದೆ.`
    );
  }
  return pick(
    lang,
    'For insurance: pay within the 30-day grace period and nothing changes. Beyond it the policy lapses — cover stops — but you can revive within 2 years by clearing arrears plus a health declaration.',
    'बीमा में: 30 दिन की राहत अवधि में भुगतान करें तो कुछ नहीं बदलता। उसके बाद पॉलिसी लैप्स हो जाती है — कवर रुक जाता है — पर 2 साल के भीतर बकाया + स्वास्थ्य घोषणा के साथ पुनर्जीवित कर सकते हैं।',
    'ವಿಮೆಯಲ್ಲಿ: 30 ದಿನದ ಗ್ರೇಸ್ ಅವಧಿಯಲ್ಲಿ ಪಾವತಿಸಿದರೆ ಏನೂ ಬದಲಾಗುವುದಿಲ್ಲ. ಅದರ ನಂತರ ಪಾಲಿಸಿ ಲ್ಯಾಪ್ಸ್ — ಕವರ್ ನಿಲ್ಲುತ್ತದೆ — ಆದರೆ 2 ವರ್ಷದೊಳಗೆ ಬಾಕಿ + ಆರೋಗ್ಯ ಘೋಷಣೆಯೊಂದಿಗೆ ಪುನರುಜ್ಜೀವಿಸಬಹುದು.'
  );
}

export function localizePolicy(lang: Lang, ctx: ChatContext): string {
  if ('loanAmount' in ctx.applicant) {
    return pick(
      lang,
      `Your personal loan: ${formatCurrency((ctx.applicant as LoanApplicant).loanAmount)} at ~11.5% p.a. fixed, one-time processing fee of 2% + GST, zero prepayment penalty after 6 EMIs, no collateral. On-time payments are reported to the bureau monthly, so this loan builds your credit history.`,
      `आपका पर्सनल लोन: ${formatCurrency((ctx.applicant as LoanApplicant).loanAmount)} लगभग 11.5% सालाना (स्थिर), एक बार की 2% प्रोसेसिंग फीस + GST, 6 ईएमआई के बाद ज़ीरो प्रीपेमेंट पेनल्टी, कोई गिरवी नहीं। समय पर भुगतान हर महीने ब्यूरो को रिपोर्ट होता है, यानी यह लोन आपका क्रेडिट इतिहास बनाता है।`,
      `ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ಸಾಲ: ${formatCurrency((ctx.applicant as LoanApplicant).loanAmount)} ಸುಮಾರು 11.5% ವಾರ್ಷಿಕ (ಸ್ಥಿರ), ಒಮ್ಮೆಯ 2% ಪ್ರೊಸೆಸಿಂಗ್ ಶುಲ್ಕ + GST, 6 ಇಎಂಐ ನಂತರ ಪ್ರೀಪೇಮೆಂಟ್ ದಂಡ ಇಲ್ಲ, ಅಡಮಾನ ಇಲ್ಲ. ಸಕಾಲದ ಪಾವತಿ ಪ್ರತಿ ತಿಂಗಳು ಬ್ಯೂರೋಗೆ ವರದಿ — ಈ ಸಾಲ ನಿಮ್ಮ ಕ್ರೆಡಿಟ್ ಇತಿಹಾಸ ಕಟ್ಟುತ್ತದೆ.`
    );
  }
  return pick(
    lang,
    'Your term plan pays your family the full cover amount as a tax-free lump sum if anything happens to you during the term. Claims are paid within 30 days of complete documents. Suicide in year 1 and non-disclosed conditions are the only exclusions — honest disclosure is what makes the claim payable.',
    'आपकी टर्म पॉलिसी अवधि में कुछ होने पर परिवार को पूरी कवर राशि टैक्स-मुक्त एकमुश्त देती है। पूरे दस्तावेज़ मिलने पर 30 दिनों में क्लेम मिलता है। पहले साल की आत्महत्या और गैर-घोषित बीमारियाँ ही अपवाद हैं — ईमानदार घोषणा ही क्लेम मिलने की गारंटी है।',
    'ನಿಮ್ಮ ಟರ್ಮ್ ಪ್ಯಾನ್ ಅವಧಿಯಲ್ಲಿ ಏನಾದರೂ ಆದರೆ ಕುಟುಂಬಕ್ಕೆ ಪೂರ್ಣ ಕವರ್ ಮೊತ್ತ ತೆರಿಗೆ-ಮುಕ್ತ ಒಂದೇ ಮೊತ್ತದಲ್ಲಿ ಸಿಗುತ್ತದೆ. ಪೂರ್ಣ ದಸ್ತಾವೇಜು ಆದ 30 ದಿನದಲ್ಲಿ ಕ್ಲೇಮ್ ಪಾವತಿ. ಮೊದಲ ವರ್ಷದ ಆತ್ಮಹತ್ಯೆ ಮತ್ತು ಘೋಷಿಸದ ಕಾಯಿಲೆಗಳು ಮಾತ್ರ ಹೊರತು — ಪ್ರಾಮಾಣಿಕ ಘೋಷಣೆಯೇ ಕ್ಲೇಮ್ ಪಾವತಿಸುವ ಭರವಸೆ.'
  );
}

export function localizeEligibility(lang: Lang, verdict: string, score: number): string {
  const verdictLabel =
    verdict === 'eligible'
      ? pick(lang, 'Eligible', 'पात्र', 'ಅರ್ಹ')
      : verdict === 'conditional'
        ? pick(lang, 'Conditionally Eligible', 'सशर्त रूप से पात्र', 'ಷರತ್ತಿನ ಮೇಲೆ ಅರ್ಹ')
        : pick(lang, 'Not Eligible', 'अपात्र', 'ಅನರ್ಹ');
  return pick(
    lang,
    `Your verdict is **${verdictLabel}** with a weighted score of ${score}%. Ask "how can I improve it?" and I will re-run the numbers on a corrected profile.`,
    `आपका निर्णय **${verdictLabel}** है, भारित स्कोर ${score}%। पूछें "कैसे सुधरेगा?" तो मैं सुधारे हुए प्रोफ़ाइल पर दोबारा गणना करूँगा।`,
    `ನಿಮ್ಮ ತೀರ್ಪು **${verdictLabel}**, ತೂಕದ ಸ್ಕೋರ್ ${score}%. "ಹೇಗೆ ಸುಧಾರಿಸುವುದು?" ಎಂದು ಕೇಳಿ, ನಾನು ಸರಿಪಡಿಸಿದ ಪ್ರೊಫೈಲ್‌ನಲ್ಲಿ ಮರಳಿ ಲೆಕ್ಕ ಹಾಕುತ್ತೇನೆ.`
  );
}

export function localizeImprove(lang: Lang, topSuggestion: string | null): string {
  return pick(
    lang,
    topSuggestion
      ? `The single change worth the most: ${topSuggestion} Ask "what are the criteria?" for the full breakdown.`
      : 'Nothing is holding your profile back — every criterion passes. Just avoid new EMIs or missed payments until disbursal.',
    topSuggestion
      ? `सबसे बड़ा बदलाव: ${topSuggestion} पूरी तस्वीर के लिए पूछें "मानदंड क्या हैं?"।`
      : 'आपकी प्रोफ़ाइल में कुछ कम नहीं — हर मानदंड पास है। डिस्बर्सल तक नई ईएमआई या चूक से बचें।',
    topSuggestion
      ? `ದೊಡ್ಡ ಬದಲಾವಣೆ: ${topSuggestion} ಪೂರ್ಣ ಚಿತ್ರಕ್ಕೆ "ಮಾನದಂಡಗಳೇನು?" ಎಂದು ಕೇಳಿ.`
      : 'ನಿಮ್ಮ ಪ್ರೊಫೈಲ್‌ನಲ್ಲಿ ಏನೂ ಕಡಿಮೆ ಇಲ್ಲ — ಎಲ್ಲಾ ಮಾನದಂಡ ಪಾಸ್. ಡಿಸ್ಬರ್ಸಲ್‌ವರೆಗೆ ಹೊಸ ಇಎಂಐ/ತಪ್ಪುಗಳನ್ನು ತಪ್ಪಿಸಿ.'
  );
}

export function localizeContact(lang: Lang): string {
  return pick(
    lang,
    'A human is one step away: phone 1800-123-4567 (9 AM–8 PM), email care@paytm.example (reply in 4 working hours), or keep asking me — most answers are faster here.',
    'इंसान से बात एक कदम दूर है: फ़ोन 1800-123-4567 (सुबह 9 – रात 8), ईमेल care@paytm.example (4 कार्य-घंटों में जवाब), या यहीं मुझसे पूछते रहें — ज़्यादातर जवाब यहाँ तेज़ मिलते हैं।',
    'ಮನುಷ್ಯನ ಜೊತೆ ಮಾತು ಒಂದು ಹೆಜ್ಜೆ ದೂರ: ಫೋನ್ 1800-123-4567 (ಬೆಳಿಗ್ಗೆ 9 – ರಾತ್ರಿ 8), ಇಮೇಲ್ care@paytm.example (4 ಕೆಲಸದ ಗಂಟೆಗಳಲ್ಲಿ ಉತ್ತರ), ಅಥವಾ ಇಲ್ಲಿ ಕೇಳುತ್ತಾ ಇರಿ — ಬಹುಪಾಲು ಉತ್ತರ ಇಲ್ಲಿ ವೇಗ.'
  );
}

export function localizeCancel(lang: Lang, reference: string): string {
  return pick(
    lang,
    `Before you withdraw ${reference}: nothing has been charged yet, your eligibility result stays valid for 30 days, and withdrawing does not affect your credit score. If a specific blocker pushed you here, tell me — most are fixable.`,
    `${reference} वापस लेने से पहले: अभी तक कुछ भी काटा नहीं गया, आपका पात्रता निर्णय 30 दिन वैध रहता है, और वापसी से क्रेडिट स्कोर पर असर नहीं पड़ता। अगर कोई खास दिक्कत यहाँ लाई है, तो बताएँ — ज़्यादातर ठीक हो जाती हैं।`,
    `${reference} ಹಿಂಪಡೆಯುವ ಮೊದಲು: ಇನ್ನೂ ಏನೂ ಕಡಿತವಾಗಿಲ್ಲ, ನಿಮ್ಮ ಅರ್ಹತಾ ತೀರ್ಪು 30 ದಿನ ಮಾನ್ಯ, ಹಿಂಪಡೆದರೆ ಕ್ರೆಡಿಟ್ ಸ್ಕೋರ್ ಮೇಲೆ ಪರಿಣಾಮವಿಲ್ಲ. ಒಂದು ನಿರ್ದಿಷ್ಟ ಸಮಸ್ಯೆ ಇಲ್ಲಿಗೆ ತಂದಿದ್ದರೆ ಹೇಳಿ — ಬಹುಪಾಲು ಸರಿಪಡಬಹುದು.`
  );
}

export function localizeGreeting(lang: Lang, applicantName: string): string {
  const first = applicantName.split(' ')[0] || '';
  return pick(
    lang,
    `Hello ${first}! Ask me anything about your application — where it stands, what is pending, or when to expect movement.`,
    `नमस्ते ${first}! अपने आवेदन के बारे में कुछ भी पूछें — कहाँ खड़ा है, क्या बाकी है, या आगे कब कुछ होगा।`,
    `ನಮಸ್ಕಾರ ${first}! ನಿಮ್ಮ ಅರ್ಜಿ ಬಗ್ಗೆ ಏನನ್ನೂ ಕೇಳಿ — ಎಲ್ಲಿದೆ, ಏನು ಉಳಿದಿದೆ, ಅಥವಾ ಯಾವಾಗ ಚಲನೆ.`
  );
}
