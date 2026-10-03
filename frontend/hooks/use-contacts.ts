import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import { crmApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import type { Contact } from "@/types";

export interface UseContactsParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    type?: string;
    engaged?: boolean;
}

export interface ContactPaginationMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export function useContacts(params?: UseContactsParams) {
    const { user, isLoading: authIsLoading } = useAuth();
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [paginationMeta, setPaginationMeta] = useState<ContactPaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const paramsRef = useRef(params);

    const stableParams = useMemo(() => params, [
        params?.page,
        params?.limit,
        params?.search,
        params?.sortBy,
        params?.sortOrder,
        params?.type,
        params?.engaged,
    ]);

    const fetchContacts = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await crmApi.findContacts(paramsRef.current);
            setContacts(response.data.data);
            setPaginationMeta(response.data.meta);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(
                    err.response?.data?.message || err.message || "Failed to fetch contacts",
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
        fetchContacts();
    }, [stableParams, fetchContacts]);

    return { contacts, paginationMeta, isLoading, error, refetch: fetchContacts };
}