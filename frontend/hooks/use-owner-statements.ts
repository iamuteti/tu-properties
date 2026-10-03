import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { landlordChargesApi, ownerStatementsApi } from '@/lib/api';
import { useAuth } from './use-auth';
import { LandlordCharge, OwnerStatement, StatementPreview } from '@/types';
import type { PaginationMeta } from './use-landlords';

function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof AxiosError) {
        const message = err.response?.data?.message;
        if (Array.isArray(message)) return message.join('. ');
        return message || err.message || fallback;
    }
    if (err instanceof Error) return err.message;
    return fallback;
}

export interface UseOwnerStatementsParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    landlordId?: string;
    status?: string;
    periodStart?: string;
    periodEnd?: string;
}

export function useOwnerStatements(params?: UseOwnerStatementsParams) {
    const { user, isLoading: authIsLoading } = useAuth();
    const [statements, setStatements] = useState<OwnerStatement[]>([]);
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
        params?.landlordId,
        params?.status,
        params?.periodStart,
        params?.periodEnd,
    ]);

    const fetchStatements = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await ownerStatementsApi.findAll(paramsRef.current);
            setStatements(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err) {
            setError(errorMessage(err, 'Failed to fetch owner statements'));
        } finally {
            setIsLoading(false);
        }
    }, [user, authIsLoading]);

    useEffect(() => {
        paramsRef.current = stableParams;
        fetchStatements();
    }, [stableParams, fetchStatements]);

    return { statements, paginationMeta, isLoading, error, refetch: fetchStatements };
}

export function useOwnerStatement(id?: string) {
    const { user, isLoading: authIsLoading } = useAuth();
    const [statement, setStatement] = useState<OwnerStatement | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStatement = useCallback(async () => {
        if (!user || !id) return;
        setIsLoading(true);
        try {
            const response = await ownerStatementsApi.findOne(id);
            setStatement(response.data);
            setError(null);
        } catch (err) {
            setStatement(null);
            setError(errorMessage(err, 'Failed to fetch owner statement'));
        } finally {
            setIsLoading(false);
        }
    }, [user, authIsLoading, id]);

    useEffect(() => {
        fetchStatement();
    }, [fetchStatement]);

    return { statement, isLoading, error, refetch: fetchStatement };
}

/**
 * Dry run of a statement period: exactly what `generate` would produce, with
 * nothing written. Debounced because it runs a real aggregation per keystroke
 * change on the date fields.
 */
export function useStatementPreview(
    landlordId?: string,
    periodStart?: string,
    periodEnd?: string,
) {
    const [preview, setPreview] = useState<StatementPreview | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const key = `${landlordId ?? ''}|${periodStart ?? ''}|${periodEnd ?? ''}`;

    useEffect(() => {
        if (!landlordId || !periodStart || !periodEnd) {
            setPreview(null);
            return;
        }

        let cancelled = false;
        setIsLoading(true);

        const timer = setTimeout(() => {
            ownerStatementsApi
                .preview({ landlordId, periodStart, periodEnd })
                .then((response) => {
                    if (cancelled) return;
                    setPreview(response.data);
                    setError(null);
                })
                .catch((err) => {
                    if (cancelled) return;
                    setPreview(null);
                    setError(errorMessage(err, 'Failed to preview this period'));
                })
                .finally(() => {
                    if (!cancelled) setIsLoading(false);
                });
        }, 400);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // `key` collapses the three inputs into one dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return { preview, isLoading, error };
}

export interface UseLandlordChargesParams {
    page?: number;
    limit?: number;
    search?: string;
    landlordId?: string;
    category?: string;
    unstated?: boolean;
}

export function useLandlordCharges(params?: UseLandlordChargesParams) {
    const { user, isLoading: authIsLoading } = useAuth();
    const [charges, setCharges] = useState<LandlordCharge[]>([]);
    const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef(params);

    const stableParams = useMemo(() => params, [
        params?.page,
        params?.limit,
        params?.search,
        params?.landlordId,
        params?.category,
        params?.unstated,
    ]);

    const fetchCharges = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await landlordChargesApi.findAll(paramsRef.current);
            setCharges(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err) {
            setError(errorMessage(err, 'Failed to fetch owner charges'));
        } finally {
            setIsLoading(false);
        }
    }, [user, authIsLoading]);

    useEffect(() => {
        paramsRef.current = stableParams;
        fetchCharges();
    }, [stableParams, fetchCharges]);

    return { charges, paginationMeta, isLoading, error, refetch: fetchCharges };
}