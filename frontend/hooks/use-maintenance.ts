import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { maintenanceApi } from '@/lib/api';
import { useAuth } from './use-auth';
import type {
    Asset,
    AssetDetail,
    AssetStats,
    MaintenanceTechnician,
    PmRun,
    PmSchedule,
    WorkOrder,
    WorkOrderStats,
} from '@/types';

/**
 * Module 9 data hooks.
 *
 * The maintenance list endpoints return plain arrays rather than the paginated
 * envelope the older modules use, because a maintenance manager works from the
 * whole queue at once — a paginated queue hides the job that is three rows below
 * the fold and overdue. The client-side slicing happens in the page.
 */

function messageFrom(error: unknown, fallback: string): string {
    if (error instanceof AxiosError) {
        const payload = error.response?.data as { message?: unknown } | undefined;
        if (Array.isArray(payload?.message)) {
            // The validation pipe returns an array of field errors.
            return payload.message.join(' ');
        }
        if (typeof payload?.message === 'string') return payload.message;
        return error.message || fallback;
    }
    if (error instanceof Error) return error.message;
    return fallback;
}

export interface WorkOrderFilters {
    status?: string;
    category?: string;
    priority?: string;
    source?: string;
    propertyId?: string;
    technicianId?: string;
    assigned?: string;
    open?: boolean;
    search?: string;
}

export function useWorkOrders(filters?: WorkOrderFilters) {
    const { user } = useAuth();
    const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
    const [stats, setStats] = useState<WorkOrderStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const stableFilters = useMemo(
        () => ({
            status: filters?.status || undefined,
            category: filters?.category || undefined,
            priority: filters?.priority || undefined,
            source: filters?.source || undefined,
            propertyId: filters?.propertyId || undefined,
            technicianId: filters?.technicianId || undefined,
            assigned: filters?.assigned || undefined,
            open: filters?.open,
            search: filters?.search || undefined,
        }),
        [
            filters?.status,
            filters?.category,
            filters?.priority,
            filters?.source,
            filters?.propertyId,
            filters?.technicianId,
            filters?.assigned,
            filters?.open,
            filters?.search,
        ],
    );
    const filtersRef = useRef(stableFilters);

    const fetchAll = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const [list, counts] = await Promise.all([
                maintenanceApi.workOrders(filtersRef.current),
                maintenanceApi.workOrderStats(),
            ]);
            setWorkOrders(list.data);
            setStats(counts.data);
            setError(null);
        } catch (err) {
            setError(messageFrom(err, 'Failed to load work orders'));
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        filtersRef.current = stableFilters;
        fetchAll();
    }, [stableFilters, fetchAll]);

    return { workOrders, stats, isLoading, error, refetch: fetchAll };
}

export function useWorkOrder(id?: string) {
    const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchOne = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const response = await maintenanceApi.workOrder(id);
            setWorkOrder(response.data);
            setError(null);
        } catch (err) {
            setError(messageFrom(err, 'Failed to load this work order'));
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchOne();
    }, [fetchOne]);

    return { workOrder, isLoading, error, refetch: fetchOne };
}

export function useTechnicians() {
    const [technicians, setTechnicians] = useState<MaintenanceTechnician[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchTechnicians = useCallback(async () => {
        try {
            const response = await maintenanceApi.technicians();
            setTechnicians(response.data);
        } catch {
            // The picker is an aid, not the page: an empty list must not take the
            // queue down with it.
            setTechnicians([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTechnicians();
    }, [fetchTechnicians]);

    return { technicians, isLoading, refetch: fetchTechnicians };
}

export interface AssetFilters {
    type?: string;
    status?: string;
    propertyId?: string;
    search?: string;
    includeRetired?: boolean;
}

export function useAssets(filters?: AssetFilters) {
    const { user } = useAuth();
    const [assets, setAssets] = useState<Asset[]>([]);
    const [stats, setStats] = useState<AssetStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const stableFilters = useMemo(
        () => ({
            type: filters?.type || undefined,
            status: filters?.status || undefined,
            propertyId: filters?.propertyId || undefined,
            search: filters?.search || undefined,
            includeRetired: filters?.includeRetired ? 'true' : undefined,
        }),
        [
            filters?.type,
            filters?.status,
            filters?.propertyId,
            filters?.search,
            filters?.includeRetired,
        ],
    );
    const filtersRef = useRef(stableFilters);

    const fetchAll = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const [list, counts] = await Promise.all([
                maintenanceApi.assets(filtersRef.current),
                maintenanceApi.assetStats(),
            ]);
            setAssets(list.data);
            setStats(counts.data);
            setError(null);
        } catch (err) {
            setError(messageFrom(err, 'Failed to load the asset register'));
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        filtersRef.current = stableFilters;
        fetchAll();
    }, [stableFilters, fetchAll]);

    return { assets, stats, isLoading, error, refetch: fetchAll };
}

export function useAsset(id?: string) {
    const [asset, setAsset] = useState<AssetDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchOne = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const response = await maintenanceApi.asset(id);
            setAsset(response.data);
            setError(null);
        } catch (err) {
            setError(messageFrom(err, 'Failed to load this asset'));
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchOne();
    }, [fetchOne]);

    return { asset, isLoading, error, refetch: fetchOne };
}

export interface PmFilters {
    assetId?: string;
    propertyId?: string;
    active?: boolean;
}

export function usePmSchedules(filters?: PmFilters) {
    const { user } = useAuth();
    const [schedules, setSchedules] = useState<PmSchedule[]>([]);
    const [runs, setRuns] = useState<PmRun[]>([]);
    const [stats, setStats] = useState<{ active: number; overdue: number; dueThisWeek: number } | null>(
        null,
    );
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const stableFilters = useMemo(
        () => ({
            assetId: filters?.assetId || undefined,
            propertyId: filters?.propertyId || undefined,
            active: filters?.active === undefined ? undefined : String(filters.active),
        }),
        [filters?.assetId, filters?.propertyId, filters?.active],
    );
    const filtersRef = useRef(stableFilters);

    const fetchAll = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const [list, counts, history] = await Promise.all([
                maintenanceApi.pmSchedules(filtersRef.current),
                maintenanceApi.pmStats(),
                maintenanceApi.pmRuns(),
            ]);
            setSchedules(list.data);
            setStats(counts.data);
            setRuns(history.data);
            setError(null);
        } catch (err) {
            setError(messageFrom(err, 'Failed to load maintenance schedules'));
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        filtersRef.current = stableFilters;
        fetchAll();
    }, [stableFilters, fetchAll]);

    return { schedules, runs, stats, isLoading, error, refetch: fetchAll };
}
