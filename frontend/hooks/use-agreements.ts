import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import { inspectionsApi, agreementsApi, agreementTemplatesApi, moveOutsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import type { InspectionReport, Lease, LeaseTemplate, MoveOutRequest } from "@/types";

export interface UseAgreementsParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    status?: string;
    agreementType?: string;
    unitId?: string;
    tenantId?: string;
    propertyId?: string;
}

export function useAgreements(params?: UseAgreementsParams) {
    const { user } = useAuth();
    const [agreements, setAgreements] = useState<Lease[]>([]);
    const [meta, setMeta] = useState<{
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef(params);

    const stableParams = useMemo(() => params, [
        params?.page,
        params?.limit,
        params?.search,
        params?.sortBy,
        params?.sortOrder,
        params?.status,
        params?.agreementType,
        params?.unitId,
        params?.tenantId,
        params?.propertyId,
    ]);

    const refetch = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await agreementsApi.findLeases(paramsRef.current);
            setAgreements(response.data.data);
            setMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch agreements");
            } else {
                setError(err instanceof Error ? err.message : "An unknown error occurred");
            }
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        paramsRef.current = stableParams;
        refetch();
    }, [stableParams, refetch]);

    return { agreements, paginationMeta: meta, isLoading, error, refetch };
}

/**
 * Agreements ending inside a window, with the contact details a reminder needs.
 * The delivery side is Module 18; this is the query that will drive it.
 */
export function useExpiringAgreements(days = 60) {
    const { user } = useAuth();
    const [agreements, setAgreements] = useState<Lease[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await agreementsApi.expiring(days);
            setAgreements(response.data);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load expiring agreements");
        } finally {
            setIsLoading(false);
        }
    }, [user, days]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { agreements, isLoading, error, refetch };
}

export function useMoveOuts(params?: { page?: number; limit?: number; search?: string; status?: string }) {
    const { user } = useAuth();
    const [moveOuts, setMoveOuts] = useState<MoveOutRequest[]>([]);
    const [meta, setMeta] = useState<{
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef(params);

    const stableParams = useMemo(() => params, [
        params?.page,
        params?.limit,
        params?.search,
        params?.status,
    ]);

    const refetch = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await moveOutsApi.findAll(paramsRef.current);
            setMoveOuts(response.data.data);
            setMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load move-outs");
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        paramsRef.current = stableParams;
        refetch();
    }, [stableParams, refetch]);

    return { moveOuts, paginationMeta: meta, isLoading, error, refetch };
}

export function useInspections(params?: { unitId?: string; type?: string }) {
    const { user } = useAuth();
    const [inspections, setInspections] = useState<InspectionReport[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const stableParams = useMemo(() => params, [params?.unitId, params?.type]);

    const refetch = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await inspectionsApi.list(stableParams);
            setInspections(response.data);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load inspections");
        } finally {
            setIsLoading(false);
        }
    }, [user, stableParams]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { inspections, isLoading, error, refetch };
}

export function useAgreementTemplates() {
    const { user } = useAuth();
    const [templates, setTemplates] = useState<LeaseTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refetch = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await agreementTemplatesApi.list();
            setTemplates(response.data);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load agreement templates");
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        refetch();
    }, [refetch]);

    return { templates, isLoading, error, refetch };
}
