'use client';

import React from 'react';
import { Hero } from './Hero';
import { InteractiveShowcase } from './InteractiveShowcase';
import { PricingSection } from './PricingSection';
import { FAQSection } from './FAQSection';
import { FinalCTA } from './FinalCTA';
import { useTrial } from './trial-context';

const scrollToHowItWorks = () => {
  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
};

/**
 * The landing page proper. Five blocks, each making one argument once:
 * promise → working demo → price → objections → signup.
 */
export const HomeContent: React.FC = () => {
  const { openTrial } = useTrial();

  return (
    <>
      <Hero onStartTrial={() => openTrial()} onSeeHowItWorks={scrollToHowItWorks} />
      <InteractiveShowcase onStartTrial={() => openTrial()} />
      <PricingSection onStartTrial={openTrial} />
      <FAQSection />
      <FinalCTA onStartTrial={() => openTrial()} />
    </>
  );
};
