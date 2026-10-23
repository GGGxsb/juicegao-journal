'use client';

import { Fragment, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ThemedTokenWithVariants } from 'shiki/core';

type CodeProps = { code: string; language: string };

export default function MarkdownCode({ code, language }: CodeProps) {
  const [highlighted, setHighlighted] = useState<{ code: string; language: string; tokens: ThemedTokenWithVariants[][] } | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!language || code.length > 50_000) return;
    let active = true;
    // Highlighting is progressive: the server and first client render both show
    // plain code. No engine or grammar is downloaded for a prose-only article.
    import('./markdown-highlight').then(module => module.highlightCode(code, language))
      .then(tokens => { if (active && tokens) setHighlighted({ code, language, tokens }); })
      .catch(() => { /* An unsupported grammar never prevents reading code. */ });
    return () => { active = false; };
  }, [code, language]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try { await navigator.clipboard.writeText(code); setCopyState('copied'); }
    catch { setCopyState('failed'); }
    timer.current = setTimeout(() => setCopyState('idle'), 2000);
  }

  const tokens = highlighted?.code === code && highlighted.language === language ? highlighted.tokens : null;
  return <div className="markdown-code">
    <div className="markdown-code-toolbar"><span>{language || '纯文本'}</span><button type="button" onClick={() => void copy()} aria-label="复制代码">复制代码</button><span className="markdown-copy-status" role="status">{copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败，请手动选择代码' : ''}</span></div>
    <pre tabIndex={0} aria-label={language ? `${language} 代码` : '代码'}><code className={language ? `language-${language}` : undefined}>{tokens ? tokens.map((line, lineIndex) => <Fragment key={lineIndex}>{lineIndex > 0 && '\n'}{line.map((token, index) => <span key={index} className="markdown-code-token" style={{ '--code-light': token.variants.light?.color, '--code-dark': token.variants.dark?.color, fontStyle: (token.variants.light?.fontStyle ?? 0) & 1 ? 'italic' : undefined, fontWeight: (token.variants.light?.fontStyle ?? 0) & 2 ? 600 : undefined } as CSSProperties}>{token.content}</span>)}</Fragment>) : code}</code></pre>
  </div>;
}
