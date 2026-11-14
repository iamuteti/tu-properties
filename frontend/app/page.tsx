import React from 'react';
import { LandingLayout } from '@/components/landing/LandingLayout';
import { HomeContent } from '@/components/landing/HomeContent';

/**
 * Public marketing site — the only route in the app that must never require a
 * session. It deliberately reads no auth state: `useAuth()` redirects
 * unauthenticated visitors to `/auth/login`, so touching it here would bounce
 * every prospect off the landing page. "Sign in" is a plain link; "Start trial"
 * opens the real signup form, which POSTs to the public `/platform/signup`.
 *
 * Deep material lives on its own routes (`/features`, `/demo`, `/security`,
 * `/contact`) — the landing page keeps only what persuades.
 */
export default function LandingPage() {
  return (
    <LandingLayout>
      <HomeContent />
    </LandingLayout>
  );
}
