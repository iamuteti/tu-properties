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
import { usersApi } from "@/lib/api";
import { Role, RoleAssignment, User } from "@/types";
import { Plus, UserPlus, Loader2, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

const LEGACY_ROLE_LABELS: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    PROPERTY_MANAGER: "Property Manager",
    ACCOUNTANT: "Accountant",
    USER: "User",
};

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Invite
    const [inviteOpen, setInviteOpen] = useState(false);
    const [invite, setInvite] = useState({
        email: "",
        firstName: "",
        lastName: "",
        phone: "",
        roleId: "",
    });
    const [inviting, setInviting] = useState(false);
    const [issuedPassword, setIssuedPassword] = useState<string | null>(null);

    // Role assignment
    const [roleTarget, setRoleTarget] = useState<User | null>(null);
    const [userRoles, setUserRoles] = useState<RoleAssignment[]>([]);
    const [rolesLoading, setRolesLoading] = useState(false);
    const [rolesSaving, setRolesSaving] = useState(false);

    // Delete
    const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

    const load = useCallback(async () => {
        try {
            const [usersRes, rolesRes] = await Promise.all([
                usersApi.findAll(),
                usersApi.listRoles(),
            ]);
            setUsers(usersRes.data);
            setRoles(rolesRes.data);
            setError(null);
        } catch {
            setError("Failed to load users.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openInvite = () => {
        setInvite({ email: "", firstName: "", lastName: "", phone: "", roleId: "" });
        setIssuedPassword(null);
        setInviteOpen(true);
    };

    const handleInvite = async () => {
        if (!invite.email.trim() || !invite.firstName.trim() || !invite.lastName.trim()) return;
        setInviting(true);
        try {
            const res = await usersApi.create({
                email: invite.email.trim(),
                firstName: invite.firstName.trim(),
                lastName: invite.lastName.trim(),
                phone: invite.phone.trim() || undefined,
            });
            const { user: created, temporaryPassword } = res.data;
            if (invite.roleId) {
                await usersApi.setUserRoles(created.id, [invite.roleId]);
            }
            setIssuedPassword(temporaryPassword ?? null);
            load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to invite user");
        } finally {
            setInviting(false);
        }
    };

    const openRoles = async (user: User) => {
        setRoleTarget(user);
        setRolesLoading(true);
        try {
            const res = await usersApi.getUserRoles(user.id);
            setUserRoles(res.data);
        } catch {
            setUserRoles([]);
        } finally {
            setRolesLoading(false);
        }
    };

    const toggleRole = (role: Role) => {
        setUserRoles((prev) =>
            prev.some((a) => a.roleId === role.id)
                ? prev.filter((a) => a.roleId !== role.id)
                : [...prev, { id: "", roleId: role.id, role } as RoleAssignment],
        );
    };

    const saveRoles = async () => {
        if (!roleTarget) return;
        setRolesSaving(true);
        try {
            await usersApi.setUserRoles(
                roleTarget.id,
                userRoles.map((a) => a.roleId),
            );
            toast.success("Roles updated");
            setRoleTarget(null);
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to update roles");
        } finally {
            setRolesSaving(false);
        }
    };

    const toggleActive = async (user: User) => {
        try {
            await usersApi.update(user.id, { isActive: !user.isActive });
            toast.success(user.isActive ? "User deactivated" : "User activated");
            load();
        } catch {
            toast.error("Failed to update user");
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await usersApi.remove(deleteTarget.id);
            toast.success("User deleted");
            load();
        } catch {
            toast.error("Failed to delete user");
        }
    };

    if (loading) {
        return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading users…</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                    <p className="text-muted-foreground">
                        Invite team members and manage their roles
                    </p>
                </div>
                <Button onClick={openInvite}>
                    <UserPlus className="mr-2 h-4 w-4" /> Invite User
                </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        )}
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>
                                    <span className="font-medium">
                                        {user.firstName} {user.lastName}
                                    </span>
                                </TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>
                                    <button
                                        onClick={() => openRoles(user)}
                                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                                        title="Manage roles"
                                    >
                                        <Shield className="h-3 w-3" />
                                        {LEGACY_ROLE_LABELS[user.role] || user.role}
                                    </button>
                                </TableCell>
                                <TableCell>
                                    <button onClick={() => toggleActive(user)} className="cursor-pointer">
                                        <span
                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                                user.isActive
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-gray-100 text-gray-600"
                                            }`}
                                        >
                                            {user.isActive ? "Active" : "Inactive"}
                                        </span>
                                    </button>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setDeleteTarget(user)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Invite modal */}
            <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite User">
                {issuedPassword ? (
                    <div className="space-y-4">
                        <p className="text-sm">
                            <span className="font-medium">{invite.firstName} {invite.lastName}</span> was invited.
                        </p>
                        <div className="rounded-md border bg-muted p-3">
                            <p className="text-xs text-muted-foreground">
                                Temporary password — share it securely. The user should change it after first sign-in.
                            </p>
                            <code className="mt-2 block break-all font-mono text-sm font-semibold">
                                {issuedPassword}
                            </code>
                        </div>
                        <div className="flex justify-end">
                            <Button onClick={() => setInviteOpen(false)}>Done</Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Email *</Label>
                            <Input
                                type="email"
                                value={invite.email}
                                onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))}
                                placeholder="colleague@example.com"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>First Name *</Label>
                                <Input
                                    value={invite.firstName}
                                    onChange={(e) => setInvite((f) => ({ ...f, firstName: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Last Name *</Label>
                                <Input
                                    value={invite.lastName}
                                    onChange={(e) => setInvite((f) => ({ ...f, lastName: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input
                                value={invite.phone}
                                onChange={(e) => setInvite((f) => ({ ...f, phone: e.target.value }))}
                                placeholder="+254 700 000 000"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Role</Label>
                            <select
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                                value={invite.roleId}
                                onChange={(e) => setInvite((f) => ({ ...f, roleId: e.target.value }))}
                            >
                                <option value="">No structured role (default access)</option>
                                {roles.map((role) => (
                                    <option key={role.id} value={role.id}>
                                        {role.name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Structured roles control exactly which modules this user can read and write.
                            </p>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => setInviteOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleInvite}
                                disabled={
                                    inviting ||
                                    !invite.email.trim() ||
                                    !invite.firstName.trim() ||
                                    !invite.lastName.trim()
                                }
                            >
                                {inviting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                Invite
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Role assignment modal */}
            <Modal
                isOpen={roleTarget !== null}
                onClose={() => setRoleTarget(null)}
                title={`Roles — ${roleTarget ? `${roleTarget.firstName} ${roleTarget.lastName}` : ""}`}
            >
                <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Select every role that applies. Leave all unselected to rely on
                        the user&apos;s default (legacy) role.
                    </p>
                    {rolesLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading roles…
                        </div>
                    ) : (
                        <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
                            {roles.map((role) => {
                                const assigned = userRoles.some((a) => a.roleId === role.id);
                                return (
                                    <label
                                        key={role.id}
                                        className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={assigned}
                                            onChange={() => toggleRole(role)}
                                            className="mt-0.5 h-4 w-4 rounded border-gray-300"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium">
                                                {role.name}
                                                {role.isSystem ? null : (
                                                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                                        Org role
                                                    </span>
                                                )}
                                            </span>
                                            {role.description ? (
                                                <span className="block text-xs text-muted-foreground">
                                                    {role.description}
                                                </span>
                                            ) : null}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setRoleTarget(null)}>
                            Cancel
                        </Button>
                        <Button onClick={saveRoles} disabled={rolesSaving || rolesLoading}>
                            {rolesSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Roles
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                isOpen={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title="Delete User"
                message={`Delete ${deleteTarget?.email}? This removes their account immediately.`}
            />
        </div>
    );
}
