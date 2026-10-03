import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./use-auth";
import { usersApi } from "@/lib/api";
import type { User } from "@/types";

/**
 * Organization users, used for pickers (lead assignment).
 * Fetched without pagination — the list is small and every picker needs it.
 */
export function useUsers() {
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const response = await usersApi.findAll();
            setUsers(response.data);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load users");
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    return { users, isLoading, error, refetch: fetchUsers };
}