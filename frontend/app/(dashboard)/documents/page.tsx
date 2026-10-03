"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { documentsApi } from "@/lib/api";
import { Document } from "@/types";
import { UploadCloud, Download, Loader2, Trash2, File as FileIcon } from "lucide-react";
import { toast } from "sonner";

const ENTITY_TYPES = [
    "Property",
    "Unit",
    "Tenant",
    "Landlord",
    "RentalAgreement",
    "Invoice",
    "Payment",
    "Receipt",
    "MoveOutRequest",
    "Branch",
    "User",
    "Organization",
];

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
    const [docs, setDocs] = useState<Document[]>([]);
    const [meta, setMeta] = useState<{ total: number; page: number; totalPages: number } | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterEntityType, setFilterEntityType] = useState("");
    const [filterEntityId, setFilterEntityId] = useState("");

    // Upload
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadEntityType, setUploadEntityType] = useState(ENTITY_TYPES[0]);
    const [uploadEntityId, setUploadEntityId] = useState("");
    const [uploading, setUploading] = useState(false);

    // Delete
    const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await documentsApi.findAll({
                entityType: filterEntityType || undefined,
                entityId: filterEntityId || undefined,
                page,
                limit: 20,
            });
            setDocs(res.data.data);
            setMeta({
                total: res.data.meta.total,
                page: res.data.meta.page,
                totalPages: res.data.meta.totalPages,
            });
            setError(null);
        } catch {
            setError("Failed to load documents.");
        } finally {
            setLoading(false);
        }
    }, [filterEntityType, filterEntityId, page]);

    useEffect(() => {
        load();
    }, [load]);

    const handleUpload = async () => {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
            toast.error("Choose a file first");
            return;
        }
        if (!uploadEntityId.trim()) {
            toast.error("Enter the entity ID this document belongs to");
            return;
        }
        setUploading(true);
        try {
            const res = await documentsApi.upload(file, uploadEntityType, uploadEntityId.trim());
            toast.success(`Uploaded v${res.data.version} of ${res.data.fileName}`);
            setUploadEntityId("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await documentsApi.remove(deleteTarget.id);
            toast.success("Document deleted");
            load();
        } catch {
            toast.error("Failed to delete document");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
                <p className="text-muted-foreground">
                    Attachments and files linked to properties, tenants, invoices and more
                </p>
            </div>

            {/* Upload card */}
            <div className="rounded-lg border p-4">
                <div className="mb-3 flex items-center gap-2">
                    <UploadCloud className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Upload document</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                        <Label>Entity Type</Label>
                        <select
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                            value={uploadEntityType}
                            onChange={(e) => setUploadEntityType(e.target.value)}
                        >
                            {ENTITY_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <Label>Entity ID</Label>
                        <Input
                            value={uploadEntityId}
                            onChange={(e) => setUploadEntityId(e.target.value)}
                            placeholder="Record ID to attach to"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>File</Label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={() => undefined}
                            className="w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
                        />
                    </div>
                    <div className="flex items-end">
                        <Button onClick={handleUpload} disabled={uploading} className="w-full">
                            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                            Upload
                        </Button>
                    </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    Re-uploading the same file name for the same entity creates a new version instead of overwriting.
                </p>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <select
                    className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={filterEntityType}
                    onChange={(e) => {
                        setFilterEntityType(e.target.value);
                        setPage(1);
                    }}
                >
                    <option value="">All entity types</option>
                    {ENTITY_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <Input
                    placeholder="Filter by entity ID…"
                    value={filterEntityId}
                    onChange={(e) => {
                        setFilterEntityId(e.target.value);
                        setPage(1);
                    }}
                    className="w-64"
                />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>File</TableHead>
                            <TableHead>Entity</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Uploaded By</TableHead>
                            <TableHead>Uploaded At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {docs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    No documents found.
                                </TableCell>
                            </TableRow>
                        )}
                        {docs.map((doc) => (
                            <TableRow key={doc.id}>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="font-medium">{doc.fileName}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                        {doc.entityType}
                                    </span>
                                </TableCell>
                                <TableCell>
                                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                                        v{doc.version}
                                    </span>
                                </TableCell>
                                <TableCell>{formatSize(doc.sizeBytes)}</TableCell>
                                <TableCell>
                                    {doc.uploadedBy
                                        ? `${doc.uploadedBy.firstName} ${doc.uploadedBy.lastName}`
                                        : "—"}
                                </TableCell>
                                <TableCell>
                                    {new Date(doc.createdAt).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <a
                                            href={documentsApi.downloadUrl(doc.id)}
                                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                                            title="Download"
                                        >
                                            <Download className="h-4 w-4" />
                                        </a>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => setDeleteTarget(doc)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                        Page {meta.page} of {meta.totalPages} ({meta.total} documents)
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= meta.totalPages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Document"
                message={`Delete "${deleteTarget?.fileName}" (v${deleteTarget?.version})? The stored file is removed too.`}
            />
        </div>
    );
}
