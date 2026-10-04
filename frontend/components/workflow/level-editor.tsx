"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { WORKFLOW_CONDITION_OPS } from "@/lib/constants";
import type { WorkflowStepTemplate } from "@/types";

/**
 * The level editor for an approval policy (Module 18).
 *
 * Built as an explicit, ordered list rather than a drag-and-drop builder on
 * purpose: a mis-ordered approval chain is a control that silently stops
 * working, and an ordered list of named steps is something a finance manager
 * can check against their policy document line by line.
 *
 * The one thing it does *not* do is hide the condition field. "Director sign-off
 * only above 50,000" is the most common approval rule there is, and burying it
 * behind an "advanced" toggle is how it ends up unconfigured.
 */
export function LevelEditor({
    levels,
    onChange,
    roles,
    users,
}: {
    levels: WorkflowStepTemplate[];
    onChange: (levels: WorkflowStepTemplate[]) => void;
    roles: { id: string; name: string }[];
    users: { id: string; firstName: string; lastName: string }[];
}) {
    const [expanded, setExpanded] = useState<number | null>(null);

    const update = (index: number, patch: Partial<WorkflowStepTemplate>) => {
        onChange(
            levels.map((level, i) => (i === index ? { ...level, ...patch } : level)),
        );
    };

    const add = () => {
        onChange([
            ...levels,
            {
                name: `Level ${levels.length + 1}`,
                approverKind: "ROLE",
                approverRole: roles[0]?.name ?? "",
                condition: null,
                escalateAfterHours: null,
                escalateToUserId: null,
            },
        ]);
        setExpanded(levels.length);
    };

    const remove = (index: number) => onChange(levels.filter((_, i) => i !== index));

    const move = (index: number, delta: number) => {
        const next = [...levels];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    if (levels.length === 0) {
        return (
            <div className="rounded-md border border-dashed px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                    A policy needs at least one level. Without one there is nothing to
                    decide.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {levels.map((level, index) => (
                <div key={index} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-40 flex-1">
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Level name
                            </label>
                            <input
                                value={level.name}
                                onChange={(e) => update(index, { name: e.target.value })}
                                placeholder="Finance review"
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="w-36">
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Approved by
                            </label>
                            <Select
                                value={level.approverKind}
                                onChange={(e) =>
                                    update(index, {
                                        approverKind: e.target.value as "ROLE" | "USER",
                                    })
                                }
                                aria-label="Who approves this level"
                                options={[
                                    { value: "ROLE", label: "A role" },
                                    { value: "USER", label: "One person" },
                                ]}
                            />
                        </div>

                        {level.approverKind === "ROLE" ? (
                            <div className="w-52">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                    Role
                                </label>
                                <Select
                                    value={level.approverRole ?? ""}
                                    onChange={(e) =>
                                        update(index, { approverRole: e.target.value })
                                    }
                                    placeholder="Choose a role"
                                    aria-label="Role that approves"
                                    options={roles.map((role) => ({
                                        value: role.name,
                                        label: role.name,
                                    }))}
                                />
                            </div>
                        ) : (
                            <div className="w-52">
                                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                    Person
                                </label>
                                <Select
                                    value={level.approverUserId ?? ""}
                                    onChange={(e) =>
                                        update(index, { approverUserId: e.target.value })
                                    }
                                    placeholder="Choose a person"
                                    aria-label="Person that approves"
                                    options={users.map((candidate) => ({
                                        value: candidate.id,
                                        label: `${candidate.firstName} ${candidate.lastName}`,
                                    }))}
                                />
                            </div>
                        )}
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Only required when… (optional)
                            </label>
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    value={level.condition?.field ?? ""}
                                    onChange={(e) =>
                                        update(index, {
                                            condition: level.condition
                                                ? { ...level.condition, field: e.target.value }
                                                : null,
                                        })
                                    }
                                    placeholder="amount"
                                    className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                />
                                <Select
                                    value={level.condition?.op ?? ""}
                                    onChange={(e) => {
                                        const op = e.target.value;
                                        update(index, {
                                            condition: op
                                                ? {
                                                      field: level.condition?.field || "amount",
                                                      op: op as never,
                                                      value: level.condition?.value ?? "",
                                                  }
                                                : null,
                                        });
                                    }}
                                    placeholder="—"
                                    aria-label="Condition"
                                    options={WORKFLOW_CONDITION_OPS.map((option) => ({
                                        value: option.value,
                                        label: option.label,
                                    }))}
                                />
                                <input
                                    value={
                                        level.condition && level.condition.op !== 'exists'
                                            ? String(level.condition.value ?? "")
                                            : ""
                                    }
                                    disabled={!level.condition || level.condition.op === 'exists'}
                                    onChange={(e) =>
                                        update(index, {
                                            condition: level.condition
                                                ? {
                                                      ...level.condition,
                                                      value: coerce(
                                                          e.target.value,
                                                          level.condition.op,
                                                      ),
                                                  }
                                                : null,
                                        })
                                    }
                                    placeholder="50000"
                                    className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                                />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                A level that does not apply is recorded as skipped, not
                                dropped — so the trail still shows it was considered.
                            </p>
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Escalate after (hours)
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={level.escalateAfterHours ?? ""}
                                onChange={(e) =>
                                    update(index, {
                                        escalateAfterHours: e.target.value
                                            ? Number(e.target.value)
                                            : null,
                                    })
                                }
                                placeholder="No deadline"
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    {level.escalateAfterHours ? (
                        <div className="mt-3">
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">
                                Hand it to when the deadline passes
                            </label>
                            <Select
                                value={level.escalateToUserId ?? ""}
                                onChange={(e) =>
                                    update(index, {
                                        escalateToUserId: e.target.value || null,
                                    })
                                }
                                placeholder="Nobody — just flag it as overdue"
                                aria-label="Escalation target"
                                options={users.map((candidate) => ({
                                    value: candidate.id,
                                    label: `${candidate.firstName} ${candidate.lastName}`,
                                }))}
                            />
                        </div>
                    ) : null}

                    <div className="mt-4 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => setExpanded(expanded === index ? null : index)}
                            className="text-xs text-muted-foreground hover:underline"
                        >
                            {expanded === index ? "Hide plain English" : "What does this mean?"}
                        </button>
                        {expanded === index && (
                            <span className="text-xs text-muted-foreground">
                                {plainEnglish(level)}
                            </span>
                        )}
                        <div className="flex gap-1">
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={index === 0}
                                onClick={() => move(index, -1)}
                            >
                                Up
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={index === levels.length - 1}
                                onClick={() => move(index, 1)}
                            >
                                Down
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={levels.length <= 1}
                                onClick={() => remove(index)}
                            >
                                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                Remove
                            </Button>
                        </div>
                    </div>
                </div>
            ))}

            <Button size="sm" variant="outline" onClick={add}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add a level
            </Button>
        </div>
    );
}

/**
 * A sentence describing what the policy does.
 *
 * An approval policy is a control that is easy to get subtly wrong and hard to
 * audit, so the editor restates it in English beside the fields. This is what
 * gets read back in a review.
 */
export function plainEnglish(level: WorkflowStepTemplate): string {
    const who =
        level.approverKind === "USER"
            ? "one named person"
            : `anyone holding ${level.approverRole || "a role"}`;
    const when = level.condition?.field
        ? `only when ${level.condition.field} ${describeOp(level.condition.op)} ${
              level.condition.op === 'exists' ? '' : level.condition.value
          }`.trim()
        : "every time";
    const escalation = level.escalateAfterHours
        ? level.escalateToUserId
            ? `, handed to a named approver after ${level.escalateAfterHours}h`
            : `, flagged as overdue after ${level.escalateAfterHours}h`
        : "";
    return `“${level.name}”: ${who} decides ${when}${escalation}.`;
}

function describeOp(op: string): string {
    return WORKFLOW_CONDITION_OPS.find((option) => option.value === op)?.label ?? op;
}

/** `"50000"` should compare as a number, `"KES"` as text. */
function coerce(raw: string, op: string): unknown {
    if (raw.trim() === '') return '';
    if (op === 'in') {
        return raw
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
    }
    const numeric = Number(raw.replace(/,/g, ''));
    return Number.isFinite(numeric) && raw.trim() !== '' ? numeric : raw;
}