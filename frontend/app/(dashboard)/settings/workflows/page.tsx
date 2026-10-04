"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { GitBranch, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { LevelEditor, plainEnglish } from "@/components/workflow/level-editor";
import { workflowsApi } from "@/lib/api";
import { WORKFLOW_ENTITY_TYPES } from "@/lib/constants";
import type { WorkflowDefinition, WorkflowStepTemplate } from "@/types";

/**
 * Approval policies (Module 18).
 *
 * This page is the module's whole point: "who signs off a refund, and when" is a
 * policy an organization decides and changes, not something a service hardcodes.
 * Editing a row changes how the next request behaves — there is no code path per
 * organization, and nothing to deploy.
 *
 * Two rules the UI respects rather than hides:
 *
 *   - A platform default is read-only here. Editing it would change it for every
 *     other tenant, so organizations copy it instead. (The API refuses this too;
 *     the UI refuses to offer the button.)
 *   - A definition cannot be deleted while requests are still running under it.
 *     Deactivating it is what stops new requests without stranding the ones in
 *     flight.
 */
export default function WorkflowSettingsPage() {
    const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
    const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
    const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /**
     * What the editor is editing, and how.
     *
     * `copy` exists because a platform default cannot be edited from inside an
     * organization — that would change it for every other tenant. Copying is the
     * supported way to start from one, so it needs to be a first-class mode
     * rather than "open it and hope the save is rejected".
     */
    const [editing, setEditing] = useState<
        | { mode: "edit"; definition: WorkflowDefinition }
        | { mode: "copy"; definition: WorkflowDefinition }
        | { mode: "new" }
        | null
    >(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [defs, options] = await Promise.all([
                workflowsApi.definitions(),
                workflowsApi.approverOptions(),
            ]);
            setDefinitions(defs.data);
            setRoles(options.data.roles);
            setUsers(options.data.users);
        } catch (err: any) {
            setError(err.response?.data?.message || "Could not load approval policies.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const remove = async (definition: WorkflowDefinition) => {
        if (
            !window.confirm(
                `Delete “${definition.name}”? Requests raised under it keep their history, but this cannot be undone.`,
            )
        ) {
            return;
        }
        try {
            await workflowsApi.deleteDefinition(definition.id);
            toast.success("Policy deleted");
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not delete that policy.");
        }
    };

    const toggle = async (definition: WorkflowDefinition) => {
        try {
            await workflowsApi.updateDefinition(definition.id, {
                isActive: !definition.isActive,
            });
            toast.success(definition.isActive ? "Policy switched off" : "Policy switched on");
            await load();
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Could not change that policy.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        Approval workflows
                    </h1>
                    <p className="text-muted-foreground">
                        Which requests need sign-off, and who signs them
                    </p>
                </div>
                <Button onClick={() => setEditing({ mode: "new" })}>
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    New policy
                </Button>
            </div>

            {editing && (
                <DefinitionEditor
                    key={editing.mode + "-" + (editing.mode === "new" ? "new" : editing.definition.id)}
                    mode={editing.mode}
                    definition={editing.mode === "new" ? null : editing.definition}
                    roles={roles}
                    users={users}
                    onClose={() => setEditing(null)}
                    onSaved={async () => {
                        setEditing(null);
                        await load();
                    }}
                />
            )}

            {isLoading ? (
                <LoadingState label="Loading policies…" />
            ) : error ? (
                <ErrorState message={error} onRetry={load} />
            ) : definitions.length === 0 ? (
                <EmptyState
                    title="No policies yet"
                    description="Without a policy a request is processed straight away. Add one to make it wait for a decision."
                    icon={<GitBranch className="h-10 w-10" aria-hidden="true" />}
                    action={
                        <Button onClick={() => setEditing({ mode: "new" })}>
                            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            New policy
                        </Button>
                    }
                />
            ) : (
                <ul className="space-y-3">
                    {definitions.map((definition) => {
                        const isPlatform = definition.organizationId === null;
                        return (
                            <li key={definition.id}>
                                <Card className={definition.isActive ? undefined : "opacity-70"}>
                                    <CardContent className="space-y-3 p-5">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-medium">{definition.name}</p>
                                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                                        {definition.entityType}
                                                    </span>
                                                    {isPlatform && (
                                                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                                                            Platform default
                                                        </span>
                                                    )}
                                                    {!definition.isActive && (
                                                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
                                                            Switched off
                                                        </span>
                                                    )}
                                                </div>
                                                {definition.description && (
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        {definition.description}
                                                    </p>
                                                )}
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {definition._count?.instances ?? 0} request(s)
                                                    raised under this policy
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {!isPlatform && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() =>
                                                                toggle(definition)
                                                            }
                                                        >
                                                            {definition.isActive
                                                                ? "Switch off"
                                                                : "Switch on"}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() =>
                                                                setEditing({ mode: "edit", definition })
                                                            }
                                                        >
                                                            <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() =>
                                                                remove(definition)
                                                            }
                                                        >
                                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                            <span className="sr-only">
                                                                Delete {definition.name}
                                                            </span>
                                                        </Button>
                                                    </>
                                                )}
                                                {isPlatform && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() =>
                                                            setEditing({
                                                                mode: "copy",
                                                                definition,
                                                            })
                                                        }
                                                    >
                                                        Copy to my organization
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        <ol className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">
                                            {(definition.steps ?? []).map((level, index) => (
                                                <li key={index}>{plainEnglish(level)}</li>
                                            ))}
                                        </ol>
                                    </CardContent>
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function DefinitionEditor({
    mode,
    definition,
    roles,
    users,
    onClose,
    onSaved,
}: {
    mode: "edit" | "copy" | "new";
    definition: WorkflowDefinition | null;
    roles: { id: string; name: string }[];
    users: { id: string; firstName: string; lastName: string }[];
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const [entityType, setEntityType] = useState(
        definition?.entityType ?? WORKFLOW_ENTITY_TYPES[0].value,
    );
    const [name, setName] = useState(definition?.name ?? "");
    const [description, setDescription] = useState(definition?.description ?? "");
    const [levels, setLevels] = useState<WorkflowStepTemplate[]>(
        definition?.steps ?? [
            {
                name: "Finance review",
                approverKind: "ROLE",
                approverRole: roles.find((r) => r.name === "accountant")?.name ?? "",
                condition: null,
                escalateAfterHours: null,
                escalateToUserId: null,
            },
        ],
    );
    const [busy, setBusy] = useState(false);

    const save = async () => {
        if (!name.trim()) {
            toast.error("Give the policy a name — it is what appears in the trail.");
            return;
        }
        if (levels.some((level) => !level.name.trim())) {
            toast.error("Every level needs a name.");
            return;
        }
        setBusy(true);
        try {
            if (mode === "edit" && definition) {
                await workflowsApi.updateDefinition(definition.id, {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    steps: levels,
                });
                toast.success("Policy updated", {
                    description:
                        "Requests already raised keep the levels they were raised under.",
                });
            } else {
                await workflowsApi.createDefinition({
                    entityType,
                    name: name.trim(),
                    description: description.trim() || undefined,
                    steps: levels,
                });
                toast.success(
                    mode === "copy" ? "Copied to your organization" : "Policy created",
                    {
                        description:
                            mode === "copy"
                                ? "Yours now shadows the platform default. The default is unchanged."
                                : undefined,
                    },
                );
            }
            await onSaved();
        } catch (err: any) {
            const message = err.response?.data?.message;
            toast.error(Array.isArray(message) ? message.join(" ") : message || "Could not save.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap gap-3">
                    {mode !== "edit" && (
                        <div className="w-64">
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Applies to
                            </label>
                            <Select
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value)}
                                aria-label="Which requests this policy applies to"
                                options={WORKFLOW_ENTITY_TYPES}
                            />
                        </div>
                    )}
                    <div className="min-w-56 flex-1">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Policy name
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Refund approval"
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Description (optional)
                    </label>
                    <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Who signs these off, and why"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                </div>

                <LevelEditor
                    levels={levels}
                    onChange={setLevels}
                    roles={roles}
                    users={users}
                />

                {mode === "copy" && (
                    <p className="rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-900">
                        Saving creates your organization&apos;s own copy. The platform
                        default is left untouched for everyone else.
                    </p>
                )}
                <div className="flex gap-2">
                    <Button disabled={busy} onClick={save}>
                        {busy
                            ? "Saving…"
                            : mode === "edit"
                              ? "Save policy"
                              : mode === "copy"
                                ? "Copy to my organization"
                                : "Create policy"}
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={onClose}>
                        Cancel
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}