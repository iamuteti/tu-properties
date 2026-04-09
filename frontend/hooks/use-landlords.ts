import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AxiosError } from "axios";
import { landlordsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Landlord } from "@/types";

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface UseLandlordsParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
}

export function useLandlords(params?: UseLandlordsParams) {
    const { token } = useAuth();
    const [landlords, setLandlords] = useState<Landlord[]>([]);
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
        params?.status,
    ]);

    const fetchLandlords = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await landlordsApi.findAll(paramsRef.current);
            setLandlords(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                if (err.response?.data?.data) {
                    setLandlords(err.response.data.data);
                    setPaginationMeta(err.response.data.meta);
                    setError(null);
                    return;
                }
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
        paramsRef.current = stableParams;
        fetchLandlords();
    }, [stableParams, fetchLandlords]);

    return { landlords, paginationMeta, isLoading, error, refetch: fetchLandlords };
}
