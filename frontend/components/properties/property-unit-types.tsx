"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/entity-states";
import { propertiesApi, securityDepositsApi } from "@/lib/api";
import { formatMoney } from "@/lib/currency";
import { useAuth } from "@/context/auth-context";
import type { PropertyUnitType } from "@/types";

/**
 * The property's own kinds of unit, and the deposit each of them carries.
 *
 * This is the onboarding picture. A property says "1B, 2B, 3B" and what each
 * is worth as a deposit, and every agreement raised on one of its units then
 * picks the number up from the rule instead of somebody typing it in.
 *
 * Two states that look alike and are not:
 *
 * - a rule of **zero** — "this kind of unit takes no deposit", said on the
 *   record, and
 * - **no rule at all** — "nobody has decided yet", which is why the agreement
 *   screen refuses to guess and asks.
 */
export function PropertyUnitTypes({ propertyId }: { propertyId: string }) {
    const { organization } = useAuth();
    const locale = organization?.defaultLocale ?? null;

    const [types, setTypes] = useState<PropertyUnitType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [bedrooms, setBedrooms] = useState("");

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await propertiesApi.listUnitTypes(propertyId);
            setTypes(response.data);
        } catch {
            setError("Could not load the unit types for this property.");
        } finally {
            setIsLoading(false);
        }
    }, [propertyId]);

    useEffect(() => {
        load();
    }, [load]);

    const addType = async () => {
        if (!code.trim() || !name.trim()) {
            toast.error("A unit type needs a code and a name.");
            return;
        }
        setIsSaving(true);
        try {
            await propertiesApi.createUnitType(propertyId, {
                code: code.trim(),
                name: name.trim(),
                bedrooms: bedrooms ? Number(bedrooms) : undefined,
            });
            setCode("");
            setName("");
            setBedrooms("");
            toast.success("Unit type added.");
            await load();
        } catch (err: any) {
            toast.error(
                err.response?.data?.message || "Could not add the unit type.",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const saveRule = async (
        unitType: PropertyUnitType,
        basis: string,
        amount: string,
        months: string,
    ) => {
        setIsSaving(true);
        try {
            if (basis === "NONE") {
                await securityDepositsApi.clearRule(unitType.id);
                toast.success("Deposit rule cleared.");
            } else {
                await securityDepositsApi.setRule(unitType.id, {
                    basis,
                    amount: basis === "FIXED" ? Number(amount || 0) : undefined,
                    months:
                        basis === "RENT_MONTHS" ? Number(months || 0) : undefined,
                });
                toast.success("Deposit rule saved.");
            }
            await load();
        } catch (err: any) {
            toast.error(
                err.response?.data?.message || "Could not save the deposit rule.",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const removeType = async (unitType: PropertyUnitType) => {
        setIsSaving(true);
        try {
            const result = await propertiesApi.removeUnitType(unitType.id);
            toast.success(
                result.data.unitsLeftUntyped
                    ? `Removed. ${result.data.unitsLeftUntyped} unit(s) now have no kind.`
                    : "Unit type removed.",
            );
            await load();
        } catch (err: any) {
            toast.error(
                err.response?.data?.message || "Could not remove the unit type.",
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the unit types…" />;
    if (error) return <ErrorState message={error} onRetry={load} />;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        Kinds of unit
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Each property declares its own kinds of unit — &ldquo;1B&rdquo;,
                        &ldquo;2B&rdquo;, &ldquo;3B&rdquo; — and the deposit that goes with
                        each one. Two estates call the same kind of unit different
                        things, and the deposit for a &ldquo;2B&rdquo; in one is not the
                        deposit for a &ldquo;2B&rdquo; in another.
                    </p>

                    {types.length === 0 ? (
                        <EmptyState
                            title="No kinds of unit yet"
                            description="Add one below. Until a kind of unit has a deposit rule, the agreements raised on its units have to say what the deposit is."
                            icon={<ShieldCheck className="h-10 w-10" aria-hidden="true" />}
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Units</TableHead>
                                    <TableHead>Deposit rule</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {types.map((type) => (
                                    <UnitTypeRow
                                        key={type.id}
                                        type={type}
                                        currency={organization?.currency}
                                        locale={locale}
                                        isSaving={isSaving}
                                        onSave={saveRule}
                                        onRemove={removeType}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Add a kind of unit</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-4">
                    <div>
                        <Label htmlFor="unit-type-code">Code</Label>
                        <Input
                            id="unit-type-code"
                            value={code}
                            placeholder="1B"
                            onChange={(event) => setCode(event.target.value)}
                        />
                    </div>
                    <div>
                        <Label htmlFor="unit-type-name">Name</Label>
                        <Input
                            id="unit-type-name"
                            value={name}
                            placeholder="One Bedroom"
                            onChange={(event) => setName(event.target.value)}
                        />
                    </div>
                    <div>
                        <Label htmlFor="unit-type-bedrooms">Bedrooms</Label>
                        <Input
                            id="unit-type-bedrooms"
                            type="number"
                            min={0}
                            value={bedrooms}
                            onChange={(event) => setBedrooms(event.target.value)}
                        />
                    </div>
                    <div className="flex items-end">
                        <Button onClick={addType} disabled={isSaving}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

/**
 * One kind of unit and its deposit rule.
 *
 * The rule is edited in place because it is a policy, not a document: the
 * commonest rule by far is &ldquo;one month of rent&rdquo;, and the second
 * commonest is &ldquo;no deposit&rdquo;, so both are one click away and the
 * fixed amount is the odd one out.
 */
function UnitTypeRow({
    type,
    currency,
    locale,
    isSaving,
    onSave,
    onRemove,
}: {
    type: PropertyUnitType;
    currency?: string;
    locale: string | null;
    isSaving: boolean;
    onSave: (
        type: PropertyUnitType,
        basis: string,
        amount: string,
        months: string,
    ) => Promise<void>;
    onRemove: (type: PropertyUnitType) => Promise<void>;
}) {
    const rule = type.depositRule ?? null;
    const [basis, setBasis] = useState(
        rule ? rule.basis : "NONE",
    );
    const [amount, setAmount] = useState(
        rule && rule.basis === "FIXED" ? String(rule.amount) : "",
    );
    const [months, setMonths] = useState(
        rule && rule.basis === "RENT_MONTHS" ? String(rule.months ?? 1) : "1",
    );

    const options = [
        { value: "NONE", label: "Not decided yet" },
        { value: "RENT_MONTHS", label: "Months of rent" },
        { value: "FIXED", label: "A fixed amount" },
    ];

    return (
        <TableRow>
            <TableCell className="font-mono">{type.code}</TableCell>
            <TableCell>{type.name}</TableCell>
            <TableCell className="text-muted-foreground">
                {type._count?.units ?? 0}
            </TableCell>
            <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        id={`rule-basis-${type.id}`}
                        name={`rule-basis-${type.id}`}
                        value={basis}
                        onChange={(event) => setBasis(event.target.value)}
                        options={options}
                    />
                    {basis === "RENT_MONTHS" && (
                        <Input
                            className="w-20"
                            type="number"
                            min={0}
                            step="0.5"
                            value={months}
                            aria-label="Months of rent"
                            onChange={(event) => setMonths(event.target.value)}
                        />
                    )}
                    {basis === "FIXED" && (
                        <Input
                            className="w-32"
                            type="number"
                            min={0}
                            value={amount}
                            aria-label="Deposit amount"
                            onChange={(event) => setAmount(event.target.value)}
                        />
                    )}
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={isSaving}
                        onClick={() => onSave(type, basis, amount, months)}
                    >
                        Save
                    </Button>
                </div>
                {basis === "RENT_MONTHS" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        Follows the rent, so an escalation does not leave the deposit
                        securing nothing.
                    </p>
                )}
                {basis === "FIXED" && amount && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {formatMoney(Number(amount), currency, locale)} whatever the
                        rent is.
                    </p>
                )}
            </TableCell>
            <TableCell>
                <Button
                    size="sm"
                    variant="ghost"
                    disabled={isSaving}
                    title="Remove this kind of unit"
                    onClick={() => onRemove(type)}
                >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
            </TableCell>
        </TableRow>
    );
}
