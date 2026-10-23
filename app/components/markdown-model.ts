import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import remarkDirective from 'remark-directive';
import { remarkArticleComponents } from './markdown-directives';
import { visit } from 'unist-util-visit';
import type { Root, Nodes } from 'mdast';

export type MarkdownHeading = { id: string; text: string; level: number };

function plainText(node: Nodes): string {
  if (node.type === 'html') return '';
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
  if ('value' in node) return node.value;
  if (node.type === 'break') return ' ';
  return 'children' in node ? node.children.map(plainText).join('') : '';
}

/** Stable Unicode anchors; formatting is removed before this function is used. */
export function headingId(text: string): string {
  return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-') || 'section';
}

function collectHeadings(tree: Root): MarkdownHeading[] {
  // Also reserve the automatic GFM footnote heading to keep every DOM ID unique.
  const used = new Set(['footnote-label']);
  const headings: MarkdownHeading[] = [];
  const hiddenHeadings = new WeakSet<object>();
  function markHidden(node: Nodes, hidden = false) {
    const inside = hidden || ('name' in node && ['details', 'collapse', 'tabs', 'tab'].includes(String(node.name)));
    if (inside && node.type === 'heading') hiddenHeadings.add(node);
    if ('children' in node) node.children.forEach(child => markHidden(child as Nodes, inside));
  }
  markHidden(tree);
  visit(tree, 'heading', node => {
    const text = plainText(node).replace(/\s+/g, ' ').trim();
    const base = headingId(text);
    let id = base;
    let suffix = 2;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
    if (!hiddenHeadings.has(node)) headings.push({ id, text, level: node.depth });
  });
  return headings;
}

function remarkHeadingIds() {
  return (tree: Root) => { collectHeadings(tree); };
}

/** Rendering and navigation deliberately use the exact same syntax and anchors. */
export const markdownRemarkPlugins = [remarkGfm, remarkMath, remarkBreaks, remarkDirective, remarkArticleComponents, remarkHeadingIds];

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkDirective);

export function getMarkdownHeadings(content: string): MarkdownHeading[] {
  return collectHeadings(parser.parse(content));
}

/** Do not allow script/data URLs, protocol-relative URLs or browser backslashes. */
export function safeMarkdownUrl(raw: string, image = false): string | undefined {
  const url = raw.trim();
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return undefined;
  // The Markdown parser percent-encodes backslashes before urlTransform runs.
  let decoded: string;
  try { decoded = decodeURIComponent(url); } catch { return undefined; }
  if (/[\u0000-\u001f\u007f\\]/.test(decoded) || decoded.startsWith('//')) return undefined;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (!image && url.startsWith('#')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || (!image && ['http:', 'mailto:'].includes(parsed.protocol))) return url;
  } catch { /* Unsupported relative and malformed URLs remain readable text. */ }
  return undefined;
}
