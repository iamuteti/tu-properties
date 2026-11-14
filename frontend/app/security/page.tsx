import type { Metadata } from 'next';
import React from 'react';
import { LandingLayout } from '@/components/landing/LandingLayout';
import { TrustSection } from '@/components/landing/TrustSection';

export const metadata: Metadata = {
  title: 'Derived accounting and access control — TU Properties',
  description:
    'Why every figure is computed from records rather than typed: the derived ledger, the append-only audit trail, and the thirteen system roles with their read, write and restricted permissions.',
};

export default function SecurityPage() {
  return (
    <LandingLayout>
      <TrustSection />
    </LandingLayout>
  );
}
