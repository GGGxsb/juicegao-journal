/** Render the real shared component without loading browser styles in Node. */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { register } from 'tsx/esm/api';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const styles = registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith('.css') ? { format: 'module', source: 'export default {}', shortCircuit: true } : nextLoad(url, context);
  },
});
const unregister = register();
const { Markdown, getMarkdownHeadings, headingId } = await import('../app/components/markdown.tsx');
const { safeMarkdownUrl } = await import('../app/components/markdown-model.ts');
const { highlightCode } = await import('../app/components/markdown-highlight.ts');
const render = content => renderToStaticMarkup(createElement(Markdown, { content }));
let checks = 0;
function passed(label) { console.log(`PASS ${label}`); checks++; }

try {
  const headingSource = [
    '# 中文标题', '## 中文标题', '### 中文标题-2', '#### [链接](https://example.com) 与 **粗体**',
    '##### 五级 `代码`', '###### 六级', 'Setext 标题', '===',
    '> ## 引用标题', '', '    # 缩进代码不是标题', '',
    '````markdown', '# 围栏里不是标题', '```', '## 仍在围栏里', '````',
    '~~~text', '# 波浪围栏里不是标题', '~~~', '# footnote-label',
  ].join('\n');
  const headings = getMarkdownHeadings(headingSource);
  assert.deepEqual(headings.map(item => item.id), ['中文标题', '中文标题-2', '中文标题-2-2', '链接-与-粗体', '五级-代码', '六级', 'setext-标题', '引用标题', 'footnote-label-2']);
  const renderedHeadings = [...render(headingSource).matchAll(/<h([1-6])\b[^>]*\bid="([^"]+)"/g)].map(match => ({ level: Number(match[1]), id: match[2] }));
  assert.deepEqual(renderedHeadings, headings.map(({ level, id }) => ({ level, id })), 'TOC entries and DOM anchors must agree exactly.');
  assert.equal(headingId('  中文 Heading!  '), '中文-heading');
  assert.equal(new Set(headings.map(item => item.id)).size, headings.length);
  passed('Chinese, duplicate, formatted, Setext and h1–h6 headings match rendered anchors; code headings are ignored');

  const gfm = render('| 名称 | 数量 |\n| :--- | ---: |\n| 测试 | 2 |\n\n- [x] 完成\n- [ ] 待办\n  - 子项\n    1. 有序子项\n\n~~已删除~~ 与 https://example.com\n\n说明[^note]\n\n[^note]: 这是一条脚注');
  for (const fragment of ['<table>', '<th', '<del>已删除</del>', 'type="checkbox"', 'checked=""', 'disabled=""', 'task-list-item', '<ol>', 'data-footnote-ref', 'class="footnotes"', '这是一条脚注']) assert.ok(gfm.includes(fragment), `Missing GFM output: ${fragment}`);
  assert.match(gfm, /href="https:\/\/example\.com"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.ok(render('第一行\n第二行').includes('<br/>'), 'Existing authored line breaks must be retained.');
  passed('GFM tables, nested and task lists, strikethrough, autolinks, footnotes and existing line breaks render');

  const math = render('行内 $E=mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac13\n$$');
  assert.match(math, /class="katex"/);
  assert.match(math, /class="katex-display"/);
  assert.match(math, /<math\b/);
  const untrustedMath = render('$\\href{javascript:alert(1)}{危险链接}$\n\n$\\htmlClass{injected}{内容}$');
  assert.doesNotMatch(untrustedMath, /href="javascript:|class="injected"|<script/i);
  passed('Inline and display mathematics render with accessible MathML; untrusted KaTeX extensions stay disabled');

  const hostile = render('<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[脚本](<javascript:alert(1)>)\n\n[数据](data:text/html;base64,SGk=)\n\n![图片](data:image/svg+xml,unsafe)\n\n[外站](//evil.example/path)\n\n[反斜线](/\\evil.example)');
  const hostileTags = [...hostile.matchAll(/<[^>]+>/g)].map(match => match[0]).join('');
  assert.doesNotMatch(hostileTags, /<script\b|<img\b|\shref="(?:javascript:|data:|\/\/|\/%5c)|\sonerror=/i);
  assert.ok(hostile.includes('&lt;script&gt;'), 'Raw HTML must remain escaped text.');
  for (const value of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,unsafe', 'vbscript:evil', '//evil.example', '/\\evil.example', '/%5Cevil.example', '/%2Fevil.example', 'java\nscript:evil']) assert.equal(safeMarkdownUrl(value), undefined, value);
  for (const value of ['/posts/a', '#section', 'https://example.com', 'http://example.com', 'mailto:hi@example.com']) assert.equal(safeMarkdownUrl(value), value);
  assert.equal(safeMarkdownUrl('http://example.com/image.png', true), undefined);
  assert.equal(safeMarkdownUrl('/media/test.png', true), '/media/test.png');
  passed('Source HTML never executes and dangerous link/image URLs are removed');

  const code = 'const greeting = "中文 <script> & text";\nconsole.log(greeting);';
  const codeHtml = render('```ts\n' + code + '\n```');
  assert.ok(codeHtml.includes('aria-label="复制代码"'));
  assert.ok(codeHtml.includes('language-ts'));
  assert.ok(codeHtml.includes('&lt;script&gt;'));
  assert.doesNotMatch(codeHtml, /<script\b/);
  const tokens = await highlightCode(code, 'ts');
  assert.ok(tokens);
  assert.equal(tokens.map(line => line.map(token => token.content).join('')).join('\n'), code, 'Highlighting must preserve every authored character.');
  assert.ok(tokens.flat().some(token => token.variants.light?.color !== token.variants.dark?.color), 'Both light and dark themes must be available.');
  assert.equal(await highlightCode(code, 'unknown-language'), null);
  assert.equal(await highlightCode('x'.repeat(50_001), 'js'), null);
  for (const language of ['js', 'tsx', 'json', 'html', 'css', 'python', 'bash', 'sql', 'yaml', 'markdown']) assert.ok(await highlightCode('hello', language), language);
  passed('SSR code stays escaped and copyable; Shiki preserves source with light/dark tokens and safe fallbacks');

  console.log(`Markdown verification passed: ${checks} groups.`);
} finally {
  await unregister();
  styles.deregister();
}
