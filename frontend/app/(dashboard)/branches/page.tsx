"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { branchesApi } from "@/lib/api";
import { Branch } from "@/types";
import { Plus, Building2, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function BranchesPage() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState("");

    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({
        name: "",
        code: "",
        address: "",
        city: "",
        phone: "",
        email: "",
    });
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await branchesApi.findAll({
                search: search || undefined,
            });
            setBranches(res.data);
            setError(null);
        } catch {
            setError("Failed to load branches.");
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setForm({ name: "", code: "", address: "", city: "", phone: "", email: "" });
        setModalOpen(true);
    };

    const handleCreate = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            await branchesApi.create({
                name: form.name.trim(),
                code: form.code.trim() || undefined,
                address: form.address.trim() || undefined,
                city: form.city.trim() || undefined,
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
            });
            toast.success("Branch created");
            setModalOpen(false);
            load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to create branch");
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (branch: Branch) => {
        try {
            await branchesApi.update(branch.id, { isActive: !branch.isActive });
            toast.success(branch.isActive ? "Branch deactivated" : "Branch activated");
            load();
        } catch {
            toast.error("Failed to update branch");
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await branchesApi.remove(deleteTarget.id);
            toast.success("Branch deleted");
            load();
        } catch {
            toast.error("Failed to delete branch");
        }
    };

    if (loading) {
        return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading branches…</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Branches</h1>
                    <p className="text-muted-foreground">
                        Offices and branches of your organization
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" /> Add Branch
                </Button>
            </div>

            <Input
                placeholder="Search branches by name, code, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
            />

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>City</TableHead>
                            <TableHead>Contact</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {branches.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                    No branches yet. Add your first branch to get started.
                                </TableCell>
                            </TableRow>
                        )}
                        {branches.map((branch) => (
                            <TableRow key={branch.id}>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                        <span className="font-medium">{branch.name}</span>
                                    </div>
                                </TableCell>
                                <TableCell>{branch.code || "—"}</TableCell>
                                <TableCell>{branch.city || "—"}</TableCell>
                                <TableCell>
                                    <div className="text-sm">
                                        {branch.email || "—"}
                                        {branch.phone ? <div className="text-xs text-muted-foreground">{branch.phone}</div> : null}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <button onClick={() => toggleActive(branch)} className="cursor-pointer">
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                branch.isActive
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-gray-100 text-gray-600"
                                            }`}
                                        >
                                            {branch.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </button>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setDeleteTarget(branch)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Branch">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Branch Name *</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="HQ Nairobi"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Code</Label>
                            <Input
                                value={form.code}
                                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                                placeholder="HQR"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Address</Label>
                        <Input
                            value={form.address}
                            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                            placeholder="Street address"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>City</Label>
                            <Input
                                value={form.city}
                                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                                placeholder="Nairobi"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input
                                value={form.phone}
                                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                                placeholder="+254 700 000 000"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Email</Label>
                        <Input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                            placeholder="office@example.com"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreate} disabled={saving || !form.name.trim()}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Create Branch
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete Branch"
                message={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
            />
        </div>
    );
}
