"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { portalApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import type { PortalDocument } from "@/types";

export default function PortalDocumentsPage() {
    const [documents, setDocuments] = useState<PortalDocument[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await portalApi.documents();
            setDocuments(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not load your documents.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading documents…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
                    <p className="text-sm text-muted-foreground">
                        Files your property manager has shared with you
                    </p>
                </div>
                <Button variant="outline" onClick={load}>
                    Refresh
                </Button>
            </div>

            {documents.length === 0 ? (
                <EmptyState
                    title="No documents yet"
                    description="Lease agreements, receipts and other files shared with you appear here."
                    icon={<FileText className="h-10 w-10" aria-hidden="true" />}
                />
            ) : (
                <ul className="divide-y overflow-hidden rounded-lg border bg-white">
                    {documents.map((document) => (
                        <li
                            key={document.id}
                            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                        >
                            <div className="flex min-w-0 items-center gap-3">
                                <FileText
                                    className="h-4 w-4 shrink-0 text-slate-400"
                                    aria-hidden="true"
                                />
                                <div className="min-w-0">
                                    <p className="truncate font-medium">
                                        {document.fileName}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(document.createdAt).toLocaleDateString()}
                                        {document.version ? ` · v${document.version}` : ""}
                                        {document.sizeBytes
                                            ? ` · ${Math.round(document.sizeBytes / 1024)} KB`
                                            : ""}
                                    </p>
                                </div>
                            </div>
                            <a
                                href={portalApi.downloadUrl(document.id)}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-slate-50"
                            >
                                <Download className="h-4 w-4" aria-hidden="true" />
                                Download
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}