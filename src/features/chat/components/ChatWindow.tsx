import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ChatMessage } from '../../../shared/types/common';
import { useApp } from '../../../contexts/AppContext';
import { generateChatResponse, createWelcomeMessage } from '../engine';
import { Badge, Button, Input, RichText } from '../../../shared/components';
import { Send, Sparkles, ShieldCheck } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';

const THINKING_STEPS = [
  'Reading your application…',
  'Checking document status…',
  'Working out the dates…',
];

/**
 * Quick questions rotate: the first five are status-oriented (what a fresh
 * applicant needs), the rest cover repayment, missed payments and policy so
 * the deeper questions are discoverable without typing.
 */
const QUICK_QUESTIONS = [
  { label: "Where's my application?", text: "Where's my application right now?" },
  { label: 'Which docs are pending?', text: 'Which documents are still pending?' },
  { label: 'When will I hear back?', text: 'When will I hear back?' },
  { label: 'How much will it cost?', text: 'How much will it cost me per month?' },
  { label: 'What would improve my score?', text: 'What would improve my score?' },
  { label: 'How do I repay?', text: 'How do I repay the loan?' },
  { label: "What if I miss a month?", text: 'What happens if I miss one month repayment?' },
  { label: 'What does the policy cover?', text: 'What does the policy cover and what are the benefits?' },
  { label: 'What are the criteria?', text: 'What are the criteria of repayment and eligibility?' },
  { label: 'How to become more eligible?', text: 'How can I become more eligible if my score is low?' },
];

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
  const { applicant, journeyType, eligibilityResult, uploadedDocuments, chatMessages, lifecycle, submitted } = state;

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ready = Boolean(applicant && journeyType);

  // Normally seeded by the reducer on submit; this covers a session that was
  // persisted before the greeting existed (or a direct visit to /dashboard).
  const fallbackGreeting = useMemo(
    () => (ready && applicant && journeyType ? createWelcomeMessage(journeyType, applicant) : null),
    [ready, applicant, journeyType]
  );
  const messages = chatMessages.length > 0 ? chatMessages : fallbackGreeting ? [fallbackGreeting] : [];

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length, isLoading]);

  // Cycle the "what am I doing" copy while the reply is being prepared.
  useEffect(() => {
    if (!isLoading) return;
    const timer = window.setInterval(() => {
      setThinkingStep(step => (step + 1) % THINKING_STEPS.length);
    }, 900);
    return () => window.clearInterval(timer);
  }, [isLoading]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || isLoading || !applicant || !journeyType) return;

    setInput('');
    setThinkingStep(0);
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
      });

      actions.addChatMessage({
        id: nextMessageId('assistant'),
        role: 'assistant',
        content: reply.response,
        timestamp: new Date(),
        intent: reply.intent,
        signals: reply.signals,
        confidence: reply.confidence,
      });
    } catch {
      actions.addChatMessage({
        id: nextMessageId('error'),
        role: 'assistant',
        content: 'I hit a snag reading that. Try asking in a different way — for example "where is my application?"',
        timestamp: new Date(),
        intent: 'general',
      });
    } finally {
      setIsLoading(false);
    }
  };

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

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-surface-500">
        The assistant unlocks once your application details are in.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-success-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-surface-900">Paytm Application Assistant</h3>
            <p className="text-xs text-surface-500">Replies instantly • reads your live file</p>
          </div>
        </div>
        <Badge variant="success" size="sm" dot>
          Online
        </Badge>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && (
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100">
              <Sparkles className="h-4 w-4 text-primary-600" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-surface-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex gap-1">
                  {[0, 1, 2].map(index => (
                    <span
                      key={index}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-surface-400"
                      style={{ animationDelay: `${index * 120}ms` }}
                    />
                  ))}
                </span>
                <span className="text-xs text-surface-500">{THINKING_STEPS[thinkingStep]}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick questions — always available, collapsed to a scrollable row
          once the conversation gets going so manual typing stays primary. */}
      {!isLoading && (
        <div className="border-t border-surface-200 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-surface-500">Try asking — or just type below</p>
          <div className="flex flex-wrap gap-2">
            {(messages.length <= 1 ? QUICK_QUESTIONS : QUICK_QUESTIONS.slice(5)).map(question => (
              <button
                key={question.label}
                type="button"
                onClick={() => void send(question.text)}
                className="rounded-full border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-surface-700 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700"
              >
                {question.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer — free typing is the primary interaction */}
      <form onSubmit={handleSubmit} className="border-t border-surface-200 p-3">
        <div className="flex items-end gap-2">
          <Input
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about status, documents, cost, repayment, missed payments…"
            aria-label="Message the application assistant"
            className="flex-1"
            disabled={isLoading}
            autoComplete="off"
          />
          <Button type="submit" disabled={!input.trim() || isLoading} className="h-11 flex-shrink-0" aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-surface-400">
          <ShieldCheck className="h-3 w-3" />
          Ask anything in your own words — replies are computed from your application data, offline.
        </p>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'justify-end')}>
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100">
          <Sparkles className="h-4 w-4 text-primary-600" />
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
        {!isUser && message.signals && message.signals.length > 0 && (
          <p className="px-1 text-[11px] text-surface-400" title="Terms the intent classifier matched">
            understood: {message.intent} · matched “{message.signals.join('”, “')}”
          </p>
        )}
      </div>
    </div>
  );
}
