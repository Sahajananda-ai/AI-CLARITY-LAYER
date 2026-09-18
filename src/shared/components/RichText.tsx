import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

/**
 * Minimal, XSS-safe formatter for assistant replies.
 *
 * The chat engine emits light markdown (`**bold**`, `*italic*`, `• ` bullets,
 * `---` dividers). We render it into real elements instead of injecting HTML,
 * so nothing from a file name or applicant input can ever execute.
 */

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(INLINE_PATTERN)
    .filter(part => part !== '')
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={key} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return (
          <em key={key} className="italic">
            {part.slice(1, -1)}
          </em>
        );
      }
      return <span key={key}>{part}</span>;
    });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-1.5 space-y-1">
        {listBuffer.map((item, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-[0.45rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current opacity-40" />
            <span className="flex-1">{renderInline(item, `li-${blocks.length}-${index}`)}</span>
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('• ')) {
      listBuffer.push(trimmed.slice(2));
      return;
    }

    flushList();

    if (trimmed === '---') {
      blocks.push(<hr key={`hr-${index}`} className="my-3 border-current opacity-15" />);
      return;
    }

    if (trimmed === '') return;

    blocks.push(
      <p key={`p-${index}`} className="mb-2 last:mb-0 leading-relaxed">
        {renderInline(trimmed, `p-${index}`)}
      </p>
    );
  });

  flushList();

  return <div className={cn('text-sm', className)}>{blocks}</div>;
}
