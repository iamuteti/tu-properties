"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { procurementApi } from "@/lib/api";

/**
 * Raise a purchase request (Module 10).
 *
 * Lines are mandatory and editable right here, rather than being added after
 * saving, because the request is refused without them: an empty request has
 * nothing to compare quotations against, so the API will not create one. The
 * form says that in those words rather than letting somebody discover it at the
 * point of pressing Save.
 *
 * Prices are optional per line. "We need it and we do not know the price" is a
 * real request — the total simply stays blank instead of showing a fabricated
 * zero.
 */

export const PURCHASE_CATEGORY_OPTIONS = [
    { value: 'MAINTENANCE_PARTS', label: 'Maintenance parts' },
    { value: 'EQUIPMENT', label: 'Equipment' },
    { value: 'FURNITURE', label: 'Furniture' },
    { value: 'IT_AND_TECH', label: 'IT and technology' },
    { value: 'STATIONERY', label: 'Stationery' },
    { value: 'CLEANING', label: 'Cleaning' },
    { value: 'SECURITY', label: 'Security' },
    { value: 'UTILITIES', label: 'Utilities' },
    { value: 'PROFESSIONAL_SERVICES', label: 'Professional services' },
    { value: 'OTHER', label: 'Other' },
];

export const PURCHASE_PRIORITY_OPTIONS = [
    { value: 'LOW', label: 'Low' },
    { value: 'NORMAL', label: 'Normal' },
    { value: 'HIGH', label: 'High' },
    { value: 'URGENT', label: 'Urgent' },
];

interface DraftLine {
    description: string;
    quantity: string;
    unitPrice: string;
}

const emptyLine = (): DraftLine => ({ description: '', quantity: '1', unitPrice: '' });

export function PurchaseRequestForm() {
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('MAINTENANCE_PARTS');
    const [priority, setPriority] = useState('NORMAL');
    const [department, setDepartment] = useState('');
    const [neededBy, setNeededBy] = useState('');
    const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
    const [busy, setBusy] = useState<'draft' | 'submit' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const updateLine = (index: number, patch: Partial<DraftLine>) => {
        setLines((current) =>
            current.map((line, position) =>
                position === index ? { ...line, ...patch } : line,
            ),
        );
    };

    const total = lines.reduce(
        (sum, line) =>
            sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
        0,
    );
    const pricedLines = lines.filter((line) => line.unitPrice !== '').length;

    const usableLines = lines.filter((line) => line.description.trim().length > 1);
    const canSubmit = title.trim().length >= 3 && usableLines.length > 0;

    const save = async (saveAsDraft: boolean) => {
        setBusy(saveAsDraft ? 'draft' : 'submit');
        setError(null);
        try {
            const response = await procurementApi.createPurchaseRequest({
                title: title.trim(),
                description: description.trim() || undefined,
                category,
                priority,
                department: department.trim() || undefined,
                neededBy: neededBy || undefined,
                saveAsDraft,
                lines: usableLines.map((line) => ({
                    description: line.description.trim(),
                    quantity: Number(line.quantity) || 1,
                    ...(line.unitPrice !== ''
                        ? { unitPrice: Number(line.unitPrice) }
                        : {}),
                })),
            });
            router.push(`/procurement/purchase-requests/${response.data.id}`);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : 'Could not save the request',
            );
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">What is needed</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <Label htmlFor="title">Title</Label>
                            <Input
                                id="title"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="Lift ropes for Tamarind Court"
                            />
                        </div>
                        <div>
                            <Label htmlFor="category">Category</Label>
                            <Select
                                name="category"
                                value={category}
                                onChange={(event) => setCategory(event.target.value)}
                                options={PURCHASE_CATEGORY_OPTIONS}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                                Decides which expense account the eventual bill posts to.
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="priority">Priority</Label>
                            <Select
                                name="priority"
                                value={priority}
                                onChange={(event) => setPriority(event.target.value)}
                                options={PURCHASE_PRIORITY_OPTIONS}
                            />
                        </div>
                        <div>
                            <Label htmlFor="department">Department</Label>
                            <Input
                                id="department"
                                value={department}
                                onChange={(event) => setDepartment(event.target.value)}
                                placeholder="Maintenance"
                            />
                        </div>
                        <div>
                            <Label htmlFor="neededBy">Needed by</Label>
                            <Input
                                id="neededBy"
                                type="date"
                                value={neededBy}
                                onChange={(event) => setNeededBy(event.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="description">Why it is needed</Label>
                        <Textarea
                            id="description"
                            rows={4}
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="The service report recommends replacement this quarter."
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                            This is what an approver reads. The title alone rarely says enough.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">
                        Items
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                            At least one — a request with nothing on it cannot be quoted for
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead className="w-28 text-right">Quantity</TableHead>
                                <TableHead className="w-36 text-right">Unit price</TableHead>
                                <TableHead className="w-32 text-right">Line total</TableHead>
                                <TableHead className="w-12" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lines.map((line, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <Input
                                            value={line.description}
                                            onChange={(event) =>
                                                updateLine(index, {
                                                    description: event.target.value,
                                                })
                                            }
                                            placeholder="Lift ropes, 6m"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            className="text-right"
                                            value={line.quantity}
                                            onChange={(event) =>
                                                updateLine(index, {
                                                    quantity: event.target.value,
                                                })
                                            }
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="text-right"
                                            value={line.unitPrice}
                                            onChange={(event) =>
                                                updateLine(index, {
                                                    unitPrice: event.target.value,
                                                })
                                            }
                                            placeholder="optional"
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {line.unitPrice !== ''
                                            ? (
                                                  ((Number(line.quantity) || 0) *
                                                      (Number(line.unitPrice) || 0)
                                                  ).toLocaleString('en-KE', {
                                                      minimumFractionDigits: 2,
                                                      maximumFractionDigits: 2,
                                                  })
                                              )
                                            : '—'}
                                    </TableCell>
                                    <TableCell>
                                        {lines.length > 1 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                aria-label="Remove this line"
                                                onClick={() =>
                                                    setLines((current) =>
                                                        current.filter(
                                                            (_, position) =>
                                                                position !== index,
                                                        ),
                                                    )
                                                }
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLines((current) => [...current, emptyLine()])}
                        >
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add an item
                        </Button>
                        <p className="text-sm text-muted-foreground">
                            {pricedLines === 0
                                ? 'No prices yet — leave them blank and the total stays blank.'
                                : `Estimated total ${total.toLocaleString('en-KE', {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                  })} (from ${pricedLines} priced ${
                                      pricedLines === 1 ? 'line' : 'lines'
                                  })`}
                        </p>
                    </div>
                </CardContent>
            </Card>

            {error && <div className="text-sm text-destructive">{error}</div>}

            <div className="flex flex-wrap gap-2">
                <Button
                    disabled={!canSubmit || busy !== null}
                    onClick={() => void save(false)}
                >
                    {busy === 'submit' ? 'Sending...' : 'Send for approval'}
                </Button>
                <Button
                    variant="outline"
                    disabled={!canSubmit || busy !== null}
                    onClick={() => void save(true)}
                >
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    Save as a draft
                </Button>
                <Button variant="ghost" onClick={() => router.back()}>
                    Cancel
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">
                Saving as a draft keeps it out of the approval inbox until the items are right.
                It costs nothing to start one now.
            </p>
        </div>
    );
}