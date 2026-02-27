import type { ReactNode } from "react";

type Props = {
  content: string;
  className?: string;
};

const TABLE_SEPARATOR_RE = /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/;

function normalizeTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url, "https://local.invalid");
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let index = 0;

  const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(([^)]+)\))/;
  while (remaining.length > 0) {
    const match = remaining.match(tokenRe);
    if (!match || match.index === undefined) {
      nodes.push(remaining);
      break;
    }

    if (match.index > 0) {
      nodes.push(remaining.slice(0, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${index++}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), `${key}-b`)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key}>{renderInline(token.slice(1, -1), `${key}-i`)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const closeBracket = token.indexOf("](");
      const label = token.slice(1, closeBracket);
      const href = token.slice(closeBracket + 2, -1).trim();
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-[var(--color-accent)] underline-offset-2"
          >
            {renderInline(label, `${key}-l`)}
          </a>
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(token);
    }

    remaining = remaining.slice(match.index + token.length);
  }

  return nodes;
}

export default function MarkdownContent({ content, className }: Props) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;

  const pushParagraph = (paragraphLines: string[]) => {
    const text = paragraphLines.join(" ").trim();
    if (!text) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-6">
        {renderInline(text, `p-${blocks.length}`)}
      </p>
    );
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const lang = trimmed.replace(/^```/, "").trim();
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) {
        i += 1;
      }
      blocks.push(
        <div key={`code-${blocks.length}`} className="overflow-x-auto rounded-lg border border-black/10 bg-[#0f172a]">
          {lang ? <div className="border-b border-white/10 px-3 py-2 text-xs text-slate-300">{lang}</div> : null}
          <pre className="p-3 text-xs leading-5 text-slate-100">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>
      );
      continue;
    }

    if (trimmed.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1].trim())) {
      const header = normalizeTableRow(lines[i]);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim().length > 0) {
        bodyRows.push(normalizeTableRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={`table-${blocks.length}`} className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                {header.map((cell, idx) => (
                  <th key={idx} className="border border-black/10 bg-black/5 px-2 py-1 text-left font-semibold">
                    {renderInline(cell, `th-${blocks.length}-${idx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {header.map((_, cellIdx) => (
                    <td key={cellIdx} className="border border-black/10 px-2 py-1 align-top">
                      {renderInline(row[cellIdx] ?? "", `td-${blocks.length}-${rowIdx}-${cellIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const Tag = (level === 1 ? "h1" : level === 2 ? "h2" : "h3") as "h1" | "h2" | "h3";
      const classByLevel = {
        h1: "text-base font-semibold",
        h2: "text-sm font-semibold",
        h3: "text-sm font-medium"
      };
      blocks.push(
        <Tag key={`h-${blocks.length}`} className={classByLevel[Tag]}>
          {renderInline(text, `h-${blocks.length}`)}
        </Tag>
      );
      i += 1;
      continue;
    }

    if (/^>\s+/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote key={`q-${blocks.length}`} className="border-l-2 border-[var(--color-accent)] pl-3 text-[var(--color-ink-soft)]">
          {quoteLines.map((quoteLine, idx) => (
            <p key={idx}>{renderInline(quoteLine, `q-${blocks.length}-${idx}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ul-${blocks.length}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal space-y-1 pl-5">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item, `ol-${blocks.length}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i].trim()) &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^>\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().includes("|") && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1].trim()))
    ) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    pushParagraph(paragraphLines);
  }

  return <div className={className ? className : "space-y-2"}>{blocks}</div>;
}

