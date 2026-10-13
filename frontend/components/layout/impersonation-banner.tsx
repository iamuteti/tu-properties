"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    clearImpersonation,
    getImpersonation,
    platformApi,
    restoreImpersonation,
    StoredImpersonation,
} from "@/lib/api";

/**
 * Module 19 Phase C — the visible half of impersonation.
 *
 * An impersonated session must be *visibly indicated to any staff using it*
 * (module doc): every screen under this banner runs as the tenant user, and
 * nothing here should look like the operator's own session. Ending revokes
 * the session server-side, then drops the bearer token and returns to the
 * tenant list.
 */
export function ImpersonationBanner() {
    const router = useRouter();
    const [imp, setImp] = useState<StoredImpersonation | null>(null);

    useEffect(() => {
        setImp(restoreImpersonation());
    }, []);

    if (!imp) return null;

    const end = async () => {
        try {
            await platformApi.endImpersonation();
        } catch {
            // The token may already have expired server-side; the local state
            // is cleared regardless, because a banner for a dead session is
            // worse than no banner.
        }
        clearImpersonation();
        setImp(null);
        router.push("/platform/organizations");
        router.refresh();
    };

    return (
        <div className="bg-amber-500 text-white px-6 py-2 flex items-center justify-between text-sm">
            <span>
                Impersonating <strong>{imp.user.email}</strong> ({imp.user.role}) — actions are audited against you.
            </span>
            <button onClick={end} className="underline font-medium hover:text-amber-100">
                End impersonation
            </button>
        </div>
    );
}
