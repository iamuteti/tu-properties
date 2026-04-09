import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AxiosError } from "axios";
import { moveoutsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { MoveOutRequest } from "@/types";

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface UseMoveoutsParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
}

export function useMoveouts(params?: UseMoveoutsParams) {
    const { token } = useAuth();
    const [moveouts, setMoveouts] = useState<MoveOutRequest[]>([]);
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

    const fetchMoveouts = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await moveoutsApi.findAll(paramsRef.current);
            setMoveouts(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                if (err.response?.data?.data) {
                    setMoveouts(err.response.data.data);
                    setPaginationMeta(err.response.data.meta);
                    setError(null);
                    return;
                }
                setError(err.response?.data?.message || err.message || "Failed to fetch move-outs");
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
        fetchMoveouts();
    }, [stableParams, fetchMoveouts]);

    return { moveouts, paginationMeta, isLoading, error, refetch: fetchMoveouts };
}