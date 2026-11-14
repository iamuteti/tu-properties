import type { Metadata } from 'next';
import React from 'react';
import { LandingLayout } from '@/components/landing/LandingLayout';
import { DemoAccountsSection } from '@/components/landing/DemoAccountsSection';

export const metadata: Metadata = {
  title: 'Demo accounts — TU Properties',
  description:
    'Sign in to a pre-seeded organization in each supported market and try the real workflows: rent, invoices, maintenance, owner statements and the tenant portal.',
  // The page publishes working logins to seeded organizations. Keep it out of
  // search results; it is a guided tour, not acquisition copy.
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return (
    <LandingLayout>
      <DemoAccountsSection />
    </LandingLayout>
  );
}
