import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { landlordsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Landlord } from "@/types";

export function useLandlords() {
    const { token } = useAuth();
    const [landlords, setLandlords] = useState<Landlord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLandlords = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await landlordsApi.findAll();
            setLandlords(response.data);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch landlords");
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
        fetchLandlords();
    }, [fetchLandlords]);

    return { landlords, isLoading, error, refetch: fetchLandlords };
}
