'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { TrialModal } from './TrialModal';

interface TrialContextValue {
  openTrial: (planId?: string, currency?: string) => void;
}

const TrialContext = createContext<TrialContextValue | null>(null);

/**
 * Owns the one real signup form (`POST /platform/signup`) so every marketing
 * page can open it without threading a callback through each section.
 *
 * `planId` / `currency` are what the pricing table passes in, so the modal opens
 * on the plan the visitor actually clicked; every other caller opens it blank.
 */
export const TrialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [planId, setPlanId] = useState<string | undefined>(undefined);
  const [currency, setCurrency] = useState<string | undefined>(undefined);

  const openTrial = useCallback((nextPlanId?: string, nextCurrency?: string) => {
    setPlanId(nextPlanId);
    setCurrency(nextCurrency);
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ openTrial }), [openTrial]);

  return (
    <TrialContext.Provider value={value}>
      {children}
      <TrialModal isOpen={isOpen} onClose={() => setIsOpen(false)} selectedPlan={planId} selectedCurrency={currency} />
    </TrialContext.Provider>
  );
};

export function useTrial(): TrialContextValue {
  const context = useContext(TrialContext);
  if (!context) {
    throw new Error('useTrial must be used inside <TrialProvider> (see LandingLayout).');
  }
  return context;
}
