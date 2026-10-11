import React, { useState, useEffect } from 'react';
import { Building2, Shield, Menu, X, ArrowRight, CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from '../layout/theme-toggle';

interface NavbarProps {
  onOpenTrialModal: () => void;
  onOpenDemoModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenTrialModal, onOpenDemoModal }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-slate-50/90 dark:bg-[#070B14]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 shadow-2xl py-3.5'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo & Brand */}
          <a href="#" className="flex items-center gap-3 group focus:outline-none">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform duration-200 border border-amber-300/30">
              <Building2 className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 font-display">
                TU Properties
                <span className="text-[10px] tracking-wider uppercase px-1.5 py-0.5 rounded font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  Enterprise
                </span>
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tracking-wide font-medium">
                Pan-African Property SaaS
              </span>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              Platform Features
            </a>
            <a href="#how-it-works" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <span>Interactive Engine</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            </a>
            <a href="#trust" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              Derived Accounting
            </a>
            <a href="#saas" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              Multi-Branch Architecture
            </a>
            <a href="#pricing" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              Pricing
            </a>
            <a href="#faq" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              FAQ
            </a>
            <a href="#contact" className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors">
              Contact
            </a>
          </nav>

          {/* Right Action CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <button
              onClick={onOpenDemoModal}
              className="text-xs font-semibold px-4 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white/80 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300/80 dark:border-slate-700/80 transition-all cursor-pointer"
            >
              See How It Works
            </button>
            <button
              onClick={onOpenTrialModal}
              className="group text-xs font-bold px-4 py-2.5 rounded-lg text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 transition-all transform hover:-translate-y-0.5 flex items-center gap-2 cursor-pointer"
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Mobile Hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-4 py-4 px-3 bg-white dark:bg-[#0C1222] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl space-y-3">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            >
              Platform Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            >
              Interactive Engine
            </a>
            <a
              href="#trust"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            >
              Derived Accounting & Security
            </a>
            <a
              href="#saas"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            >
              SaaS Lifecycle & Alerts
            </a>
            <a
              href="#pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            >
              Pricing
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            >
              Frequently Asked Questions
            </a>
            <a
              href="#contact"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
            >
              Contact Us
            </a>
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenDemoModal();
                }}
                className="w-full text-center text-xs font-semibold py-2.5 rounded-lg text-slate-700 dark:text-slate-200 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700"
              >
                See How It Works
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenTrialModal();
                }}
                className="w-full text-center text-xs font-bold py-2.5 rounded-lg text-slate-950 bg-amber-400 hover:bg-amber-300 font-semibold shadow-md"
              >
                Start Free Trial
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
