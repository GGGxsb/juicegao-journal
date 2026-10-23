import type { Root, RootContent } from 'mdast';
import { visit } from 'unist-util-visit';
import 'remark-directive';

const aliases:Record<string,string>={aside:'note',caution:'warning',collapse:'details','image-group':'gallery'};
const kinds = new Set(['note', 'tip', 'info', 'warning', 'danger', 'details', 'tabs', 'tab', 'steps', 'step', 'gallery', 'github']);
export function remarkArticleComponents() {
  return (tree: Root) => {
    visit(tree, node => {
      if (!['containerDirective', 'leafDirective', 'textDirective'].includes(node.type)) return;
      const directive = node as RootContent & {name:string; attributes?:Record<string,string|null>};
      if (node.type === 'textDirective') { directive.data = { ...directive.data, hName: 'span' }; return; }
      // User attributes are never forwarded as HTML/event attributes.
      const kind=Object.hasOwn(aliases,directive.name)?aliases[directive.name]:directive.name;
      if (!kinds.has(kind)) { directive.data = { ...directive.data, hName: 'div' }; return; }
      const attributes = directive.attributes || {};
      const gap=Number(attributes.gap??12),ratio=Number(attributes.aspectRatio??attributes['aspect-ratio']??0);
      directive.data = { ...directive.data, hName: 'div', hProperties: {
        'data-article-kind': kind,
        'data-article-title': (attributes.title || attributes.label || '').slice(0, 180),
        'data-article-repo': (attributes.repo || '').slice(0, 150),
        'data-article-description': (attributes.description || '').slice(0, 500),
        'data-article-open': attributes.open === 'true' ? 'true' : 'false',
        'data-article-sync-key': (attributes.syncKey||attributes['sync-key']||'').trim().slice(0,100),
        'data-article-gap': String(Number.isFinite(gap)?Math.min(48,Math.max(0,gap)):12),
        'data-article-ratio': String(Number.isFinite(ratio)&&ratio>=0.2&&ratio<=5?ratio:0),
      } };
    });
  };
}
