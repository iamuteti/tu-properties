'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { MetricsStrip } from '@/components/landing/MetricsStrip';
import { FeaturesList } from '@/components/landing/FeaturesList';
import { InteractiveShowcase } from '@/components/landing/InteractiveShowcase';
import { TrustSection } from '@/components/landing/TrustSection';
import { SaaSSection } from '@/components/landing/SaaSSection';
import { Testimonials } from '@/components/landing/Testimonials';
import { DemoAccountsSection } from '@/components/landing/DemoAccountsSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { ContactSection } from '@/components/landing/ContactSection';
import { FinalCTA } from '@/components/landing/FinalCTA';
import { Footer } from '@/components/landing/Footer';
import { TrialModal } from '@/components/landing/TrialModal';

/**
 * Public marketing site — the only route in the app that must never require a
 * session. It deliberately reads no auth state: `useAuth()` redirects
 * unauthenticated visitors to `/auth/login`, so touching it here would bounce
 * every prospect off the landing page. "Sign in" is a plain link; "Start trial"
 * opens the real signup form, which POSTs to the public `/platform/signup`.
 */
export default function LandingPage() {
  const [trialModalOpen, setTrialModalOpen] = useState(false);

  const handleOpenTrial = () => {
    setTrialModalOpen(true);
  };

  const handleCloseTrial = () => {
    setTrialModalOpen(false);
  };

  const handleScrollToHowItWorks = () => {
    const el = document.getElementById('how-it-works');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleExploreModule = () => {
    const el = document.getElementById('how-it-works');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="landing min-h-screen bg-slate-50 dark:bg-[#070B14] text-slate-900 dark:text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      <Navbar
        onOpenTrialModal={handleOpenTrial}
        onOpenDemoModal={handleScrollToHowItWorks}
      />

      <main className="flex-grow">
        <Hero
          onStartTrial={handleOpenTrial}
          onSeeHowItWorks={handleScrollToHowItWorks}
        />

        <MetricsStrip />

        <FeaturesList
          onOpenTrialModal={handleOpenTrial}
          onExploreModule={handleExploreModule}
        />

        <InteractiveShowcase onStartTrial={handleOpenTrial} />

        <TrustSection />

        <SaaSSection onStartTrial={handleOpenTrial} />

        <Testimonials />

        <DemoAccountsSection />

        <PricingSection onStartTrial={handleOpenTrial} />

        <FAQSection />

        <ContactSection />

        <FinalCTA
          onStartTrial={handleOpenTrial}
          onSeeHowItWorks={handleScrollToHowItWorks}
        />
      </main>

      <Footer />

      <TrialModal isOpen={trialModalOpen} onClose={handleCloseTrial} />
    </div>
  );
}
