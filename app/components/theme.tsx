'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ dark: boolean; toggle: () => void } | null>(null);

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem('journal-theme');
    return value === 'dark' || value === 'light' ? value : null;
  } catch { return null; }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const system = matchMedia('(prefers-color-scheme: dark)');
    let preference = savedTheme();
    function apply() {
      const value = preference ?? (system.matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = value;
      setDark(value === 'dark');
    }
    function storage(event: StorageEvent) {
      if (event.key !== 'journal-theme' && event.key !== null) return;
      preference = savedTheme();
      apply();
    }
    function changed() {
      preference = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      setDark(preference === 'dark');
    }
    apply();
    system.addEventListener('change', apply);
    window.addEventListener('storage', storage);
    window.addEventListener('journal-theme-change', changed);
    return () => {
      system.removeEventListener('change', apply);
      window.removeEventListener('storage', storage);
      window.removeEventListener('journal-theme-change', changed);
    };
  }, []);

  function toggle() {
    const value: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('journal-theme', value); } catch { /* The current theme still works without storage. */ }
    setDark(value === 'dark');
    window.dispatchEvent(new Event('journal-theme-change'));
  }

  return <ThemeContext.Provider value={{ dark, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle({ className = 'icon-button' }: { className?: string }) {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeToggle requires ThemeProvider');
  const label = theme.dark ? '切换浅色模式' : '切换深色模式';
  return <button type="button" className={className} onClick={theme.toggle} aria-label={label} title={label}>
    {theme.dark ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
  </button>;
}
