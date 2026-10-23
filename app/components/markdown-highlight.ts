import { createHighlighterCore, type HighlighterCore, type ThemedTokenWithVariants } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

// Explicit imports avoid shipping every Shiki grammar or a WebAssembly engine.
const languages = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
};
type Language = keyof typeof languages;
const aliases: Record<string, Language> = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', yml: 'yaml', md: 'markdown', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', rs: 'rust' };
let highlighter: Promise<HighlighterCore> | undefined;
const pendingLanguages = new Map<Language, Promise<void>>();

function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

export async function highlightCode(code: string, label: string): Promise<ThemedTokenWithVariants[][] | null> {
  const name = label.toLowerCase();
  const language = Object.hasOwn(languages, name) ? name as Language : aliases[name];
  // Large or unknown code remains readable and copyable without expensive work.
  if (!language || code.length > 50_000 || code.split('\n').length > 1000) return null;
  const instance = await getHighlighter();
  let pending = pendingLanguages.get(language);
  if (!pending) {
    pending = instance.loadLanguage(languages[language]());
    pendingLanguages.set(language, pending);
  }
  await pending;
  return instance.codeToTokensWithThemes(code, { lang: language, themes: { light: 'github-light', dark: 'github-dark' } });
}
