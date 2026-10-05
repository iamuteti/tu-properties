'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, FlaskConical, Globe2, Plus, Power } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import {
    PAYROLL_BEARERS,
    PAYROLL_CALCULATION_BASES,
    PAYROLL_LINE_DIRECTIONS,
    PAYROLL_PERIOD_MODES,
    PAYROLL_RULE_TYPES,
} from '@/lib/constants';
import type { PayrollRuleCoverage, PayrollRulePreview, PayrollRuleRow } from '@/types';

/**
 * The statutory payroll rules, configured per jurisdiction.
 *
 * This is the screen the module's first checklist item asks for — "managed via an
 * admin panel per country/jurisdiction, not hardcoded" — and the design point it
 * turns on is at the top rather than in the table: **`coverage`**. A jurisdiction
 * with no rules pays everybody, withholds nothing, and the run then reports
 * success. Nothing downstream can detect that, because from the engine's point of
 * view an unconfigured jurisdiction and a zero-rate one look identical. So the
 * coverage warning is rendered in full and the "New rule" button sits next to it
 * rather than at the far end of a table of rules the reader may not have.
 *
 * The second decision worth knowing: a rate is **not editable in force**. Changing
 * a percentage on a rule a payslip already used would make last quarter's
 * payslip unexplainable, so `updatePayrollRule` refuses money-moving fields and
 * the answer is a new rule with a later `validFrom`. The form below shows that as
 * a disabled field with the reason, rather than accepting the edit and losing it
 * to a 409.
 *
 * `preview` is why this is safe to expose to the people who hold the figures
 * rather than only to an administrator: put a real salary through the engine and
 * see the answer, including for a country the organization does not yet operate
 * in — which is how a new country is planned rather than guessed at.
 */
export default function PayrollRulesPage() {
    const [rules, setRules] = useState<PayrollRuleRow[]>([]);
    const [coverage, setCoverage] = useState<PayrollRuleCoverage | null>(null);
    const [includeInactive, setIncludeInactive] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<PayrollRuleRow | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [list, cover] = await Promise.all([
                hrApi.payrollRules({ includeInactive: includeInactive ? 'true' : undefined }),
                hrApi.payrollRuleCoverage(),
            ]);
            setRules(list.data);
            setCoverage(cover.data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not load the payroll rules.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [includeInactive]);

    useEffect(() => {
        load();
    }, [load]);

    const retire = async (rule: PayrollRuleRow) => {
        try {
            await hrApi.retirePayrollRule(rule.id);
            toast.success(`${rule.code} retired — payslips that used it still explain themselves`);
            load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? `Could not retire ${rule.code}`,
            );
        }
    };

    const toggleActive = async (rule: PayrollRuleRow) => {
        try {
            await hrApi.updatePayrollRule(rule.id, { isActive: !rule.isActive });
            toast.success(`${rule.code} ${rule.isActive ? 'switched off' : 'switched on'}`);
            load();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? `Could not change ${rule.code}`,
            );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Payroll rules</h1>
                    <p className="text-muted-foreground">
                        Statutory deductions and contributions, per country and region. Kenya
                        ships as the baseline; another country is configuration, not code.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={hrApi.payrollRulesExportUrl()}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button variant="outline" onClick={() => setIsPreviewing(true)}>
                        <FlaskConical className="mr-2 h-4 w-4" aria-hidden="true" />
                        Try a salary
                    </Button>
                    <Button onClick={() => setIsCreating(true)}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        New rule
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            {coverage && (
                <Card
                    className={
                        coverage.warning ? 'border-amber-400' : undefined
                    }
                >
                    <CardHeader>
                        <CardTitle className="flex flex-wrap items-center gap-2">
                            <Globe2 className="h-4 w-4" aria-hidden="true" />
                            {coverage.jurisdiction.label}
                            {coverage.jurisdiction.inherited && (
                                <span className="text-xs font-normal text-muted-foreground">
                                    inherited from the tax country, not declared for payroll
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {coverage.warning ? (
                            <p className="text-amber-900">{coverage.warning}</p>
                        ) : (
                            <p className="text-emerald-800">
                                {coverage.ruleCount} rules in force
                                {coverage.codes.length > 0 && `: ${coverage.codes.join(', ')}`}
                            </p>
                        )}
                        {coverage.missingAccounts.length > 0 && (
                            <p className="text-amber-900">
                                No ledger account is mapped for: {coverage.missingAccounts.join(', ')}.
                                The figures will calculate but cannot post.
                            </p>
                        )}
                        {coverage.unknownAccounts.length > 0 && (
                            <p className="text-amber-900">
                                These ledger accounts are not in the chart of accounts:{' '}
                                {coverage.unknownAccounts.join(', ')}.
                            </p>
                        )}
                        {coverage.sharedAccounts && coverage.sharedAccounts.length > 0 && (
                            <p className="text-amber-900">
                                More than one rule posts to the same account:{' '}
                                {coverage.sharedAccounts.join(', ')}, so a trial balance will
                                merge them.
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <div className="flex items-end gap-3">
                <div className="w-64">
                    <Label htmlFor="rules-inactive">Show retired rules</Label>
                    <Select
                        name="rules-inactive"
                        value={includeInactive ? 'yes' : 'no'}
                        onChange={(event) => setIncludeInactive(event.target.value === 'yes')}
                        options={[
                            { value: 'no', label: 'Rules in force only' },
                            { value: 'yes', label: 'Including retired' },
                        ]}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading the payroll rules…" />
            ) : rules.length === 0 ? (
                <EmptyState
                    title="No rules configured"
                    description="Without a rule this jurisdiction pays everybody and withholds nothing."
                    action={
                        <Button onClick={() => setIsCreating(true)}>
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add the first rule
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Rule</TableHead>
                                        <TableHead>Jurisdiction</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Base</TableHead>
                                        <TableHead>Who bears it</TableHead>
                                        <TableHead className="text-right">Figure</TableHead>
                                        <TableHead>In force</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rules.map((rule) => (
                                        <TableRow key={rule.id}>
                                            <TableCell>
                                                <p className="font-medium">{rule.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {rule.code}
                                                    {rule.ledgerAccountCode
                                                        ? ` · account ${rule.ledgerAccountCode}`
                                                        : ' · no ledger account'}
                                                </p>
                                            </TableCell>
                                            <TableCell>
                                                {rule.countryCode ?? '—'}
                                                {rule.regionCode ? ` / ${rule.regionCode}` : ''}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {PAYROLL_RULE_TYPES.find(
                                                    (entry) => entry.value === rule.type,
                                                )?.label ?? rule.type}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {PAYROLL_CALCULATION_BASES.find(
                                                    (entry) => entry.value === rule.base,
                                                )?.label ?? rule.base}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {bearerLabels(rule.bearer).map((side) => (
                                                        <span
                                                            key={side.direction}
                                                            className={`rounded-full px-2 py-0.5 text-xs ${PAYROLL_LINE_DIRECTIONS[side.direction].className}`}
                                                        >
                                                            {side.label}
                                                        </span>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-xs">
                                                {figureOf(rule)}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge
                                                    status={rule.isActive ? 'ACTIVE' : 'INACTIVE'}
                                                />
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    from {rule.validFrom?.slice(0, 10)}
                                                    {rule.validTo
                                                        ? ` to ${rule.validTo.slice(0, 10)}`
                                                        : ''}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setEditing(rule)}
                                                    >
                                                        Edit
                                                    </Button>
                                                    {rule.isActive ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => retire(rule)}
                                                        >
                                                            <Power
                                                                className="mr-1 h-4 w-4"
                                                                aria-hidden="true"
                                                            />
                                                            Retire
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => toggleActive(rule)}
                                                        >
                                                            Switch on
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {isCreating && (
                <RuleModal
                    onClose={() => setIsCreating(false)}
                    onSaved={() => {
                        setIsCreating(false);
                        load();
                    }}
                />
            )}

            {editing && (
                <RuleModal
                    rule={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        load();
                    }}
                />
            )}

            {isPreviewing && <PreviewModal onClose={() => setIsPreviewing(false)} />}
        </div>
    );
}

/** A rule has three arithmetic shapes, so "the figure" is whichever one applies. */
function figureOf(rule: PayrollRuleRow): string {
    if (rule.type === 'PROGRESSIVE_BANDS') {
        const bands = rule.bands ?? [];
        return bands
            .map((band, index) => {
                const bound =
                    band.upTo == null
                        ? 'above'
                        : `to ${Number(band.upTo).toLocaleString('en-KE')}`;
                const rate =
                    band.ratePercent != null
                        ? `${Number(band.ratePercent)}%`
                        : `${Number(band.amount ?? 0).toLocaleString('en-KE')}`;
                return `${index === 0 ? '' : ', '}${bound} ${rate}`;
            })
            .join('');
    }
    if (rule.type === 'FIXED') {
        return Number(rule.amount ?? 0).toLocaleString('en-KE');
    }
    return `${Number(rule.ratePercent ?? 0)}%`;
}

/** A matched rule puts a figure on each side, so the badge has to say so. */
function bearerLabels(bearer: string): { label: string; direction: string }[] {
    if (bearer === 'BOTH') {
        return [
            { label: 'Employee', direction: 'EMPLOYEE_DEDUCTION' },
            { label: 'Employer', direction: 'EMPLOYER_CONTRIBUTION' },
        ];
    }
    return [
        bearer === 'EMPLOYER'
            ? { label: 'Employer', direction: 'EMPLOYER_CONTRIBUTION' }
            : { label: 'Employee', direction: 'EMPLOYEE_DEDUCTION' },
    ];
}

type RuleForm = {
    code: string;
    name: string;
    description: string;
    countryCode: string;
    regionCode: string;
    type: string;
    base: string;
    bearer: string;
    ratePercent: string;
    amount: string;
    minimumBaseAmount: string;
    maximumBaseAmount: string;
    exemptBelowBaseAmount: string;
    bands: string;
    periodMode: string;
    periodsPerYear: string;
    sortOrder: string;
    ledgerAccountCode: string;
    expenseAccountCode: string;
    validFrom: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_FORM: RuleForm = {
    code: '',
    name: '',
    description: '',
    countryCode: '',
    regionCode: '',
    type: 'PERCENTAGE',
    base: 'BASIC',
    bearer: 'EMPLOYEE',
    ratePercent: '',
    amount: '',
    minimumBaseAmount: '',
    maximumBaseAmount: '',
    exemptBelowBaseAmount: '',
    bands: '',
    periodMode: 'PERIOD',
    periodsPerYear: '12',
    sortOrder: '100',
    ledgerAccountCode: '',
    expenseAccountCode: '',
    validFrom: today(),
};

/** Parse the band ladder: `24000@10%, 36000@15%, ,20%` — a blank bound is the open top. */
function parseBands(text: string) {
    return text
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const [bound, figure] = entry.split('@').map((part) => part.trim());
            const isPercent = figure?.endsWith('%');
            return {
                upTo: bound ? Number(bound) : null,
                ...(isPercent
                    ? { ratePercent: Number(figure.replace('%', '')) }
                    : { amount: Number(figure) }),
            };
        });
}

/** Omit a numeric field entirely rather than sending an empty string or a zero. */
function optionalField(value: string, key: string) {
    return value.trim() === '' ? {} : { [key]: Number(value) };
}

function RuleModal({
    rule,
    onClose,
    onSaved,
}: {
    rule?: PayrollRuleRow;
    onClose: () => void;
    onSaved: () => void;
}) {
    const inForce = Boolean(rule && rule.isActive && !rule.validTo);
    const [form, setForm] = useState<RuleForm>(
        rule
            ? {
                  code: rule.code,
                  name: rule.name,
                  description: rule.description ?? '',
                  countryCode: rule.countryCode ?? '',
                  regionCode: rule.regionCode ?? '',
                  type: rule.type,
                  base: rule.base,
                  bearer: rule.bearer,
                  ratePercent: rule.ratePercent != null ? String(rule.ratePercent) : '',
                  amount: rule.amount != null ? String(rule.amount) : '',
                  minimumBaseAmount:
                      rule.minimumBaseAmount != null ? String(rule.minimumBaseAmount) : '',
                  maximumBaseAmount:
                      rule.maximumBaseAmount != null ? String(rule.maximumBaseAmount) : '',
                  exemptBelowBaseAmount:
                      rule.exemptBelowBaseAmount != null
                          ? String(rule.exemptBelowBaseAmount)
                          : '',
                  bands: (rule.bands ?? [])
                      .map((band) => {
                          const bound = band.upTo == null ? '' : String(band.upTo);
                          const figure =
                              band.ratePercent != null
                                  ? `${band.ratePercent}%`
                                  : String(band.amount ?? '');
                          return `${bound}@${figure}`;
                      })
                      .join(', '),
                  periodMode: rule.periodMode,
                  periodsPerYear: String(rule.periodsPerYear ?? 12),
                  sortOrder: String(rule.sortOrder ?? 100),
                  ledgerAccountCode: rule.ledgerAccountCode ?? '',
                  expenseAccountCode: rule.expenseAccountCode ?? '',
                  validFrom: rule.validFrom?.slice(0, 10) ?? today(),
              }
            : EMPTY_FORM,
    );
    const [isSaving, setIsSaving] = useState(false);

    const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) =>
        setForm((current) => ({ ...current, [key]: value }));

    const submit = async () => {
        // The same refusal the service makes, surfaced here rather than as a 409:
        // a percentage rule with no rate, or a fixed rule with no amount, computes
        // to zero silently, and a statutory deduction that quietly withholds
        // nothing is the worst outcome this screen could produce.
        if (form.type === 'PERCENTAGE' && !form.ratePercent) {
            toast.error('A percentage rule needs a rate');
            return;
        }
        if (form.type === 'FIXED' && !form.amount) {
            toast.error('A fixed rule needs an amount');
            return;
        }
        if (form.type === 'PROGRESSIVE_BANDS' && !form.bands.trim()) {
            toast.error('A banded rule needs its ladder');
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                code: form.code.trim(),
                name: form.name.trim(),
                ...(form.description.trim() ? { description: form.description.trim() } : {}),
                ...(form.countryCode.trim() ? { countryCode: form.countryCode.trim() } : {}),
                ...(form.regionCode.trim() ? { regionCode: form.regionCode.trim() } : {}),
                type: form.type,
                base: form.base,
                bearer: form.bearer,
                periodMode: form.periodMode,
                periodsPerYear: Number(form.periodsPerYear) || 12,
                sortOrder: Number(form.sortOrder) || 100,
                ...(form.ledgerAccountCode.trim()
                    ? { ledgerAccountCode: form.ledgerAccountCode.trim() }
                    : {}),
                ...(form.expenseAccountCode.trim()
                    ? { expenseAccountCode: form.expenseAccountCode.trim() }
                    : {}),
                validFrom: form.validFrom,
            };

            if (rule) {
                // Descriptive fields only. The money-moving ones are refused by the
                // service while the rule is in force, and sending them would just
                // produce an error the reader cannot act on.
                await hrApi.updatePayrollRule(rule.id, {
                    code: payload.code,
                    name: payload.name,
                    ...(payload.description ? { description: payload.description } : {}),
                    ...(payload.ledgerAccountCode
                        ? { ledgerAccountCode: payload.ledgerAccountCode }
                        : {}),
                    ...(payload.sortOrder ? { sortOrder: payload.sortOrder } : {}),
                    ...(rule.isActive ? {} : { isActive: true }),
                });
                toast.success(
                    `${payload.code} saved. A rate change needs a new rule with a later start date.`,
                );
            } else {
                await hrApi.createPayrollRule({
                    ...payload,
                    ...(form.type === 'PERCENTAGE' && form.ratePercent
                        ? { ratePercent: Number(form.ratePercent) }
                        : {}),
                    ...(form.type === 'FIXED' && form.amount
                        ? { amount: Number(form.amount) }
                        : {}),
                    ...(form.type === 'PROGRESSIVE_BANDS'
                        ? { bands: parseBands(form.bands) }
                        : {}),
                    ...optionalField(form.minimumBaseAmount, 'minimumBaseAmount'),
                    ...optionalField(form.maximumBaseAmount, 'maximumBaseAmount'),
                    ...optionalField(form.exemptBelowBaseAmount, 'exemptBelowBaseAmount'),
                });
                toast.success(`${payload.code} created`);
            }
            onSaved();
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not save the rule',
            );
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={rule ? `Edit ${rule.code}` : 'New statutory rule'}
            size="xl"
        >
            <div className="space-y-4">
                {inForce && (
                    <p className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        This rule is in force, so its rate, base and period are locked: a
                        payslip already used it, and changing the figure would leave that
                        payslip unexplainable. To change a rate, retire this rule and add a
                        new one that starts later.
                    </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="rule-code">Code</Label>
                        <Input
                            id="rule-code"
                            value={form.code}
                            onChange={(event) => set('code', event.target.value)}
                            placeholder="PAYE"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-name">Name</Label>
                        <Input
                            id="rule-name"
                            value={form.name}
                            onChange={(event) => set('name', event.target.value)}
                            placeholder="Pay as you earn"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="rule-description">Description</Label>
                    <Textarea
                        id="rule-description"
                        value={form.description}
                        onChange={(event) => set('description', event.target.value)}
                        rows={2}
                    />
                </div>

                <div className="grid gap-4 sm:grid-cols-4">
                    <div className="space-y-2">
                        <Label htmlFor="rule-country">Country</Label>
                        <Input
                            id="rule-country"
                            value={form.countryCode}
                            onChange={(event) => set('countryCode', event.target.value)}
                            placeholder="KE"
                            maxLength={2}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-region">Region</Label>
                        <Input
                            id="rule-region"
                            value={form.regionCode}
                            onChange={(event) => set('regionCode', event.target.value)}
                            placeholder="optional"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-ledger">Ledger account</Label>
                        <Input
                            id="rule-ledger"
                            value={form.ledgerAccountCode}
                            onChange={(event) => set('ledgerAccountCode', event.target.value)}
                            placeholder="2210"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-expense">Expense account</Label>
                        <Input
                            id="rule-expense"
                            value={form.expenseAccountCode}
                            onChange={(event) => set('expenseAccountCode', event.target.value)}
                            placeholder="optional"
                        />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="rule-type">Arithmetic</Label>
                        <Select
                            name="rule-type"
                            value={form.type}
                            disabled={inForce}
                            onChange={(event) => set('type', event.target.value)}
                            options={PAYROLL_RULE_TYPES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-base">Applied to</Label>
                        <Select
                            name="rule-base"
                            value={form.base}
                            disabled={inForce}
                            onChange={(event) => set('base', event.target.value)}
                            options={PAYROLL_CALCULATION_BASES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-bearer">Who bears it</Label>
                        <Select
                            name="rule-bearer"
                            value={form.bearer}
                            disabled={inForce}
                            onChange={(event) => set('bearer', event.target.value)}
                            options={PAYROLL_BEARERS.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            }))}
                        />
                    </div>
                </div>

                {form.type === 'PERCENTAGE' && (
                    <div className="grid gap-4 sm:grid-cols-4">
                        <div className="space-y-2">
                            <Label htmlFor="rule-rate">Rate %</Label>
                            <Input
                                id="rule-rate"
                                type="number"
                                step="0.01"
                                value={form.ratePercent}
                                disabled={inForce}
                                onChange={(event) => set('ratePercent', event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rule-min">Minimum base</Label>
                            <Input
                                id="rule-min"
                                type="number"
                                value={form.minimumBaseAmount}
                                disabled={inForce}
                                onChange={(event) => set('minimumBaseAmount', event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rule-max">Maximum base</Label>
                            <Input
                                id="rule-max"
                                type="number"
                                value={form.maximumBaseAmount}
                                disabled={inForce}
                                onChange={(event) => set('maximumBaseAmount', event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rule-exempt">Exempt below</Label>
                            <Input
                                id="rule-exempt"
                                type="number"
                                value={form.exemptBelowBaseAmount}
                                disabled={inForce}
                                onChange={(event) =>
                                    set('exemptBelowBaseAmount', event.target.value)
                                }
                            />
                        </div>
                    </div>
                )}

                {form.type === 'FIXED' && (
                    <div className="w-48 space-y-2">
                        <Label htmlFor="rule-amount">Amount</Label>
                        <Input
                            id="rule-amount"
                            type="number"
                            value={form.amount}
                            disabled={inForce}
                            onChange={(event) => set('amount', event.target.value)}
                        />
                    </div>
                )}

                {form.type === 'PROGRESSIVE_BANDS' && (
                    <div className="space-y-2">
                        <Label htmlFor="rule-bands">Bands, cumulative upper bound @ figure</Label>
                        <Input
                            id="rule-bands"
                            value={form.bands}
                            disabled={inForce}
                            onChange={(event) => set('bands', event.target.value)}
                            placeholder="24000@10%, 36000@15%, ,20%"
                        />
                        <p className="text-xs text-muted-foreground">
                            Annual bands, in the currency the employee is paid. The open top is
                            the entry with no number before the @.
                        </p>
                    </div>
                )}

                <div className="grid gap-4 sm:grid-cols-4">
                    <div className="space-y-2">
                        <Label htmlFor="rule-periodMode">Applied</Label>
                        <Select
                            name="rule-periodMode"
                            value={form.periodMode}
                            disabled={inForce}
                            onChange={(event) => set('periodMode', event.target.value)}
                            options={PAYROLL_PERIOD_MODES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-periods">Periods per year</Label>
                        <Input
                            id="rule-periods"
                            type="number"
                            value={form.periodsPerYear}
                            disabled={inForce}
                            onChange={(event) => set('periodsPerYear', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-sort">Order</Label>
                        <Input
                            id="rule-sort"
                            type="number"
                            value={form.sortOrder}
                            onChange={(event) => set('sortOrder', event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rule-validFrom">In force from</Label>
                        <Input
                            id="rule-validFrom"
                            type="date"
                            value={form.validFrom}
                            disabled={inForce}
                            onChange={(event) => set('validFrom', event.target.value)}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={isSaving}>
                        {isSaving ? 'Saving…' : rule ? 'Save the rule' : 'Create the rule'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function PreviewModal({ onClose }: { onClose: () => void }) {
    const [gross, setGross] = useState('100000');
    const [basic, setBasic] = useState('');
    const [countryCode, setCountryCode] = useState('');
    const [preview, setPreview] = useState<PayrollRulePreview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    const run = async () => {
        setIsRunning(true);
        setError(null);
        try {
            const { data } = await hrApi.previewPayroll({
                gross: Number(gross) || 0,
                ...(basic ? { basic: Number(basic) } : {}),
                ...(countryCode ? { countryCode } : {}),
            });
            setPreview(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not run the preview',
            );
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <Modal isOpen onClose={onClose} title="Try a salary" size="lg">
            <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Runs the configured rules over a hypothetical salary. Nothing is written
                    and no payslip is created — leave the country blank to use this
                    organization's jurisdiction, or type a two-letter code to plan a country
                    you do not operate in yet.
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                        <Label htmlFor="preview-gross">Gross pay</Label>
                        <Input
                            id="preview-gross"
                            type="number"
                            value={gross}
                            onChange={(event) => setGross(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="preview-basic">Basic (optional)</Label>
                        <Input
                            id="preview-basic"
                            type="number"
                            value={basic}
                            onChange={(event) => setBasic(event.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="preview-country">Country</Label>
                        <Input
                            id="preview-country"
                            value={countryCode}
                            maxLength={2}
                            onChange={(event) => setCountryCode(event.target.value)}
                            placeholder="default"
                        />
                    </div>
                </div>

                <div className="flex justify-end">
                    <Button onClick={run} disabled={isRunning}>
                        {isRunning ? 'Calculating…' : 'Calculate'}
                    </Button>
                </div>

                {error && <ErrorState message={error} onRetry={run} />}

                {preview && (
                    <div className="space-y-3">
                        <p className="text-sm">
                            {preview.ruleCount} rules applied for{' '}
                            <span className="font-medium">{preview.jurisdiction.label}</span>.
                        </p>
                        {preview.lines.length === 0 ? (
                            <p className="text-sm text-amber-800">
                                Nothing was calculated — no rules resolve for this jurisdiction.
                            </p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Line</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {preview.lines.map((line, index) => (
                                        <TableRow key={`${line.code}-${index}`}>
                                            <TableCell>
                                                <p className="text-sm">{line.name}</p>
                                                {line.explanation && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {line.explanation}
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {line.amount.toLocaleString('en-KE', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                        <div className="flex justify-end gap-6 border-t pt-3 text-sm">
                            <span>
                                Gross{' '}
                                <strong>
                                    {preview.totals.gross.toLocaleString('en-KE', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </strong>
                            </span>
                            <span>
                                Net{' '}
                                <strong>
                                    {preview.totals.net.toLocaleString('en-KE', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </strong>
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}