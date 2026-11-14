import type { Metadata } from 'next';
import React from 'react';
import { LandingLayout } from '@/components/landing/LandingLayout';
import { ContactSection } from '@/components/landing/ContactSection';

export const metadata: Metadata = {
  title: 'Contact — TU Properties',
  description:
    'Ask about procurement, invoicing, data migration or a market that is not listed yet. Messages go straight to the platform operator queue.',
};

export default function ContactPage() {
  return (
    <LandingLayout>
      <ContactSection />
    </LandingLayout>
  );
}
