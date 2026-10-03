'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileUp, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/entity-states';
import type { ImportReport } from '@/types';

/**
 * CSV bulk import (properties / units).
 *
 * Properties and units are the high-volume entities the UX standards require
 * bulk import for. The file is parsed server-side — this component only picks
 * the file, offers a dry run so a bad file is caught before anything is
 * written, and renders the per-row report the API returns.
 */
export function CsvImportModal({
    isOpen,
    onClose,
    entityLabel,
    templateUrl,
    onImport,
}: {
    isOpen: boolean;
    onClose: () => void;
    entityLabel: string;
    templateUrl: string;
    onImport: (csv: string, dryRun: boolean) => Promise<{ data: ImportReport }>;
}) {
    const [csv, setCsv] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string | null>(null);
    const [report, setReport] = useState<ImportReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState<null | 'preview' | 'import'>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const reset = () => {
        setCsv(null);
        setFileName(null);
        setReport(null);
        setError(null);
        setIsBusy(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    const close = () => {
        reset();
        onClose();
    };

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setReport(null);
        try {
            const text = await file.text();
            setCsv(text);
            setFileName(file.name);
        } catch {
            setError('Could not read that file.');
        }
    };

    const run = async (dryRun: boolean) => {
        if (!csv) return;
        setIsBusy(dryRun ? 'preview' : 'import');
        setError(null);
        try {
            const response = await onImport(csv, dryRun);
            setReport(response.data);
            if (!dryRun) {
                toast.success(
                    `Imported ${response.data.created} ${entityLabel.toLowerCase()}${
                        response.data.failed ? `, ${response.data.failed} failed` : ''
                    }`,
                );
                if (response.data.failed === 0) close();
            }
        } catch (err: any) {
            const message = Array.isArray(err.response?.data?.message)
                ? err.response.data.message.join(' ')
                : err.response?.data?.message || 'Import failed.';
            setError(message);
        } finally {
            setIsBusy(null);
        }
    };

    const failedRows = report?.results.filter((row) => row.status === 'failed') ?? [];
    const skippedRows = report?.results.filter((row) => row.status === 'skipped') ?? [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Import ${entityLabel} from CSV`}>
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
                <header className="flex items-center justify-between border-b px-5 py-4">
                    <h2 className="text-lg font-semibold">Import {entityLabel.toLowerCase()}</h2>
                    <button
                        type="button"
                        onClick={close}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100"
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <p className="text-sm text-muted-foreground">
                        Upload a CSV. Start with the template so the column names match — unknown columns are
                        ignored, missing required columns are rejected before anything is written.
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => window.open(templateUrl, "_blank")}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Download template
                        </Button>
                        <input
                            ref={inputRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={(event) => handleFile(event.target.files?.[0])}
                        />
                        <Button variant="outline" onClick={() => inputRef.current?.click()}>
                            <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
                            {fileName ?? 'Choose CSV file'}
                        </Button>
                    </div>

                    {error && <ErrorState message={error} />}

                    {!csv && !error && (
                        <EmptyState
                            title="No file selected"
                            description="Pick a CSV to preview it before importing."
                            icon={<Upload className="h-10 w-10" aria-hidden="true" />}
                        />
                    )}

                    {report && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <Stat label="Rows" value={report.total} />
                                <Stat label="Created" value={report.created} tone="text-green-700" />
                                <Stat label="Skipped" value={report.skipped} tone="text-amber-700" />
                                <Stat label="Failed" value={report.failed} tone="text-red-600" />
                            </div>

                            {report.dryRun && (
                                <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
                                    Dry run — nothing was written. Import to apply these changes.
                                </p>
                            )}

                            {failedRows.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-red-700">Rows that need fixing</h3>
                                    <ul className="max-h-40 divide-y overflow-y-auto rounded-md border text-sm">
                                        {failedRows.map((row) => (
                                            <li key={row.row} className="px-3 py-2">
                                                <span className="font-medium">Row {row.row}</span>
                                                {row.code && <span className="ml-2 font-mono text-xs">{row.code}</span>}
                                                <span className="block text-xs text-red-600">{row.message}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {skippedRows.length > 0 && (
                                <details className="text-sm">
                                    <summary className="cursor-pointer text-amber-700">
                                        {skippedRows.length} row(s) skipped
                                    </summary>
                                    <ul className="mt-2 max-h-32 divide-y overflow-y-auto rounded-md border">
                                        {skippedRows.map((row) => (
                                            <li key={row.row} className="px-3 py-1.5">
                                                Row {row.row}: {row.message}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </div>
                    )}
                </div>

                <footer className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
                    <Button variant="ghost" onClick={close}>
                        Cancel
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => run(true)}
                        disabled={!csv || isBusy !== null || (report !== null && !report.dryRun)}
                    >
                        {isBusy === 'preview' ? 'Checking…' : 'Preview'}
                    </Button>
                    <Button
                        onClick={() => run(false)}
                        disabled={!csv || isBusy !== null || (report !== null && report.dryRun && report.failed > 0)}
                    >
                        {isBusy === 'import' ? 'Importing…' : 'Import'}
                    </Button>
                </footer>
            </div>
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
    return (
        <div className="rounded-md border px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`text-lg font-bold ${tone ?? ""}`}>{value}</p>
        </div>
    );
}