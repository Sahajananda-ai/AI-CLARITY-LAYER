import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMessage } from '../../../shared/types/common';
import { useApp } from '../../../contexts/AppContext';
import { generateChatResponse, createWelcomeMessage, stripMarkdown } from '../engine';
import { Badge, Button, Input, RichText } from '../../../shared/components';
import { ThoughtLine } from '../../../shared/components/motion';
import { useSpeechRecognition, speak, stopSpeaking } from '../../../shared/hooks';
import { Send, Sparkles, ShieldCheck, Mic, MicOff, Volume2, Square } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { cn } from '../../../shared/utils/cn';

/**
 * Quick questions rotate: the first five are status-oriented (what a fresh
 * applicant needs), the rest cover repayment, missed payments and policy so
 * the deeper questions are discoverable without typing. Every entry is
 * translated: `label` renders on the chip, `text` is sent to the classifier
 * (which matches English keywords in every language — Indians mix scripts
 * naturally, so the classifier sees the English phrasing).
 */
const QUICK_QUESTIONS: Record<'en' | 'hi' | 'kn', { label: string; text: string }[]> = {
  en: [
    { label: "Where's my application?", text: "Where's my application right now?" },
    { label: 'Which docs are pending?', text: 'Which documents are still pending?' },
    { label: 'When will I hear back?', text: 'When will I hear back?' },
    { label: 'How much will it cost?', text: 'How much will it cost me per month?' },
    { label: 'Improve my score?', text: 'What would improve my score?' },
    { label: 'How do I repay?', text: 'How do I repay the loan?' },
    { label: 'What if I miss a month?', text: 'What happens if I miss one month repayment?' },
    { label: 'What does the policy cover?', text: 'What does the policy cover and what are the benefits?' },
    { label: 'What are the criteria?', text: 'What are the criteria of repayment and eligibility?' },
    { label: 'How to become more eligible?', text: 'How can I become more eligible if my score is low?' },
  ],
  hi: [
    { label: 'मेरा आवेदन कहाँ है?', text: "Where's my application right now?" },
    { label: 'कौन से दस्तावेज़ बाकी हैं?', text: 'Which documents are still pending?' },
    { label: 'जवाब कब मिलेगा?', text: 'When will I hear back?' },
    { label: 'कितना खर्च आएगा?', text: 'How much will it cost me per month?' },
    { label: 'स्कोर कैसे सुधरेगा?', text: 'What would improve my score?' },
    { label: 'भुगतान कैसे करूँ?', text: 'How do I repay the loan?' },
    { label: 'महीना छूट जाए तो?', text: 'What happens if I miss one month repayment?' },
    { label: 'पॉलिसी क्या कवर करती है?', text: 'What does the policy cover and what are the benefits?' },
    { label: 'मानदंड क्या हैं?', text: 'What are the criteria of repayment and eligibility?' },
    { label: 'पात्रता कैसे बढ़ाएँ?', text: 'How can I become more eligible if my score is low?' },
  ],
  kn: [
    { label: 'ನನ್ನ ಅರ್ಜಿ ಎಲ್ಲಿದೆ?', text: "Where's my application right now?" },
    { label: 'ಯಾವ ದಸ್ತಾವೇಜು ಉಳಿದಿದೆ?', text: 'Which documents are still pending?' },
    { label: 'ಉತ್ತರ ಯಾವಾಗ?', text: 'When will I hear back?' },
    { label: 'ಎಷ್ಟು ಖರ್ಚಾಗುತ್ತದೆ?', text: 'How much will it cost me per month?' },
    { label: 'ಸ್ಕೋರ್ ಸುಧಾರಣೆ?', text: 'What would improve my score?' },
    { label: 'ಹೇಗೆ ಮರುಪಾವತಿ?', text: 'How do I repay the loan?' },
    { label: 'ತಿಂಗಳು ತಪ್ಪಿದರೆ?', text: 'What happens if I miss one month repayment?' },
    { label: 'ಪಾಲಿಸಿ ಏನು ಕವರ್?', text: 'What does the policy cover and what are the benefits?' },
    { label: 'ಮಾನದಂಡಗಳೇನು?', text: 'What are the criteria of repayment and eligibility?' },
    { label: 'ಅರ್ಹತೆ ಹೆಚ್ಚಿಸುವುದು?', text: 'How can I become more eligible if my score is low?' },
  ],
};

const THINKING_LABELS: Record<'en' | 'hi' | 'kn', { label: string; steps: string[]; done: string }> = {
  en: {
    label: 'Thinking…',
    steps: ['Reading your application…', 'Checking document status…', 'Working out the dates…'],
    done: 'Thought for',
  },
  hi: {
    label: 'सोच रहा हूँ…',
    steps: ['आपका आवेदन पढ़ रहा हूँ…', 'दस्तावेज़ स्थिति जाँच रहा हूँ…', 'तिथियाँ निकाल रहा हूँ…'],
    done: 'सोचा',
  },
  kn: {
    label: 'ಯೋಚಿಸುತ್ತಿದ್ದೇನೆ…',
    steps: ['ನಿಮ್ಮ ಅರ್ಜಿ ಓದುತ್ತಿದ್ದೇನೆ…', 'ದಸ್ತಾವೇಜು ಸ್ಥಿತಿ ಪರಿಶೀಲಿಸುತ್ತಿದ್ದೇನೆ…', 'ದಿನಾಂಕಗಳನ್ನು ಲೆಕ್ಕ ಹಾಕುತ್ತಿದ್ದೇನೆ…'],
    done: 'ಯೋಚಿಸಿದೆ',
  },
};

const TTS_LABELS: Record<'en' | 'hi' | 'kn', { header: string; sub: string; placeholder: string; offline: string }> = {
  en: {
    header: 'Paytm Application Assistant',
    sub: 'Replies instantly • reads your live file • speaks back',
    placeholder: 'Ask, type, or tap the mic…',
    offline: 'Answers come from your application data — no external AI service, works offline.',
  },
  hi: {
    header: 'पेटीएम आवेदन असिस्टेंट',
    sub: 'तुरंत जवाब • आपकी लाइव फ़ाइल पढ़ता है • बोलकर भी जवाब',
    placeholder: 'पूछें, लिखें, या माइक दबाएँ…',
    offline: 'जवाब आपके आवेदन डेटा से आते हैं — कोई बाहरी एआई सेवा नहीं, ऑफ़लाइन भी।',
  },
  kn: {
    header: 'ಪೇಟಿಎಂ ಅರ್ಜಿ ಸಹಾಯಕ',
    sub: 'ತಕ್ಷಣ ಉತ್ತರ • ನಿಮ್ಮ ಲೈವ್ ಫೈಲ್ ಓದುತ್ತದೆ • ಧ್ವನಿಯಲ್ಲಿ ಉತ್ತರ',
    placeholder: 'ಕೇಳಿ, ಬರೆಯಿರಿ, ಅಥವಾ ಮೈಕ್ ಒತ್ತಿ…',
    offline: 'ಉತ್ತರಗಳು ನಿಮ್ಮ ಅರ್ಜಿ ಡೇಟಾದಿಂದ — ಬಾಹ್ಯ ಎಐ ಸೇವೆ ಇಲ್ಲ, ಆಫ್‌ಲೈನ್‌ನಲ್ಲೂ.',
  },
};

/**
 * Monotonic id source, namespaced per session.
 *
 * A bare counter was not enough: chat history is persisted to localStorage while
 * the counter restarts on every page load, so the first message of a new session
 * reused `msg-1-user` and React reported duplicate list keys. `Date.now()` is not
 * an option either — calling it during render is flagged as impure.
 */
const SESSION_ID = Math.random().toString(36).slice(2, 8);
let messageCounter = 0;
function nextMessageId(kind: 'user' | 'assistant' | 'error'): string {
  messageCounter += 1;
  return `msg-${SESSION_ID}-${messageCounter}-${kind}`;
}

export function ChatWindow() {
  const { state, actions } = useApp();
  const { language } = useI18n();
  const { applicant, journeyType, eligibilityResult, uploadedDocuments, chatMessages, lifecycle, submitted } = state;

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ready = Boolean(applicant && journeyType);
  const lang = language;
  const quick = QUICK_QUESTIONS[lang];
  const thinking = THINKING_LABELS[lang];
  const tts = TTS_LABELS[lang];

  // Normally seeded by the reducer on submit; this covers a session that was
  // persisted before the greeting existed (or a direct visit to /dashboard).
  const fallbackGreeting = useMemo(
    () => (ready && applicant && journeyType ? createWelcomeMessage(journeyType, applicant, lang) : null),
    [ready, applicant, journeyType, lang]
  );
  const messages = chatMessages.length > 0 ? chatMessages : fallbackGreeting ? [fallbackGreeting] : [];

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, isLoading]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || isLoading || !applicant || !journeyType) return;

    setInput('');
    setIsLoading(true);
    actions.addChatMessage({
      id: nextMessageId('user'),
      role: 'user',
      content: text,
      timestamp: new Date(),
    });

    try {
      const reply = await generateChatResponse(text, {
        applicant,
        journeyType,
        eligibility: eligibilityResult,
        uploadedDocs: uploadedDocuments,
        lifecycle,
        submitted,
        language: lang,
      });

      const id = nextMessageId('assistant');
      actions.addChatMessage({
        id,
        role: 'assistant',
        content: reply.response,
        timestamp: new Date(),
        intent: reply.intent,
        signals: reply.signals,
        confidence: reply.confidence,
      });

      // Voice feature: read the reply aloud when playback is on.
      if (speakReplies) {
        setPlayingId(id);
        speak(reply.speech || stripMarkdown(reply.response), lang);
      }
    } catch {
      actions.addChatMessage({
        id: nextMessageId('error'),
        role: 'assistant',
        content:
          lang === 'hi'
            ? 'यह पढ़ने में दिक्कत हुई। दूसरे शब्दों में पूछें — जैसे "मेरा आवेदन कहाँ है?"'
            : lang === 'kn'
              ? 'ಇದನ್ನು ಓದಲು ತೊಂದರೆ. ಬೇರೆ ರೀತಿ ಕೇಳಿ — ಉದಾ "ನನ್ನ ಅರ್ಜಿ ಎಲ್ಲಿದೆ?"'
              : 'I hit a snag reading that. Try asking in a different way — for example "where is my application?"',
        timestamp: new Date(),
        intent: 'general',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Voice input: the transcript becomes the message, exactly like typing it.
  const speech = useSpeechRecognition(lang, transcript => void send(transcript));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const togglePlayback = () => {
    if (speakReplies) {
      stopSpeaking();
      setPlayingId(null);
      setSpeakReplies(false);
    } else {
      setSpeakReplies(true);
      // Immediately confirm the mode with a short spoken cue.
      speak(
        lang === 'hi' ? 'जवाब बोलकर सुनाए जाएँगे' : lang === 'kn' ? 'ಉತ್ತರ ಧ್ವನಿಯಲ್ಲಿ ಬರುತ್ತದೆ' : 'Replies will be read aloud',
        lang
      );
    }
  };

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-surface-500">
        {tts.offline}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 shadow-md shadow-primary-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-success-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-900">{tts.header}</h3>
            <p className="text-xs text-surface-500">{tts.sub}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePlayback}
            aria-pressed={speakReplies}
            title={speakReplies ? 'Stop playback' : 'Read replies aloud'}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
              speakReplies ? 'bg-primary-600 text-white' : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
            )}
          >
            {speakReplies ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <Badge variant="success" size="sm" dot>
            {lang === 'hi' ? 'ऑनलाइन' : lang === 'kn' ? 'ಆನ್‌ಲೈನ್' : 'Online'}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.map(message => (
          <MessageBubble
            key={message.id}
            message={message}
            playing={playingId === message.id}
            onPlay={() => {
              stopSpeaking();
              speak(stripMarkdown(message.content), lang);
              setPlayingId(message.id);
            }}
          />
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100">
              <Sparkles className="h-4 w-4 text-primary-600" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-surface-100 px-4 py-3">
              <ThoughtLine working fontSize={13} label={thinking.label} steps={thinking.steps} doneLabel={thinking.done} />
            </div>
          </div>
        )}

        {speech.listening && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-primary-300 bg-primary-50 px-4 py-3">
              <p className="flex items-center gap-2 text-sm text-primary-700">
                <span className="flex h-2 w-2 animate-pulse rounded-full bg-primary-500" />
                {speech.interim || (lang === 'hi' ? 'सुन रहे हैं…' : lang === 'kn' ? 'ಕೇಳುತ್ತಿದ್ದೇನೆ…' : 'Listening…')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quick questions — always available, collapsed to a scrollable row
          once the conversation gets going so manual typing stays primary. */}
      {!isLoading && (
        <div className="border-t border-surface-200 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {(messages.length <= 1 ? quick : quick.slice(5)).map(question => (
              <button
                key={question.label}
                type="button"
                onClick={() => void send(question.text)}
                className="rounded-full border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-surface-700 transition-all hover:-translate-y-0.5 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700"
              >
                {question.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer — free typing + mic are the primary interactions */}
      <form onSubmit={handleSubmit} className="border-t border-surface-200 p-3">
        {speech.error && (
          <p className="mb-2 rounded-lg bg-error-50 px-3 py-2 text-xs text-error-700">
            {speech.error === 'unsupported'
              ? lang === 'hi'
                ? 'इस ब्राउज़र में वॉइस इनपुट उपलब्ध नहीं है।'
                : lang === 'kn'
                  ? 'ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ವಾಯ್ಸ್ ಇನ್‌ಪುಟ್ ಲಭ್ಯವಿಲ್ಲ.'
                  : 'Voice input is not available in this browser — try Chrome or Edge.'
              : speech.error === 'denied'
                ? lang === 'hi'
                  ? 'माइक्रोफ़ोन की अनुमति बंद है — ब्राउज़र सेटिंग में चालू करें।'
                  : lang === 'kn'
                    ? 'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರ್ಬಂಧಿತ — ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ನಲ್ಲಿ ಸಕ್ರಿಯಗೊಳಿಸಿ.'
                    : 'Microphone access was blocked — enable it in your browser settings.'
                : lang === 'hi'
                  ? 'कुछ सुनाई नहीं दिया — फिर से कोशिश करें।'
                  : lang === 'kn'
                    ? 'ಏನೂ ಕೇಳಲಿಲ್ಲ — ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.'
                    : 'Nothing was heard — try again.'}
          </p>
        )}
        <div className="flex items-end gap-2">
          <Input
            value={speech.listening ? speech.interim || '…' : input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tts.placeholder}
            aria-label="Message the application assistant"
            className="flex-1"
            disabled={isLoading}
            autoComplete="off"
          />
          {speech.supported && (
            <button
              type="button"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              aria-label={speech.listening ? 'Stop listening' : 'Speak your question'}
              title={speech.listening ? 'Tap to stop' : 'Speak your question'}
              className={cn(
                'relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg transition-all',
                speech.listening
                  ? 'bg-error-600 text-white shadow-lg shadow-error-600/30'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              )}
            >
              {speech.listening ? (
                <>
                  <MicOff className="h-5 w-5" />
                  <span className="absolute inset-0 animate-ping rounded-lg bg-error-500/40" />
                </>
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          )}
          <Button type="submit" disabled={!input.trim() || isLoading} className="h-11 flex-shrink-0" aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-surface-400">
          <ShieldCheck className="h-3 w-3" />
          {tts.offline}
        </p>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  playing,
  onPlay,
}: {
  message: ChatMessage;
  playing: boolean;
  onPlay: () => void;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
      )}
      <div className={cn('max-w-[85%] space-y-1', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3',
            isUser ? 'rounded-br-sm bg-primary-600 text-white' : 'rounded-bl-sm bg-surface-100 text-surface-800'
          )}
        >
          {isUser ? <p className="whitespace-pre-wrap text-sm">{message.content}</p> : <RichText text={message.content} />}
        </div>
        {!isUser && (
          <div className="flex items-center gap-2 px-1">
            {message.signals && message.signals.length > 0 && (
              <p className="text-[11px] text-surface-400" title="Terms the intent classifier matched">
                {message.intent} · “{message.signals.join('”, “')}”
              </p>
            )}
            <button
              type="button"
              onClick={onPlay}
              title="Read this reply aloud"
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition-colors',
                playing ? 'bg-primary-100 text-primary-700' : 'text-surface-400 hover:bg-surface-100 hover:text-surface-600'
              )}
            >
              <Volume2 className="h-3 w-3" />
              {playing ? '…' : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
