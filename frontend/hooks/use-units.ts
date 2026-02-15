import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { unitsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Unit } from "@/types";

export function useUnits() {
    const { token } = useAuth();
    const [units, setUnits] = useState<Unit[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchUnits = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await unitsApi.findAll();
            setUnits(response.data);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch units");
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
        fetchUnits();
    }, [fetchUnits]);

    return { units, isLoading, error, refetch: fetchUnits };
}
