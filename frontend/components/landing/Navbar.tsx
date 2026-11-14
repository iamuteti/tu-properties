'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building2, ChevronDown, ArrowRight, Menu, X, Layers, KeyRound, ShieldCheck, Calculator, Globe2, UserCheck } from 'lucide-react';
import { ThemeToggle } from '../layout/theme-toggle';
import { useTrial } from './trial-context';

/**
 * The public site's navbar.
 *
 * Two colours only: canvas/surface neutrals and the steel accent, and the
 * accent appears exactly twice — the logo mark and the one primary action.
 * The previous version put an accent colour on the mark, the badge, the demo
 * link, the trial button and every dropdown hover, which is why nothing stood
 * out.
 */
export const Navbar: React.FC = () => {
  const { openTrial } = useTrial();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productMenuOpen, setProductMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navItem = 'px-3 py-2 rounded-lg hover:text-ink hover:bg-canvas transition-colors';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4">
      <div className={`max-w-7xl mx-auto rounded-xl transition-all duration-300 border border-line ${isScrolled ? 'bg-surface/90 backdrop-blur-xl shadow-sm py-2.5 px-4 sm:px-6' : 'bg-surface/70 backdrop-blur-md py-3 px-4 sm:px-6'}`}>
        <div className="flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-3 shrink-0 focus:outline-none">
            <div className="w-9 h-9 rounded-lg bg-brand-700 dark:bg-brand-500 flex items-center justify-center text-white">
              <Building2 className="w-5 h-5 stroke-[2.3]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg sm:text-xl tracking-tight text-ink font-display">TU Properties</span>
              <span className="hidden sm:inline-block text-[10px] tracking-wider uppercase px-2 py-0.5 rounded border border-line font-medium text-ink-subtle font-mono">Kenya · US</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1 text-xs font-medium text-ink-muted">
            {/* Platform Dropdown */}
            <div className="relative" onMouseEnter={() => setProductMenuOpen(true)} onMouseLeave={() => setProductMenuOpen(false)}>
              <button className={`px-3 py-2 rounded-lg flex items-center gap-1 hover:text-ink hover:bg-canvas transition-colors ${productMenuOpen ? 'text-ink' : ''}`}>
                <span>Platform</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${productMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {productMenuOpen && (
                <div className="absolute top-full left-0 w-72 pt-2 z-50">
                  <div className="p-2 rounded-lg bg-surface border border-line shadow-sm space-y-0.5">
                    <Link href="/features" onClick={() => setProductMenuOpen(false)} className="p-2.5 rounded-md hover:bg-canvas flex items-start gap-3 transition-colors group">
                      <div className="w-7 h-7 rounded-md border border-line text-ink-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ink group-hover:text-brand-700 dark:group-hover:text-brand-300">20 Core Modules</div>
                        <div className="text-[11px] text-ink-subtle">Properties, leases, utilities, maintenance &amp; HR</div>
                      </div>
                    </Link>

                    <Link href="/#how-it-works" onClick={() => setProductMenuOpen(false)} className="p-2.5 rounded-md hover:bg-canvas flex items-start gap-3 transition-colors group">
                      <div className="w-7 h-7 rounded-md border border-line text-ink-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Calculator className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ink group-hover:text-brand-700 dark:group-hover:text-brand-300">Interactive Simulator</div>
                        <div className="text-[11px] text-ink-subtle">Test FIFO waterfall &amp; tax math</div>
                      </div>
                    </Link>

                    <Link href="/security" onClick={() => setProductMenuOpen(false)} className="p-2.5 rounded-md hover:bg-canvas flex items-start gap-3 transition-colors group">
                      <div className="w-7 h-7 rounded-md border border-line text-ink-muted flex items-center justify-center shrink-0 mt-0.5">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ink group-hover:text-brand-700 dark:group-hover:text-brand-300">Derived Accounting &amp; Audit</div>
                        <div className="text-[11px] text-ink-subtle">Double-entry ledgers &amp; append-only audit trail</div>
                      </div>
                    </Link>

                    <Link href="/demo" onClick={() => setProductMenuOpen(false)} className="p-2.5 rounded-md hover:bg-canvas flex items-start gap-3 transition-colors group">
                      <div className="w-7 h-7 rounded-md border border-line text-ink-muted flex items-center justify-center shrink-0 mt-0.5">
                        <Globe2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ink group-hover:text-brand-700 dark:group-hover:text-brand-300">Two-Market Architecture</div>
                        <div className="text-[11px] text-ink-subtle">One organization per market — KES or USD</div>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link href="/#pricing" className={navItem}>
              Pricing
            </Link>

            <Link href="/#faq" className={navItem}>
              FAQ
            </Link>

            <Link href="/demo" className="px-3 py-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas transition-colors flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Demo Logins</span>
            </Link>
          </nav>

          {/* Right Action CTAs */}
          <div className="hidden sm:flex items-center gap-2.5">
            <ThemeToggle />

            <Link href="/auth/login" className="text-xs font-medium px-3.5 py-2 rounded-lg text-ink-muted hover:text-ink hover:bg-canvas transition-colors flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </Link>

            <button onClick={() => openTrial()} className="text-xs font-semibold px-4 py-2.5 rounded-lg bg-brand-700 hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400 text-white transition-colors flex items-center gap-1.5 cursor-pointer">
              <span>Start free trial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Right Bar */}
          <div className="flex sm:hidden items-center gap-2">
            <ThemeToggle />
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg border border-line text-ink-muted" aria-label="Toggle menu">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 pt-3 border-t border-line space-y-2 pb-2">
            <div className="grid grid-cols-2 gap-2 text-xs font-medium">
              <Link href="/features" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-md bg-canvas text-ink">
                Features
              </Link>
              <Link href="/#how-it-works" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-md bg-canvas text-ink">
                Simulator
              </Link>
              <Link href="/#pricing" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-md bg-canvas text-ink">
                Pricing
              </Link>
              <Link href="/demo" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-md bg-canvas text-ink">
                Demo Logins
              </Link>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <Link href="/auth/login" className="flex-1 py-2 text-center text-xs font-medium rounded-lg border border-line-strong text-ink">
                Sign In
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openTrial();
                }}
                className="flex-1 py-2 text-center text-xs font-semibold rounded-lg bg-brand-700 dark:bg-brand-500 text-white"
              >
                Free Trial
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
