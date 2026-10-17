'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Building2,
  ChevronDown,
  ArrowRight,
  Menu,
  X,
  Layers,
  KeyRound,
  ShieldCheck,
  Calculator,
  Globe2,
  HelpCircle,
  Mail,
  UserCheck
} from 'lucide-react';
import { ThemeToggle } from '../layout/theme-toggle';

interface NavbarProps {
  onOpenTrialModal: () => void;
  onOpenDemoModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenTrialModal, onOpenDemoModal }) => {
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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4">
      <div
        className={`max-w-7xl mx-auto rounded-2xl transition-all duration-300 ${
          isScrolled
            ? 'bg-white/85 dark:bg-[#070B14]/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800/80 shadow-2xl py-2.5 px-4 sm:px-6'
            : 'bg-white/60 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/40 dark:border-slate-800/40 py-3 px-4 sm:px-6'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-3 shrink-0 group focus:outline-none">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 flex items-center justify-center shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200 text-slate-950 font-bold">
              <Building2 className="w-5 h-5 stroke-[2.3]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 dark:text-white font-display">
                TU Properties
              </span>
              <span className="hidden sm:inline-block text-[10px] tracking-wider uppercase px-2 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                Global SaaS
              </span>
            </div>
          </Link>

          {/* Clean Desktop Navigation Menu */}
          <nav className="hidden lg:flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
            
            {/* Platform Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setProductMenuOpen(true)}
              onMouseLeave={() => setProductMenuOpen(false)}
            >
              <button
                className={`px-3 py-2 rounded-lg flex items-center gap-1 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors ${
                  productMenuOpen ? 'text-amber-600 dark:text-amber-400' : ''
                }`}
              >
                <span>Platform</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${productMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {productMenuOpen && (
                <div className="absolute top-full left-0 w-72 pt-2 z-50">
                  <div className="p-2 rounded-xl bg-white dark:bg-[#0C1222] border border-slate-200 dark:border-slate-800 shadow-2xl space-y-1">
                    <a
                      href="#features"
                      onClick={() => setProductMenuOpen(false)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-start gap-3 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          10 Core Modules
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Properties, leases, utilities, maintenance & HR
                        </div>
                      </div>
                    </a>

                    <a
                      href="#how-it-works"
                      onClick={() => setProductMenuOpen(false)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-start gap-3 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Calculator className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          Interactive Simulator
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Test FIFO waterfall & multi-country tax math
                        </div>
                      </div>
                    </a>

                    <a
                      href="#trust"
                      onClick={() => setProductMenuOpen(false)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-start gap-3 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          Derived Accounting & Audit
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Double-entry ledgers & append-only audit trail
                        </div>
                      </div>
                    </a>

                    <a
                      href="#saas"
                      onClick={() => setProductMenuOpen(false)}
                      className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-start gap-3 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Globe2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          Multi-Entity Architecture
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Multi-branch isolation with global consolidations
                        </div>
                      </div>
                    </a>
                  </div>
                </div>
              )}
            </div>

            <a
              href="#pricing"
              className="px-3 py-2 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
            >
              Pricing
            </a>

            <a
              href="#faq"
              className="px-3 py-2 rounded-lg hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors"
            >
              FAQ
            </a>

            <a
              href="#demo-accounts"
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/25 transition-all flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Demo Logins</span>
            </a>
          </nav>

          {/* Right Action CTAs */}
          <div className="hidden sm:flex items-center gap-2.5">
            <ThemeToggle />
            
            <Link
              href="/auth/login"
              className="text-xs font-bold px-3.5 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 transition-colors flex items-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </Link>

            <button
              onClick={onOpenTrialModal}
              className="text-xs font-extrabold px-4 py-2.5 rounded-xl text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-md shadow-amber-500/20 transition-all transform hover:-translate-y-0.5 flex items-center gap-1.5 cursor-pointer"
            >
              <span>Start free trial</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Right Bar */}
          <div className="flex sm:hidden items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5 text-slate-900 dark:text-white" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2 pb-2">
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <a
                href="#features"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              >
                Features
              </a>
              <a
                href="#how-it-works"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              >
                Simulator
              </a>
              <a
                href="#pricing"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200"
              >
                Pricing
              </a>
              <a
                href="#demo-accounts"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/20"
              >
                Demo Logins
              </a>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <Link
                href="/auth/login"
                className="flex-1 py-2 text-center text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
              >
                Sign In
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenTrialModal();
                }}
                className="flex-1 py-2 text-center text-xs font-extrabold rounded-lg bg-amber-400 text-slate-950 shadow-sm"
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
