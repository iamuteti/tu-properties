"use client";

import { useCallback, useEffect, useState } from "react";
import { AxiosError } from "axios";
import { Globe2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { taxApi, TaxJurisdiction, TaxRule } from "@/lib/api";

const emptyForm = {
    id: "",
    code: "",
    name: "",
    ratePercent: "",
    basis: "EXCLUSIVE" as "EXCLUSIVE" | "INCLUSIVE",
    treatment: "CHARGED" as "CHARGED" | "WITHHELD",
    appliesToCategory: "*",
    ledgerAccountCode: "2100",
    countryCode: "",
    regionCode: "",
};

/**
 * Tax settings (Module 7). Tax is configuration, so this screen is the whole
 * feature: say where the organization is taxed, then record the rates that apply
 * there. Nothing here presumes a country — the rules listed are the ones that
 * match the declared jurisdiction.
 *
 * A rate change supersedes the existing rule rather than editing it, because an
 * invoice issued under the old rate has to keep citing it.
 */
export default function TaxSettingsPage() {
    const [jurisdiction, setJurisdiction] = useState<TaxJurisdiction | null>(null);
    const [rules, setRules] = useState<TaxRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [country, setCountry] = useState("");
    const [region, setRegion] = useState("");
    const [registration, setRegistration] = useState("");
    const [form, setForm] = useState(emptyForm);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [jurisdictionResponse, rulesResponse] = await Promise.all([
                taxApi.jurisdiction(),
                taxApi.findAll(),
            ]);
            setJurisdiction(jurisdictionResponse.data);
            setRules(rulesResponse.data);
            setCountry(jurisdictionResponse.data.countryCode ?? "");
            setRegion(jurisdictionResponse.data.regionCode ?? "");
            setRegistration(jurisdictionResponse.data.taxRegistrationNumber ?? "");
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load tax settings",
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleSaveJurisdiction = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            const response = await taxApi.setJurisdiction({
                countryCode: country.trim().toUpperCase() || null,
                regionCode: region.trim().toUpperCase() || null,
                taxRegistrationNumber: registration.trim() || null,
            });
            setJurisdiction(response.data);
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to save the jurisdiction",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateRule = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            await taxApi.create({
                id: form.id || undefined,
                code: form.code.trim().toUpperCase(),
                name: form.name.trim(),
                ratePercent: Number(form.ratePercent),
                basis: form.basis,
                treatment: form.treatment,
                appliesToCategory: form.appliesToCategory.trim() || "*",
                ledgerAccountCode: form.ledgerAccountCode.trim() || undefined,
                countryCode: form.countryCode.trim().toUpperCase() || country.trim().toUpperCase() || null,
                regionCode: form.regionCode.trim().toUpperCase() || null,
            });
            setForm(emptyForm);
            setShowForm(false);
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to save the tax rule",
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggle = async (rule: TaxRule) => {
        try {
            await taxApi.update(rule.id, { isActive: !rule.isActive });
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to update the rule",
            );
        }
    };

    const handleDelete = async (rule: TaxRule) => {
        if (!confirm(`Delete ${rule.name} (${rule.code})?`)) return;
        try {
            await taxApi.remove(rule.id);
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to delete the rule",
            );
        }
    };

    const applicable = jurisdiction?.countryCode
        ? rules.filter(
              (rule) =>
                  rule.countryCode === jurisdiction.countryCode &&
                  (!rule.regionCode || rule.regionCode === (jurisdiction.regionCode ?? null)),
          )
        : [];
    const others = rules.filter((rule) => !applicable.includes(rule));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Tax Settings</h1>
                    <p className="text-muted-foreground">
                        Where this organization is taxed, and the rates that apply there
                    </p>
                </div>
                <Button onClick={() => setShowForm((value) => !value)}>
                    <Plus className="mr-2 h-4 w-4" /> New Rule
                </Button>
            </div>

            {error && <div className="text-destructive text-sm">{error}</div>}

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">
                        <Globe2 className="mr-2 inline h-5 w-5" />
                        Jurisdiction
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveJurisdiction} className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="country">Country code</Label>
                            <Input
                                id="country"
                                required
                                maxLength={2}
                                placeholder="KE"
                                value={country}
                                onChange={(event) => setCountry(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                ISO-3166-1 alpha-2, e.g. KE, GB, DE, US
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="region">Region (optional)</Label>
                            <Input
                                id="region"
                                placeholder="CA"
                                value={region}
                                onChange={(event) => setRegion(event.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Where a country taxes by state or province
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="registration">Tax registration no.</Label>
                            <Input
                                id="registration"
                                value={registration}
                                onChange={(event) => setRegistration(event.target.value)}
                            />
                        </div>
                        <div className="flex items-end">
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? "Saving..." : "Save jurisdiction"}
                            </Button>
                        </div>
                    </form>
                    {!jurisdiction?.countryCode && (
                        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            No country is set, so no tax is applied to invoices. That is
                            deliberate — this system does not assume a jurisdiction.
                        </p>
                    )}
                </CardContent>
            </Card>

            {showForm && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">
                            {form.id ? "Supersede rule (new rate from today)" : "New tax rule"}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreateRule} className="grid gap-4 md:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="code">Code</Label>
                                <Input
                                    id="code"
                                    required
                                    placeholder="VAT"
                                    value={form.code}
                                    onChange={(event) => setForm({ ...form, code: event.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    required
                                    placeholder="Value Added Tax"
                                    value={form.name}
                                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rate">Rate %</Label>
                                <Input
                                    id="rate"
                                    required
                                    inputMode="decimal"
                                    placeholder="16"
                                    value={form.ratePercent}
                                    onChange={(event) =>
                                        setForm({ ...form, ratePercent: event.target.value })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="account">Ledger account</Label>
                                <Input
                                    id="account"
                                    placeholder="2100"
                                    value={form.ledgerAccountCode}
                                    onChange={(event) =>
                                        setForm({ ...form, ledgerAccountCode: event.target.value })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Price basis</Label>
                                <Select
                                    name="basis"
                                    value={form.basis}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            basis: event.target.value as "EXCLUSIVE" | "INCLUSIVE",
                                        })
                                    }
                                    options={[
                                        { value: "EXCLUSIVE", label: "Tax added on top" },
                                        { value: "INCLUSIVE", label: "Tax included in price" },
                                    ]}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Treatment</Label>
                                <Select
                                    name="treatment"
                                    value={form.treatment}
                                    onChange={(event) =>
                                        setForm({
                                            ...form,
                                            treatment: event.target.value as "CHARGED" | "WITHHELD",
                                        })
                                    }
                                    options={[
                                        { value: "CHARGED", label: "Charged to customer" },
                                        { value: "WITHHELD", label: "Withheld by us" },
                                    ]}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Applies to</Label>
                                <Input
                                    id="category"
                                    value={form.appliesToCategory}
                                    onChange={(event) =>
                                        setForm({ ...form, appliesToCategory: event.target.value })
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    * = every line. Use a category for a reduced rate.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="ruleCountry">Country</Label>
                                <Input
                                    id="ruleCountry"
                                    maxLength={2}
                                    placeholder={country || "KE"}
                                    value={form.countryCode}
                                    onChange={(event) =>
                                        setForm({ ...form, countryCode: event.target.value })
                                    }
                                />
                            </div>
                            <div className="flex items-end gap-2 md:col-span-4">
                                <Button type="submit" disabled={isSaving}>
                                    {isSaving ? "Saving..." : "Save rule"}
                                </Button>
                                {form.id && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setForm(emptyForm)}
                                    >
                                        Cancel supersede
                                    </Button>
                                )}
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <div>Loading tax rules...</div>
            ) : (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Applied here</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {applicable.length === 0 ? (
                                <p className="py-6 text-center text-muted-foreground">
                                    No tax rules match this jurisdiction, so invoices are issued
                                    without tax.
                                </p>
                            ) : (
                                <RuleTable rules={applicable} onToggle={handleToggle} onDelete={handleDelete} />
                            )}
                        </CardContent>
                    </Card>

                    {others.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">
                                    Other jurisdictions
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <RuleTable rules={others} onToggle={handleToggle} onDelete={handleDelete} />
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}

function RuleTable({
    rules,
    onToggle,
    onDelete,
}: {
    rules: TaxRule[];
    onToggle: (rule: TaxRule) => void;
    onDelete: (rule: TaxRule) => void;
}) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Where</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead>Treatment</TableHead>
                    <TableHead>Applies to</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                </TableRow>
            </TableHeader>
            <TableBody>
                {rules.map((rule) => (
                    <TableRow key={rule.id}>
                        <TableCell className="font-mono">{rule.code}</TableCell>
                        <TableCell>{rule.name}</TableCell>
                        <TableCell>
                            {rule.countryCode ?? "Any"}
                            {rule.regionCode ? `-${rule.regionCode}` : ""}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                            {Number(rule.rate)}%
                        </TableCell>
                        <TableCell>
                            {rule.basis === "INCLUSIVE" ? "Included" : "On top"}
                        </TableCell>
                        <TableCell>
                            {rule.treatment === "WITHHELD" ? "Withheld" : "Charged"}
                        </TableCell>
                        <TableCell>{rule.appliesToCategory}</TableCell>
                        <TableCell className="font-mono">
                            {rule.ledgerAccountCode ?? "2100"}
                        </TableCell>
                        <TableCell>{rule.isActive ? "Active" : "Inactive"}</TableCell>
                        <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => onToggle(rule)}>
                                {rule.isActive ? "Disable" : "Enable"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => onDelete(rule)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}