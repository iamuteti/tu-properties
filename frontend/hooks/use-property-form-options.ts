import { useCallback, useEffect, useState } from 'react';
import { branchesApi, landlordsApi } from '@/lib/api';
import type { Branch, Landlord } from '@/types';

/**
 * Landlords + branches, the two reference lists every property form needs.
 * Loaded once per page instead of per field so the create and edit routes
 * share the same options.
 */
export function usePropertyFormOptions() {
    const [landlords, setLandlords] = useState<Landlord[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [landlordResponse, branchResponse] = await Promise.all([
                landlordsApi.findAll({ limit: 1000 }),
                branchesApi.findAll(),
            ]);
            setLandlords(landlordResponse.data.data);
            setBranches(branchResponse.data);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : 'Failed to load form options.',
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    return { landlords, branches, isLoading, error, reload: load };
}