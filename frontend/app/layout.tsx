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
  title: "TU Properties — Multi-Tenant Property Management Platform",
  description:
    "Multi-tenant SaaS platform for property management companies, landlords, and letting agents across Africa and beyond. Run properties, tenants, money, and staff from one system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jakartaSans.variable} ${groteskDisplay.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
