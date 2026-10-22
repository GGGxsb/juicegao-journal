import { Fragment, type ReactNode } from "react";

export type MarkdownHeading = { id: string; text: string; level: number };

export function headingId(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-") || "section";
}

function nextHeadingId(text: string, used: Map<string, number>): string {
  const base = headingId(text);
  const count = (used.get(base) ?? 0) + 1;
  used.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

export function getMarkdownHeadings(content: string): MarkdownHeading[] {
  const used = new Map<string, number>();
  const headings: MarkdownHeading[] = [];
  let fenced = false;
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = /^(#{1,4})\s+(.+?)(?:\s+#+)?$/.exec(line);
    if (match) headings.push({ level: match[1].length, text: match[2], id: nextHeadingId(match[2], used) });
  }
  return headings;
}

function safeUrl(raw: string, image = false): string | undefined {
  const url = raw.trim();
  if (/[\u0000-\u0020\u007f\\]/.test(url)) return undefined;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (!image && /^#[^\s]*$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || (!image && parsed.protocol === "http:") || (!image && parsed.protocol === "mailto:")) return url;
  } catch { /* Invalid URLs stay readable text. */ }
  return undefined;
}

function inline(text: string, depth = 0): ReactNode[] {
  if (depth > 6) return [text];
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${depth}-${match.index}`;
    if (match[1] !== undefined) {
      const src = safeUrl(match[2], true);
      nodes.push(src ? <img key={key} src={src} alt={match[1]} loading="lazy" decoding="async" /> : <span key={key}>{match[1] || "图片链接不可用"}</span>);
    } else if (match[3] !== undefined) {
      const href = safeUrl(match[4]);
      const external = href && /^https?:/.test(href);
      nodes.push(href ? <a key={key} href={href} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{inline(match[3], depth + 1)}</a> : <span key={key}>{match[3]}</span>);
    } else if (match[5] !== undefined) nodes.push(<code key={key}>{match[5]}</code>);
    else if (match[6] !== undefined || match[7] !== undefined) nodes.push(<strong key={key}>{inline(match[6] ?? match[7], depth + 1)}</strong>);
    else nodes.push(<em key={key}>{inline(match[8] ?? match[9], depth + 1)}</em>);
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function isBlockStart(line: string): boolean {
  return /^(?:#{1,4}\s|\s*(?:```|~~~)|\s*>|\s*[-*+]\s|\s*\d+[.)]\s|\s*(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(line);
}

function blocks(content: string, used: Map<string, number>, prefix = ""): ReactNode[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue; }
    const key = `${prefix}${i}`;
    const fence = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(lines[i]);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      nodes.push(<div className="markdown-code" key={key}>{fence[2] && <div className="markdown-code-language">{fence[2]}</div>}<pre><code className={fence[2] ? `language-${fence[2]}` : undefined}>{code.join("\n")}</code></pre></div>);
      continue;
    }
    const heading = /^(#{1,4})\s+(.+?)(?:\s+#+)?$/.exec(lines[i]);
    if (heading) {
      const id = nextHeadingId(heading[2], used);
      const children = inline(heading[2]);
      if (heading[1].length === 1) nodes.push(<h1 key={key} id={id}>{children}</h1>);
      else if (heading[1].length === 2) nodes.push(<h2 key={key} id={id}>{children}</h2>);
      else if (heading[1].length === 3) nodes.push(<h3 key={key} id={id}>{children}</h3>);
      else nodes.push(<h4 key={key} id={id}>{children}</h4>);
      i++;
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])) {
      nodes.push(<hr key={key} />);
      i++;
      continue;
    }
    if (/^\s*>/.test(lines[i])) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
      nodes.push(<blockquote key={key}>{blocks(quote.join("\n"), used, `${key}-quote-`)}</blockquote>);
      continue;
    }
    const list = /^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(lines[i]);
    if (list) {
      const ordered = Boolean(list[2]);
      const items: ReactNode[] = [];
      const start = Number(list[2] || 1);
      while (i < lines.length) {
        const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(lines[i]);
        if (!item || Boolean(item[2]) !== ordered) break;
        const parts = [item[3]];
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !isBlockStart(lines[i])) parts.push(lines[i++].trim());
        items.push(<li key={`${key}-${items.length}`}>{inline(parts.join(" "))}</li>);
      }
      nodes.push(ordered ? <ol key={key} start={start}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    const paragraph: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) paragraph.push(lines[i++]);
    nodes.push(<p key={key}>{paragraph.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{inline(line)}</Fragment>)}</p>);
  }
  return nodes;
}

/** Renders a safe Markdown subset; source HTML is always escaped by React. */
export function Markdown({ content }: { content: string }) {
  return <div className="markdown">{blocks(content, new Map())}</div>;
}
