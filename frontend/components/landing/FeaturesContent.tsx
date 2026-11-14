'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { FeaturesList } from './FeaturesList';
import { useTrial } from './trial-context';

/**
 * `/features` — the full module catalogue. It used to be the longest block on
 * the landing page; it is reference material, so it gets its own route and the
 * landing page links to it instead of scrolling past it.
 */
export const FeaturesContent: React.FC = () => {
  const { openTrial } = useTrial();
  const router = useRouter();

  return <FeaturesList onOpenTrialModal={() => openTrial()} onExploreModule={() => router.push('/#how-it-works')} />;
};
