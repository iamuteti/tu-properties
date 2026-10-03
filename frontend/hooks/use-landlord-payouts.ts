import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { landlordPayoutsApi } from '@/lib/api';
import { useAuth } from './use-auth';
import { LandlordPayout } from '@/types';
import type { PaginationMeta } from './use-landlords';

export interface UseLandlordPayoutsParams {
    page?: number;
    limit?: number;
    search?: string;
    landlordId?: string;
    ownerStatementId?: string;
    status?: string;
    method?: string;
}

export function useLandlordPayouts(params?: UseLandlordPayoutsParams) {
    const { user, isLoading: authIsLoading } = useAuth();
    const [payouts, setPayouts] = useState<LandlordPayout[]>([]);
    const [paginationMeta, setPaginationMeta] = useState<PaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef(params);

    const stableParams = useMemo(() => params, [
        params?.page,
        params?.limit,
        params?.search,
        params?.landlordId,
        params?.ownerStatementId,
        params?.status,
        params?.method,
    ]);

    const fetchPayouts = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await landlordPayoutsApi.findAll(paramsRef.current);
            setPayouts(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err) {
            if (err instanceof AxiosError) {
                setError(
                    err.response?.data?.message || err.message || 'Failed to fetch payouts',
                );
            } else {
                setError('Failed to fetch payouts');
            }
        } finally {
            setIsLoading(false);
        }
    }, [user, authIsLoading]);

    useEffect(() => {
        paramsRef.current = stableParams;
        fetchPayouts();
    }, [stableParams, fetchPayouts]);

    return { payouts, paginationMeta, isLoading, error, refetch: fetchPayouts };
}