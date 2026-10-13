import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { MetricsStrip } from './components/MetricsStrip';
import { FeaturesList } from './components/FeaturesList';
import { InteractiveShowcase } from './components/InteractiveShowcase';
import { TrustSection } from './components/TrustSection';
import { SaaSSection } from './components/SaaSSection';
import { Testimonials } from './components/Testimonials';
import { PricingSection } from './components/PricingSection';
import { FAQSection } from './components/FAQSection';
import { FinalCTA } from './components/FinalCTA';
import { Footer } from './components/Footer';
import { TrialModal } from './components/TrialModal';

export default function App() {
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

  const handleExploreModule = (moduleId: string) => {
    const el = document.getElementById('how-it-works');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* Sticky Navigation */}
      <Navbar
        onOpenTrialModal={handleOpenTrial}
        onOpenDemoModal={handleScrollToHowItWorks}
      />

      {/* Main Content Area */}
      <main className="flex-grow">
        {/* Hero with Interactive Dashboard Mockup */}
        <Hero
          onStartTrial={handleOpenTrial}
          onSeeHowItWorks={handleScrollToHowItWorks}
        />

        {/* Metrics Strip with Mandatory Demo Data Label */}
        <MetricsStrip />

        {/* 10 Concrete Modules & Proof Points */}
        <FeaturesList
          onOpenTrialModal={handleOpenTrial}
          onExploreModule={handleExploreModule}
        />

        {/* Interactive "See How It Works" Simulation Engine */}
        <InteractiveShowcase
          onStartTrial={handleOpenTrial}
        />

        {/* Trust Section: Derived Figures, Audit Logs, 12 Admin Roles */}
        <TrustSection />

        {/* SaaS Governance & Lifecycle (14-day trial, 60/30/14/7-day alerts) */}
        <SaaSSection
          onStartTrial={handleOpenTrial}
        />

        {/* Testimonials from 2 African Cities with Mandatory Illustrative Labels */}
        <Testimonials />

        {/* Pricing Teaser with Currency Switcher & Free Trial */}
        <PricingSection
          onStartTrial={handleOpenTrial}
        />

        {/* 4 Concrete FAQ Items */}
        <FAQSection />

        {/* Final Confident CTA */}
        <FinalCTA
          onStartTrial={handleOpenTrial}
          onSeeHowItWorks={handleScrollToHowItWorks}
        />
      </main>

      {/* Authority Footer */}
      <Footer />

      {/* Interactive 14-Day Free Trial Provisioning Modal */}
      <TrialModal
        isOpen={trialModalOpen}
        onClose={handleCloseTrial}
      />
    </div>
  );
}
