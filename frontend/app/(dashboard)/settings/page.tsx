"use client";

import { Building2, Save, Shield, MonitorSmartphone, Trash2, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { authApi } from "@/lib/api";
import { useEffect, useState } from "react";

type ActiveSession = {
    id: string;
    createdAt: string;
    expiresAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    isCurrent: boolean;
};

export default function SettingsPage() {
    const { user, organization } = useAuth();

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                    Manage your organization profile and preferences
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Organization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="orgName">Organization Name</Label>
                            <Input
                                id="orgName"
                                defaultValue={organization?.name || ""}
                                placeholder="Organization name"
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
                            <Label htmlFor="contactEmail">Contact Email</Label>
                            <Input
                                id="contactEmail"
                                type="email"
                                defaultValue={organization?.contactEmail || ""}
                                placeholder="billing@example.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contactPhone">Contact Phone</Label>
                            <Input
                                id="contactPhone"
                                type="tel"
                                defaultValue={organization?.contactPhone || ""}
                                placeholder="+254 700 000 000"
                            />
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

            <div className="flex justify-end">
                <Button disabled>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                </Button>
            </div>
        </div>
    );
}