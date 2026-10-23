import type { Root, RootContent } from 'mdast';
import { visit } from 'unist-util-visit';
import 'remark-directive';

const kinds = new Set(['note', 'tip', 'info', 'warning', 'danger', 'details', 'tabs', 'tab', 'steps', 'step', 'gallery', 'github']);
export function remarkArticleComponents() {
  return (tree: Root) => {
    visit(tree, node => {
      if (!['containerDirective', 'leafDirective', 'textDirective'].includes(node.type)) return;
      const directive = node as RootContent & {name:string; attributes?:Record<string,string|null>};
      if (node.type === 'textDirective') { directive.data = { ...directive.data, hName: 'span' }; return; }
      // User attributes are never forwarded as HTML/event attributes.
      if (!kinds.has(directive.name)) { directive.data = { ...directive.data, hName: 'div' }; return; }
      const attributes = directive.attributes || {};
      directive.data = { ...directive.data, hName: 'div', hProperties: {
        'data-article-kind': directive.name,
        'data-article-title': (attributes.title || attributes.label || '').slice(0, 180),
        'data-article-repo': (attributes.repo || '').slice(0, 150),
        'data-article-description': (attributes.description || '').slice(0, 500),
        'data-article-open': attributes.open === 'true' ? 'true' : 'false',
      } };
    });
  };
}
