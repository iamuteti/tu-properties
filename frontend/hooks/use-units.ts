import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AxiosError } from "axios";
import { unitsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Unit, PaginatedResponse } from "@/types";

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface UseUnitsParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    propertyId?: string;
    status?: string;
    type?: string;
}

export function useUnits(params?: UseUnitsParams) {
    const { token } = useAuth();
    const [units, setUnits] = useState<Unit[]>([]);
    const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef(params);

    const stableParams = useMemo(() => params, [
        params?.page,
        params?.limit,
        params?.search,
        params?.sortBy,
        params?.sortOrder,
        params?.propertyId,
        params?.status,
        params?.type,
    ]);

    const fetchUnits = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await unitsApi.findAll(paramsRef.current);
            setUnits(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                if (err.response?.data?.data) {
                    setUnits(err.response.data.data);
                    setPaginationMeta(err.response.data.meta);
                    setError(null);
                    return;
                }
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
        paramsRef.current = stableParams;
        fetchUnits();
    }, [stableParams, fetchUnits]);

    return { units, paginationMeta, isLoading, error, refetch: fetchUnits };
}
