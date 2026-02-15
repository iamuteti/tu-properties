"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, AuthResponse, Organization } from "@/types";
import { useRouter } from "next/navigation";

interface AuthContextType {
    user: User | null;
    organization: Organization | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Check for stored token on mount
        const storedToken = localStorage.getItem("auth_token");
        const storedUser = localStorage.getItem("auth_user");

        console.log('Auth Context - storedToken:', !!storedToken);
        console.log('Auth Context - storedUser:', storedUser);

        if (storedToken && storedUser) {
            setToken(storedToken);
            try {
                const parsedUser = JSON.parse(storedUser);
                setUser(parsedUser);
                // Set organization if available in user
                if (parsedUser.organization) {
                    setOrganization(parsedUser.organization);
                }
            } catch (e) {
                console.error('Failed to parse stored user:', e);
            }
        }
        setIsLoading(false);
    }, []);

    const login = (newToken: string, newUser: User) => {
        console.log('Login called with user:', newUser);
        setToken(newToken);
        setUser(newUser);
        if (newUser.organization) {
            setOrganization(newUser.organization);
        }
        localStorage.setItem("auth_token", newToken);
        localStorage.setItem("auth_user", JSON.stringify(newUser));
        router.push("/dashboard");
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        setOrganization(null);
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        router.push("/auth/login");
    };

    return (
        <AuthContext.Provider value={{ user, organization, token, login, logout, isLoading }}>
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
