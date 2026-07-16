import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import "./globals.css";

const huiwenMincho = localFont({
  src: "../../匯文明朝體.ttf",
  variable: "--font-huiwen-mincho",
  display: "swap",
  weight: "400",
  style: "normal",
  preload: false,
  fallback: [],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "MyTesla2026Journey",
  description: "A bilingual 2026 journey across America's Supercharger network. 记录 2026 年的美国超级充电站之旅。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={huiwenMincho.variable} lang="en" suppressHydrationWarning>
      <body className="font-ui">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
