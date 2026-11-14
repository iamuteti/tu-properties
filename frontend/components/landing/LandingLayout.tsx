'use client';

import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { TrialProvider } from './trial-context';

/**
 * Chrome shared by every public marketing route: navbar, footer and the trial
 * modal. Pages stay server components so each one can export its own metadata;
 * only this shell and the interactive sections are client components.
 */
export const LandingLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TrialProvider>
    <div className="landing min-h-screen bg-canvas text-ink dark:text-ink flex flex-col selection:bg-brand-500/30 selection:text-brand-600">
      <Navbar />
      <main className="flex-grow">{children}</main>
      <Footer />
    </div>
  </TrialProvider>
);
