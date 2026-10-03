import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import { crmApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import type { Lead } from "@/types";

export interface UseLeadsParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    stage?: string;
    source?: string;
    propertyId?: string;
    branchId?: string;
    assignedAgentId?: string;
    unassigned?: boolean;
}

export interface LeadPaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export function useLeads(params?: UseLeadsParams) {
    const { user, isLoading: authIsLoading } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [paginationMeta, setPaginationMeta] = useState<LeadPaginationMeta | null>(null);
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
        params?.source,
        params?.propertyId,
        params?.branchId,
        params?.assignedAgentId,
        params?.unassigned,
    ]);

    const fetchLeads = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await crmApi.findLeads(paramsRef.current);
            setLeads(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(
                    err.response?.data?.message || err.message || "Failed to fetch leads",
                );
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
        fetchLeads();
    }, [stableParams, fetchLeads]);

    return { leads, paginationMeta, isLoading, error, refetch: fetchLeads };
}

/**
 * Pipeline board feed. Separate from `useLeads` because the board needs every
 * open lead at once (grouped client-side by stage) rather than one page at a
 * time.
 */
export function useLeadPipeline(params?: { propertyId?: string; agentId?: string }) {
    const { user } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const stableParams = useMemo(() => params, [params?.propertyId, params?.agentId]);

    const fetchPipeline = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await crmApi.pipeline(stableParams);
            setLeads(response.data);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch the pipeline");
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

    return { leads, isLoading, error, refetch: fetchPipeline };
}