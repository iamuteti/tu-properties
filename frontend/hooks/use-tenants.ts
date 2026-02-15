import { useState, useEffect, useCallback } from "react";
import axios, { AxiosError } from "axios";
import { useAuth } from "./use-auth";
import { Tenant } from "@/types";

export function useTenants() {
    const { token } = useAuth();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTenants = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await axios.get("http://localhost:3000/tenants", {
                headers: { Authorization: `Bearer ${token}` },
            });
            setTenants(response.data);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch tenants");
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchTenants();
    }, [fetchTenants]);

    return { tenants, isLoading, error, refetch: fetchTenants };
}
