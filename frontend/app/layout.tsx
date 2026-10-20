import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk, Geist_Mono } from "next/font/google";
import { Toaster } from 'sonner';
import "./globals.css";
import Providers from "./providers";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-brand-sans",
  subsets: ["latin"],
});

const groteskDisplay = Space_Grotesk({
  variable: "--font-brand-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TU Properties — Multi-Market Property Management Platform",
  description:
    "Multi-market SaaS platform for property management companies, landlords, and institutional owners across fifteen jurisdictions. One organization per market, with its own currency, locale, and tax rules. Run properties, tenants, money, and staff from one system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Theme class is applied by next-themes after hydration; suppress the
    // mismatch warning it would otherwise log on every first paint.
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${jakartaSans.variable} ${groteskDisplay.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
