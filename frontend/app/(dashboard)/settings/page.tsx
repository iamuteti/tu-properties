"use client";

import { Save, Shield, MonitorSmartphone, Trash2, Loader2, History } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { authApi, organizationsApi } from "@/lib/api";
import { UTILITY_BILLING_MODES, VACANCY_POLICIES } from "@/lib/constants";
import { LoginEvent, UtilityBillingMode, VacancyPolicy } from "@/types";
import { useEffect, useState } from "react";

type ActiveSession = {
    id: string;
    createdAt: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    isCurrent: boolean;
};

const CURRENCIES = ["KES", "USD", "GBP", "EUR", "NGN", "ZAR", "INR", "AED"];
const TIMEZONES = [
    "Africa/Nairobi",
    "Africa/Lagos",
    "Africa/Johannesburg",
    "UTC",
    "Europe/London",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Australia/Sydney",
];

const ACTION_LABELS: Record<string, string> = {
    LOGIN: "Signed in",
    MFA_ENABLED: "Enabled 2FA",
    MFA_DISABLED: "Disabled 2FA",
    SESSIONS_REVOKED: "Revoked other sessions",
    PASSWORD_RESET: "Reset password",
};

export default function SettingsPage() {
    const { user, organization, refreshProfile } = useAuth();
    const canSaveOrg = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

    // Org profile / system settings (local form state, saved via PATCH /organizations/me)
    const [profile, setProfile] = useState({
        name: "",
        contactEmail: "",
        contactPhone: "",
        legalName: "",
        taxId: "",
        currency: "KES",
        timezone: "Africa/Nairobi",
        // Module 14 — Utilities. Both are per-organization because the answer is
        // jurisdictional and the markets genuinely differ, so they belong beside
        // `currency` and `timezone` rather than inside the utilities screens. Empty
        // string means "nobody has decided", which the API keeps distinct from a
        // choice.
        vacancyPolicy: "" as VacancyPolicy | "",
        utilityBillingMode: "" as UtilityBillingMode | "",
    });
    const [profileLoaded, setProfileLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

    // MFA enrollment
    const [mfaBusy, setMfaBusy] = useState(false);
    const [mfaSecret, setMfaSecret] = useState<string | null>(null);
    const [mfaOtpUrl, setMfaOtpUrl] = useState<string | null>(null);
    const [mfaCode, setMfaCode] = useState("");
    const [mfaMsg, setMfaMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

    // Sessions
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [sessionsLoaded, setSessionsLoaded] = useState(false);
    const [revokeBusy, setRevokeBusy] = useState(false);

    // Login history (self-scoped)
    const [loginHistory, setLoginHistory] = useState<LoginEvent[]>([]);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    useEffect(() => {
        if (organization) {
            setProfile({
                name: organization.name || "",
                contactEmail: organization.contactEmail || "",
                contactPhone: organization.contactPhone || "",
                legalName: organization.legalName || "",
                taxId: organization.taxId || "",
                currency: organization.currency || "KES",
                timezone: organization.timezone || "Africa/Nairobi",
                vacancyPolicy: organization.vacancyPolicy ?? "",
                utilityBillingMode: organization.utilityBillingMode ?? "",
            });
            setProfileLoaded(true);
        }
    }, [organization]);

    const refreshSessions = async () => {
        try {
            const res = await authApi.listSessions();
            setSessions(res.data);
            setSessionsLoaded(true);
        } catch {
            setSessionsLoaded(false);
        }
    };

    useEffect(() => {
        refreshSessions();
        authApi
            .loginHistory()
            .then((res) => {
                setLoginHistory(res.data);
                setHistoryLoaded(true);
            })
            .catch(() => setHistoryLoaded(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const saveProfile = async () => {
        setSaving(true);
        setSaveMsg(null);
        try {
            await organizationsApi.updateMe({
                name: profile.name,
                contactEmail: profile.contactEmail || null,
                contactPhone: profile.contactPhone || null,
                legalName: profile.legalName || null,
                taxId: profile.taxId || null,
                currency: profile.currency,
                timezone: profile.timezone,
                // Sent as `null` rather than omitted when blank, because the API
                // distinguishes "clear it back to undecided" from "leave it alone".
                vacancyPolicy: profile.vacancyPolicy || null,
                utilityBillingMode: profile.utilityBillingMode || null,
            });
            await refreshProfile();
            setSaveMsg({ kind: "success", text: "Settings saved." });
        } catch (err: any) {
            setSaveMsg({
                kind: "error",
                text: err.response?.data?.message || "Failed to save settings.",
            });
        } finally {
            setSaving(false);
        }
    };

    const startMfaSetup = async () => {
        setMfaBusy(true);
        setMfaMsg(null);
        try {
            const res = await authApi.mfaSetup();
            setMfaSecret(res.data.secret);
            setMfaOtpUrl(res.data.otpauthUrl);
            setMfaCode("");
        } catch (err: any) {
            setMfaMsg({ kind: "error", text: err.response?.data?.message || "Failed to set up MFA." });
        } finally {
            setMfaBusy(false);
        }
    };

    const confirmMfa = async () => {
        if (!mfaSecret) return;
        setMfaBusy(true);
        setMfaMsg(null);
        try {
            await authApi.mfaEnable(mfaSecret, mfaCode);
            setMfaMsg({ kind: "success", text: "Two-factor authentication is now enabled." });
            setMfaSecret(null);
            setMfaOtpUrl(null);
            setMfaCode("");
        } catch (err: any) {
            setMfaMsg({ kind: "error", text: err.response?.data?.message || "Invalid verification code." });
        } finally {
            setMfaBusy(false);
        }
    };

    const disableMfa = async () => {
        setMfaBusy(true);
        setMfaMsg(null);
        try {
            await authApi.mfaDisable(mfaCode);
            setMfaMsg({ kind: "success", text: "Two-factor authentication disabled." });
            setMfaCode("");
        } catch (err: any) {
            setMfaMsg({ kind: "error", text: err.response?.data?.message || "Invalid verification code." });
        } finally {
            setMfaBusy(false);
        }
    };

    const revokeOthers = async () => {
        if (!confirm("Sign out all other active sessions?")) return;
        setRevokeBusy(true);
        try {
            await authApi.revokeOtherSessions();
            await refreshSessions();
        } finally {
            setRevokeBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your organization profile, system settings and security
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Organization</CardTitle>
                    <CardDescription>
                        Company profile and regional defaults used across the app
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="orgName">Organization Name</Label>
                            <Input
                                id="orgName"
                                value={profile.name}
                                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                                placeholder="Organization name"
                                disabled={!profileLoaded}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="orgSlug">Slug</Label>
                            <Input
                                id="orgSlug"
                                defaultValue={organization?.slug || ""}
                                placeholder="organization-slug"
                                disabled
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="legalName">Legal Name</Label>
                            <Input
                                id="legalName"
                                value={profile.legalName}
                                onChange={(e) => setProfile((p) => ({ ...p, legalName: e.target.value }))}
                                placeholder="Registered company name"
                                disabled={!profileLoaded}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="taxId">Tax ID / PIN</Label>
                            <Input
                                id="taxId"
                                value={profile.taxId}
                                onChange={(e) => setProfile((p) => ({ ...p, taxId: e.target.value }))}
                                placeholder="e.g. P051234567X"
                                disabled={!profileLoaded}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="contactEmail">Contact Email</Label>
                            <Input
                                id="contactEmail"
                                type="email"
                                value={profile.contactEmail}
                                onChange={(e) => setProfile((p) => ({ ...p, contactEmail: e.target.value }))}
                                placeholder="billing@example.com"
                                disabled={!profileLoaded}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contactPhone">Contact Phone</Label>
                            <Input
                                id="contactPhone"
                                type="tel"
                                value={profile.contactPhone}
                                onChange={(e) => setProfile((p) => ({ ...p, contactPhone: e.target.value }))}
                                placeholder="+254 700 000 000"
                                disabled={!profileLoaded}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="currency">Default Currency</Label>
                            <select
                                id="currency"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                                value={profile.currency}
                                onChange={(e) => setProfile((p) => ({ ...p, currency: e.target.value }))}
                                disabled={!profileLoaded}
                            >
                                {CURRENCIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="timezone">Time Zone</Label>
                            <select
                                id="timezone"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                                value={profile.timezone}
                                onChange={(e) => setProfile((p) => ({ ...p, timezone: e.target.value }))}
                                disabled={!profileLoaded}
                            >
                                {TIMEZONES.map((tz) => (
                                    <option key={tz} value={tz}>{tz}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/*
                        Module 14 — Utilities. Both belong here rather than inside the
                        utilities screens because they are *organization* settings, the
                        same class of decision as `currency` and `timezone` above: what
                        document a charge ends up on, and who carries a vacant unit's
                        water, are commercial choices the landlord makes and neither is
                        the same in every market.

                        "Not decided" is a real, selectable state in both, and it is not
                        the same as a choice — which is why each offers an explicit
                        blank option rather than silently showing the default.
                    */}
                    <div className="space-y-1 border-t pt-6">
                        <h3 className="text-sm font-semibold">Utility billing</h3>
                        <p className="text-sm text-muted-foreground">
                            How metered consumption is documented and billed. Both apply to bulk meters as well as
                            sub-meters.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="utilityBillingMode">Who is billed for utilities?</Label>
                            <select
                                id="utilityBillingMode"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                                value={profile.utilityBillingMode}
                                onChange={(e) =>
                                    setProfile((p) => ({
                                        ...p,
                                        utilityBillingMode: e.target.value as UtilityBillingMode | "",
                                    }))
                                }
                                disabled={!profileLoaded}
                            >
                                <option value="">Not decided — re-bill residents (the default)</option>
                                {UTILITY_BILLING_MODES.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                            {profile.utilityBillingMode && (
                                <p className="text-xs text-muted-foreground">
                                    {UTILITY_BILLING_MODES.find(
                                        (m) => m.value === profile.utilityBillingMode,
                                    )?.hint}
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="vacancyPolicy">A vacant unit on a bulk meter</Label>
                            <select
                                id="vacancyPolicy"
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                                value={profile.vacancyPolicy}
                                onChange={(e) =>
                                    setProfile((p) => ({
                                        ...p,
                                        vacancyPolicy: e.target.value as VacancyPolicy | "",
                                    }))
                                }
                                disabled={!profileLoaded}
                            >
                                <option value="">Not decided — record it and decide later (the default)</option>
                                {VACANCY_POLICIES.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                            </select>
                            {profile.vacancyPolicy && (
                                <p className="text-xs text-muted-foreground">
                                    {VACANCY_POLICIES.find((m) => m.value === profile.vacancyPolicy)?.hint}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Plan</Label>
                            <Input
                                value={organization?.plan || "FREE"}
                                disabled
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Subdomain</Label>
                            <Input
                                value={organization?.subdomain || ""}
                                disabled
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Input
                                value={organization?.isActive ? "Active" : "Inactive"}
                                disabled
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Recent Sign-Ins
                    </CardTitle>
                    <CardDescription>
                        Your most recent login and security events
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {historyLoaded && loginHistory.length === 0 && (
                        <p className="text-sm text-muted-foreground">No sign-in events recorded yet.</p>
                    )}
                    {historyLoaded && loginHistory.length > 0 && (
                        <div className="divide-y rounded-md border text-sm">
                            {loginHistory.map((ev, i) => (
                                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="font-medium">{ACTION_LABELS[ev.action] || ev.action}</p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {ev.ipAddress || "unknown IP"}
                                            {ev.userAgent ? ` · ${ev.userAgent.slice(0, 80)}` : ""}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {new Date(ev.at).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Current User</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center text-lg font-medium">
                            {user?.firstName?.[0] || 'U'}{user?.lastName?.[0] || ''}
                        </div>
                        <div>
                            <p className="font-medium">
                                {user ? `${user.firstName} ${user.lastName}` : '—'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {user?.email || '—'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Security
                    </CardTitle>
                    <CardDescription>
                        Two-factor authentication and active sessions
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* MFA */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium">
                                    Two-factor authentication (TOTP)
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {user?.mfaEnabled
                                        ? "Enabled — you will be asked for an authenticator code at sign in."
                                        : "Add an authenticator app (Google Authenticator, 1Password, …) as a second factor."}
                                </p>
                            </div>
                            {user?.mfaEnabled ? (
                                <Button variant="outline" size="sm" onClick={startMfaSetup} disabled={mfaSecret !== null || mfaBusy}>
                                    Re-pair authenticator
                                </Button>
                            ) : (
                                <Button size="sm" onClick={startMfaSetup} disabled={mfaBusy}>
                                    Enable
                                </Button>
                            )}
                        </div>

                        {mfaSecret && mfaOtpUrl && (
                            <div className="space-y-2 rounded-md border p-3 text-sm">
                                <p className="text-muted-foreground">
                                    Add this secret to your authenticator app, then enter the current 6-digit code to finish:
                                </p>
                                <code className="block rounded bg-muted px-2 py-1 font-mono text-sm break-all">
                                    {mfaSecret}
                                </code>
                                <details className="text-xs text-muted-foreground">
                                    <summary className="cursor-pointer hover:text-foreground">
                                        Or scan this URL in your app
                                    </summary>
                                    <code className="mt-1 block break-all font-mono">{mfaOtpUrl}</code>
                                </details>
                                <div className="flex items-center gap-2">
                                    <Input
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder="000000"
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                                        className="h-9 w-32"
                                    />
                                    <Button size="sm" onClick={confirmMfa} disabled={mfaBusy || mfaCode.length !== 6}>
                                        Confirm
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setMfaSecret(null);
                                            setMfaOtpUrl(null);
                                            setMfaMsg(null);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {user?.mfaEnabled && !mfaSecret && (
                            <div className="flex items-center gap-2">
                                <Input
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="000000"
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                                    className="h-9 w-32"
                                />
                                <Button variant="destructive" size="sm" onClick={disableMfa} disabled={mfaBusy || mfaCode.length !== 6}>
                                    <Trash2 className="mr-1 h-4 w-4" />
                                    Disable 2FA
                                </Button>
                            </div>
                        )}

                        {mfaMsg && (
                            <p className={`text-sm ${mfaMsg.kind === "error" ? "text-destructive" : "text-green-700"}`}>
                                {mfaMsg.text}
                            </p>
                        )}
                    </div>

                    {/* Sessions */}
                    <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium flex items-center gap-2">
                                    <MonitorSmartphone className="h-4 w-4" />
                                    Active sessions ({sessions.length})
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Each sign-in creates a session. Revoke any you don&apos;t recognize.
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={revokeOthers} disabled={revokeBusy || sessions.length <= 1}>
                                {revokeBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Revoke other sessions
                            </Button>
                        </div>

                        {sessionsLoaded && (
                            <div className="divide-y rounded-md border text-sm">
                                {sessions.map((s) => (
                                    <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="font-medium">
                                                {s.isCurrent ? "This device" : "Other device"}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {s.userAgent || "Unknown browser"} ·{" "}
                                                {s.ipAddress || "unknown IP"} · since{" "}
                                                {new Date(s.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        {!s.isCurrent && (
                                            <span className="shrink-0 text-xs text-muted-foreground">
                                                expires {new Date(s.expiresAt).toLocaleTimeString()}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-3">
                {saveMsg && (
                    <p className={`text-sm ${saveMsg.kind === "error" ? "text-destructive" : "text-green-700"}`}>
                        {saveMsg.text}
                    </p>
                )}
                <Button onClick={saveProfile} disabled={!canSaveOrg || !profileLoaded || saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
