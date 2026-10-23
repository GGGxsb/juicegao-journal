import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import type { Element, RootContent } from 'hast';
import { markdownRemarkPlugins, safeMarkdownUrl } from './markdown-model';
import MarkdownCode from './markdown-code';
import ArticleComponent from './article-components';
import 'katex/dist/katex.min.css';
import './markdown.css';

export { getMarkdownHeadings, headingId, type MarkdownHeading } from './markdown-model';

function codeText(node: Element | RootContent): string {
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map(codeText).join('') : '';
}

const components: Components = {
  div({node,children,...props}) {
    const property=(key:string)=>String(node?.properties?.[key]??'');
    const kind=property('data-article-kind');
    if(!kind)return <div {...props}>{children}</div>;
    return <ArticleComponent kind={kind} title={property('data-article-title')} repo={property('data-article-repo')} description={property('data-article-description')} initialOpen={property('data-article-open')==='true'} syncKey={property('data-article-sync-key')} galleryGap={Number(property('data-article-gap')||12)} galleryRatio={Number(property('data-article-ratio')||0)}>{children}</ArticleComponent>;
  },
  a({ node: _node, href, children, ...props }) {
    if (!href) return <span>{children}</span>;
    const external = /^https?:/i.test(href);
    return <a {...props} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
  },
  img({ node: _node, src, alt, ...props }) {
    return src ? <img {...props} src={src} alt={alt ?? ''} loading="lazy" decoding="async" /> : <span>{alt || '图片链接不可用'}</span>;
  },
  table({ node: _node, ...props }) {
    return <div className="markdown-table" tabIndex={0} role="region" aria-label="数据表格"><table {...props} /></div>;
  },
  pre({ node, children, ...props }) {
    const code = node?.children.find((child): child is Element => child.type === 'element' && child.tagName === 'code');
    if (!code) return <pre {...props}>{children}</pre>;
    const classes = Array.isArray(code.properties.className) ? code.properties.className : [];
    const language = classes.map(String).find(value => value.startsWith('language-'))?.slice(9) ?? '';
    return <MarkdownCode code={codeText(code).replace(/\n$/, '')} language={language} />;
  },
};

/** Source HTML is text, never parsed or injected. KaTeX runs with trust disabled. */
export function Markdown({ content }: { content: string }) {
  return <div className="markdown"><ReactMarkdown
    remarkPlugins={markdownRemarkPlugins}
    rehypePlugins={[[rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20 }]]}
    remarkRehypeOptions={{ footnoteLabel: '注释', footnoteBackLabel: '返回正文' }}
    urlTransform={(url, key) => safeMarkdownUrl(url, key === 'src')}
    components={components}
  >{content}</ReactMarkdown></div>;
}
