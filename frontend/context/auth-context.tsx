"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { User, Organization } from "@/types";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean;
  /** Re-fetch the profile (e.g. after saving organization settings). */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
    /**
     * Whether a logout is already in flight.
     *
     * A ref, not state, because it must be readable **synchronously**: several 401s
     * arriving in the same tick all dispatch `unauthorized` before any re-render, so a
     * state guard would not have updated in time and every one of them would run.
     */
    const loggingOutRef = useRef(false);
  const router = useRouter();

  const refreshProfile = useCallback(async () => {
    try {
      const res = await api.get('/auth/profile');
      const profile = res.data;
      setUser(profile);
      if (profile.organization) {
        setOrganization(profile.organization);
      }
    } catch {
      // No valid session — treat as logged out.
      setUser(null);
      setOrganization(null);
    }
  }, []);

  useEffect(() => {
    // No token in localStorage anymore — the JWT lives in an httpOnly cookie
    // that the browser sends automatically. Fetch the profile to confirm the
    // session is still valid, then populate the UI from the server response.
    let active = true;

    async function loadProfile() {
      try {
        const res = await api.get('/auth/profile');
        if (!active) return;
        const profile = res.data;
        setUser(profile);
        if (profile.organization) {
          setOrganization(profile.organization);
        }
      } catch {
        // No valid session — that's fine, the user just isn't logged in.
        if (active) {
          setUser(null);
          setOrganization(null);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

const login = (newUser: User) => {
        // Clear the logout guard, or signing back in during this page's life would find
        // the guard still set and every later logout would be silently ignored - a far
        // worse bug than the duplicate-logout one it prevents.
        loggingOutRef.current = false;
        setUser(newUser);
        if (newUser.organization) {
            setOrganization(newUser.organization);
        }
        // A tenant portal login belongs in the portal, not the dashboard: every
        // dashboard endpoint is organization-scoped and would deny them.
        router.push(newUser.portalTenantId ? "/portal" : "/dashboard");
    };

const logout = useCallback(async () => {
        // **Idempotent, deliberately.** Every 401 dispatches `unauthorized`, so a page
        // that fires five requests in parallel on mount and has an expired session
        // produces five of them, and five `logout()` calls would mean five
        // `/auth/logout` posts and five `router.push('/auth/login')` - a redirect race
        // for a page that is only trying to say "your session expired".
        //
        // The guard is a ref rather than state because it has to be readable
        // synchronously: `setIsLoggingOut` would not have taken effect by the time the
        // second event arrives in the same tick.
        if (loggingOutRef.current) return;
        loggingOutRef.current = true;

        try {
            await api.post('/auth/logout');
        } catch {
            // Best-effort: clear the local state regardless. The session is already
            // invalid by the time we get here, so a failure carries no new information.
        }
setUser(null);
        setOrganization(null);
        router.push("/auth/login");
    }, [router]);

    useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, organization, login, logout, isLoading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}