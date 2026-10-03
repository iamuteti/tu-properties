"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Organization } from "@/types";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface AuthContextType {
  user: User | null;
  organization: Organization | null;
  login: (user: User) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

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
    setUser(newUser);
    if (newUser.organization) {
      setOrganization(newUser.organization);
    }
    router.push("/dashboard");
  };

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Best-effort: clear the local state regardless.
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
    <AuthContext.Provider value={{ user, organization, login, logout, isLoading }}>
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