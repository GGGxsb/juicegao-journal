import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "JuiceGao's Blog", template: "%s · JuiceGao" },
  description: "JuiceGao 的个人网站。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
