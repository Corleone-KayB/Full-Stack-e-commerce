import * as React from 'react';

/**
 * Renders merchant-authored content.
 *
 * A deliberately tiny Markdown subset — headings, paragraphs, lists, bold,
 * italics and links — rendered into React elements. Raw HTML in the source is
 * NOT interpreted, so an admin account cannot inject script into the
 * storefront, and there is no `dangerouslySetInnerHTML` anywhere in this file.
 */

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // **bold**, *italic*, `code`, [label](href)
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-medium text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="rounded-xs bg-ink/6 px-1.5 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(token);
      if (linkMatch) {
        const href = linkMatch[2];
        // Only http(s) and site-relative links are rendered as links.
        const safe = /^(https?:\/\/|\/)/.test(href);
        nodes.push(
          safe ? (
            <a key={key} href={href} className="text-accent underline underline-offset-4">
              {linkMatch[1]}
            </a>
          ) : (
            <span key={key}>{linkMatch[1]}</span>
          ),
        );
      }
    } else {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function Prose({ content, className }: { content: string; className?: string }) {
  const blocks = content.split(/\n{2,}/);

  return (
    <div className={`space-y-5 text-[15px] leading-relaxed text-muted ${className ?? ''}`}>
      {blocks.map((block, index) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={index} className="pt-3 text-base font-medium tracking-tight text-ink">
              {inline(trimmed.slice(4), `h3-${index}`)}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={index} className="pt-5 font-display text-2xl tracking-tight text-ink">
              {inline(trimmed.slice(3), `h2-${index}`)}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={index} className="pt-5 font-display text-3xl tracking-tight text-ink">
              {inline(trimmed.slice(2), `h1-${index}`)}
            </h2>
          );
        }

        if (/^[-*]\s/.test(trimmed)) {
          const items = trimmed.split('\n').filter((line) => /^[-*]\s/.test(line.trim()));
          return (
            <ul key={index} className="ml-5 list-disc space-y-1.5">
              {items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item.trim().slice(2), `li-${index}-${itemIndex}`)}</li>
              ))}
            </ul>
          );
        }

        if (/^\d+\.\s/.test(trimmed)) {
          const items = trimmed.split('\n').filter((line) => /^\d+\.\s/.test(line.trim()));
          return (
            <ol key={index} className="ml-5 list-decimal space-y-1.5">
              {items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item.trim().replace(/^\d+\.\s/, ''), `oli-${index}-${itemIndex}`)}</li>
              ))}
            </ol>
          );
        }

        return <p key={index}>{inline(trimmed, `p-${index}`)}</p>;
      })}
    </div>
  );
}
