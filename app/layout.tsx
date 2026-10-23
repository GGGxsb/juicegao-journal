import { pageMetadata } from './lib/seo';
import SiteMotion from './components/site-motion';
import "./globals.css";
import './components/site-motion.css';

export async function generateMetadata() {
  return { ...await pageMetadata('/'), icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' } };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}<SiteMotion/></body>
    </html>
  );
}
