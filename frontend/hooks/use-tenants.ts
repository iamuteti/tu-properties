import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AxiosError } from "axios";
import { tenantsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Tenant } from "@/types";

export interface PaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface UseTenantsParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    status?: string;
    agreementType?: string;
}

export function useTenants(params?: UseTenantsParams) {
    const { token } = useAuth();
    const [tenants, setTenants] = useState<Tenant[]>([]);
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
        params?.agreementType,
    ]);

    const fetchTenants = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await tenantsApi.findAll(paramsRef.current);
            setTenants(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                if (err.response?.data?.data) {
                    setTenants(err.response.data.data);
                    setPaginationMeta(err.response.data.meta);
                    setError(null);
                    return;
                }
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
        paramsRef.current = stableParams;
        fetchTenants();
    }, [stableParams, fetchTenants]);

    return { tenants, paginationMeta, isLoading, error, refetch: fetchTenants };
}
