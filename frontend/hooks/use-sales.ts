import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import { salesApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import type { Sale } from "@/types";

export interface UseSalesParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    stage?: string;
    propertyId?: string;
    agentUserId?: string;
    buyerContactId?: string;
}

export interface SalesPaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export function useSales(params?: UseSalesParams) {
    const { user, isLoading: authIsLoading } = useAuth();
    const [sales, setSales] = useState<Sale[]>([]);
    const [paginationMeta, setPaginationMeta] = useState<SalesPaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef(params);

    const stableParams = useMemo(() => params, [
        params?.page,
        params?.limit,
        params?.search,
        params?.sortBy,
        params?.sortOrder,
        params?.stage,
        params?.propertyId,
        params?.agentUserId,
        params?.buyerContactId,
    ]);

    const fetchSales = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await salesApi.findSales(paramsRef.current);
            setSales(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch sales");
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        } finally {
            setIsLoading(false);
        }
    }, [user, authIsLoading]);

    useEffect(() => {
        paramsRef.current = stableParams;
        fetchSales();
    }, [stableParams, fetchSales]);

    return { sales, paginationMeta, isLoading, error, refetch: fetchSales };
}

/** Pipeline board feed (open sales only). */
export function useSalesPipeline(params?: { agentUserId?: string }) {
    const { user } = useAuth();
    const [sales, setSales] = useState<Sale[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const stableParams = useMemo(() => params, [params?.agentUserId]);

    const fetchPipeline = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await salesApi.pipeline(stableParams);
            setSales(response.data);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch the sales pipeline");
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        } finally {
            setIsLoading(false);
        }
    }, [user, stableParams]);

    useEffect(() => {
        fetchPipeline();
    }, [fetchPipeline]);

    return { sales, isLoading, error, refetch: fetchPipeline };
}