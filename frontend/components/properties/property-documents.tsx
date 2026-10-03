'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileText, ImageIcon, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { documentsApi } from '@/lib/api';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/entity-states';
import type { Document } from '@/types';

/**
 * Photos, floor plans and other files for a property.
 *
 * Uploads go through the Module 1 Document Center rather than a bespoke upload
 * mechanism — same versioning, same tenant scoping, same download path. Floor
 * plans are ordinary documents here; a document *kind* (photo / floor plan /
 * contract) is Module 16 (Documents & Legal) work, so this panel groups by
 * mime type and labels everything else generically instead of inventing a
 * field that nothing else would understand.
 */
export function PropertyDocuments({ propertyId }: { propertyId: string }) {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await documentsApi.findAll({
                entityType: 'Property',
                entityId: propertyId,
                limit: 100,
            });
            setDocuments(response.data.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load documents.');
        } finally {
            setIsLoading(false);
        }
    }, [propertyId]);

    useEffect(() => {
        load();
    }, [load]);

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setIsUploading(true);
        try {
            for (const file of Array.from(files)) {
                await documentsApi.upload(file, 'Property', propertyId);
            }
            toast.success(`${files.length} file(s) uploaded`);
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Upload failed.');
        } finally {
            setIsUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleDelete = async (document: Document) => {
        if (!confirm(`Delete ${document.fileName}?`)) return;
        try {
            await documentsApi.remove(document.id);
            toast.success('File deleted');
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Delete failed.');
        }
    };

    const images = documents.filter((doc) => doc.mimeType?.startsWith('image/'));
    const files = documents.filter((doc) => !doc.mimeType?.startsWith('image/'));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    Photos, floor plans and files are stored in the document center with version history.
                </p>
                <div>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => handleFiles(event.target.files)}
                        accept="image/*,application/pdf"
                    />
                    <Button
                        variant="outline"
                        onClick={() => inputRef.current?.click()}
                        disabled={isUploading}
                    >
                        <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                        {isUploading ? 'Uploading…' : 'Upload files'}
                    </Button>
                </div>
            </div>

            {isLoading && <LoadingState label="Loading files…" />}
            {!isLoading && error && <ErrorState message={error} onRetry={load} />}

            {!isLoading && !error && documents.length === 0 && (
                <EmptyState
                    title="No photos or documents yet"
                    description="Upload property photos and floor plans — they are versioned, so re-uploading a file keeps the previous version."
                    icon={<ImageIcon className="h-10 w-10" aria-hidden="true" />}
                />
            )}

            {!isLoading && !error && images.length > 0 && (
                <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {images.map((image) => (
                        <li key={image.id} className="overflow-hidden rounded-lg border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={documentsApi.downloadUrl(image.id)}
                                alt={image.fileName}
                                className="h-32 w-full bg-slate-100 object-cover"
                            />
                            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                                <span className="truncate text-xs text-muted-foreground">
                                    v{image.version}
                                </span>
                                <span className="flex items-center gap-1">
                                    <a
                                        href={documentsApi.downloadUrl(image.id)}
                                        className="rounded p-1 text-slate-500 hover:bg-slate-100"
                                        aria-label={`Download ${image.fileName}`}
                                    >
                                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(image)}
                                        className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                        aria-label={`Delete ${image.fileName}`}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {!isLoading && !error && files.length > 0 && (
                <ul className="divide-y rounded-lg border">
                    {files.map((file) => (
                        <li key={file.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="flex min-w-0 items-center gap-2">
                                <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                                <span className="truncate text-sm">{file.fileName}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">
                                    v{file.version} · {Math.round(file.sizeBytes / 1024)} KB
                                </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                                <a
                                    href={documentsApi.downloadUrl(file.id)}
                                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                                    aria-label={`Download ${file.fileName}`}
                                >
                                    <Download className="h-4 w-4" aria-hidden="true" />
                                </a>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(file)}
                                    className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    aria-label={`Delete ${file.fileName}`}
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}