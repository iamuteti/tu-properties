import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AxiosError } from "axios";
import { propertiesApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Property } from "@/types";

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface UsePropertiesParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    type?: string;
    category?: string;
    landlordId?: string;
}

export function useProperties(params?: UsePropertiesParams) {
    const { token } = useAuth();
    const [properties, setProperties] = useState<Property[]>([]);
    const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef(params);

    // Stabilize params with useMemo to prevent infinite re-renders
    const stableParams = useMemo(() => params, [
        params?.page,
        params?.limit,
        params?.search,
        params?.sortBy,
        params?.sortOrder,
        params?.type,
        params?.category,
        params?.landlordId,
    ]);

    const fetchProperties = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await propertiesApi.findAll(paramsRef.current);
            setProperties(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                if (err.response?.data?.data) {
                    setProperties(err.response.data.data);
                    setPaginationMeta(err.response.data.meta);
                    setError(null);
                    return;
                }
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
        paramsRef.current = stableParams;
        fetchProperties();
    }, [stableParams, fetchProperties]);

    return { properties, paginationMeta, isLoading, error, refetch: fetchProperties };
}
