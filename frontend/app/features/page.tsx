import type { Metadata } from 'next';
import React from 'react';
import { LandingLayout } from '@/components/landing/LandingLayout';
import { FeaturesContent } from '@/components/landing/FeaturesContent';

export const metadata: Metadata = {
  title: 'The 20 core modules — TU Properties',
  description:
    'Properties and units, leasing, derived owner statements, payments and allocation, tax by jurisdiction, maintenance, utilities, HR and payroll — every module with the concrete rule it enforces.',
};

export default function FeaturesPage() {
  return (
    <LandingLayout>
      <FeaturesContent />
    </LandingLayout>
  );
}
