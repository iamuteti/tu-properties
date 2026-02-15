import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { propertiesApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Property } from "@/types";

export function useProperties() {
    const { token } = useAuth();
    const [properties, setProperties] = useState<Property[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProperties = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await propertiesApi.findAll();
            setProperties(response.data);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch properties");
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
        fetchProperties();
    }, [fetchProperties]);

    return { properties, isLoading, error, refetch: fetchProperties };
}
