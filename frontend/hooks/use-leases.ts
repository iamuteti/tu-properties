import { useState, useEffect, useCallback } from "react";
import axios, { AxiosError } from "axios";
import { useAuth } from "./use-auth";
import { Lease } from "@/types";

export function useLeases() {
    const { token } = useAuth();
    const [leases, setLeases] = useState<Lease[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLeases = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await axios.get("http://localhost:3000/leases", {
                headers: { Authorization: `Bearer ${token}` },
            });
            setLeases(response.data);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch leases");
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
        fetchLeases();
    }, [fetchLeases]);

    return { leases, isLoading, error, refetch: fetchLeases };
}
