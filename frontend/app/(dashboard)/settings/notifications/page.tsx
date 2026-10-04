"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { AlertTriangle, CheckCircle2, Send, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notificationsApi } from "@/lib/api";

interface ProviderField {
    name: string;
    label: string;
    secret: boolean;
    required: boolean;
}

interface ProviderSpec {
    id: string;
    label: string;
    channel: string;
    fields: ProviderField[];
    docsUrl: string;
}

interface ChannelState {
    channel: string;
    configured: boolean;
    active: boolean;
    provider: string | null;
    maskedCredentials: Record<string, string> | null;
    settings: Record<string, unknown> | null;
    updatedAt: string | null;
    error?: string;
}

const CHANNEL_TITLES: Record<string, string> = {
    SMS: "SMS",
    EMAIL: "Email",
};

/**
 * Provider configuration (Module 17).
 *
 * Two things this screen is deliberate about. **Saving does not activate** — you
 * enter the keys, send a test, and only then switch the channel over, so a
 * half-typed SID cannot break a channel that was already working. And **only one
 * provider is active per channel**: choosing a provider replaces the previous
 * one rather than adding alongside it, so two vendors can never both be
 * sending your messages.
 *
 * Credentials are stored encrypted and can be replaced but never read back, so
 * the fields below show a masked hint rather than the stored value. Leaving one
 * blank keeps what is already stored.
 */
export default function NotificationSettingsPage() {
    const [providers, setProviders] = useState<ProviderSpec[]>([]);
    const [channels, setChannels] = useState<ChannelState[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    // Selected provider and credential drafts, per channel.
    const [selected, setSelected] = useState<Record<string, string>>({});
    const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
    const [testNumber, setTestNumber] = useState<Record<string, string>>({});

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [providersResponse, configResponse] = await Promise.all([
                notificationsApi.providers(),
                notificationsApi.channelConfig(),
            ]);
            setProviders(providersResponse.data);
            setChannels(configResponse.data);
            // Seed each channel with what it already uses, so the form shows
            // the stored state rather than blanking on every visit.
            const seededSelected: Record<string, string> = {};
            const seededDrafts: Record<string, Record<string, string>> = {};
            for (const channel of configResponse.data) {
                if (channel.provider) {
                    seededSelected[channel.channel] = channel.provider;
                    seededDrafts[channel.channel] = {};
                }
            }
            setSelected((current) => ({ ...seededSelected, ...current }));
            setDrafts((current) => ({ ...seededDrafts, ...current }));
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load notification settings",
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const providersFor = useCallback(
        (channel: string) => providers.filter((provider) => provider.channel === channel),
        [providers],
    );

    const currentProvider = useCallback(
        (channel: string) =>
            providers.find(
                (provider) =>
                    provider.id ===
                    (selected[channel] ??
                        channels.find((item) => item.channel === channel)?.provider),
            ) ?? null,
        [providers, selected, channels],
    );

    const handleSave = async (channel: string) => {
        const provider = currentProvider(channel);
        if (!provider) return;
        setBusy(channel);
        setError(null);
        setNotice(null);
        try {
            await notificationsApi.saveChannelConfig({
                channel,
                provider: provider.id,
                credentials: drafts[channel] ?? {},
            });
            setDrafts((current) => ({ ...current, [channel]: {} }));
            setNotice(
                `${provider.label} credentials saved for ${CHANNEL_TITLES[channel] ?? channel}. Send a test to check them, then activate the channel.`,
            );
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to save the credentials",
            );
        } finally {
            setBusy(null);
        }
    };

    const handleActivate = async (channel: string) => {
        setBusy(channel);
        setError(null);
        setNotice(null);
        try {
            await notificationsApi.activateChannel(channel);
            setNotice(`${CHANNEL_TITLES[channel] ?? channel} is now active.`);
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to activate the channel",
            );
        } finally {
            setBusy(null);
        }
    };

    const handleDeactivate = async (channel: string) => {
        setBusy(channel);
        setError(null);
        setNotice(null);
        try {
            await notificationsApi.deactivateChannel(channel);
            setNotice(`${CHANNEL_TITLES[channel] ?? channel} paused.`);
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to pause the channel",
            );
        } finally {
            setBusy(null);
        }
    };

    const handleTest = async (channel: string) => {
        setBusy(channel);
        setError(null);
        setNotice(null);
        try {
            const response = await notificationsApi.testChannel(
                channel,
                testNumber[channel] ?? "",
            );
            // A vendor rejection is information, not a crash: the reason is what
            // tells an admin whether the key, the number or the account is wrong.
            setNotice(
                response.data.ok
                    ? "Test message accepted by the provider."
                    : `Test message rejected: ${response.data.reason ?? response.data.status}`,
            );
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "The test send failed",
            );
        } finally {
            setBusy(null);
        }
    };

    const smsOnly = useMemo(() => channels.filter((item) => item.channel === "SMS"), [channels]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Notification Settings</h1>
                <p className="text-muted-foreground">
                    Which provider sends SMS and email, and with which credentials
                </p>
            </div>

            {notice && (
                <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
                    {notice}
                </div>
            )}
            {error && <div className="text-destructive text-sm">{error}</div>}

            {isLoading ? (
                <div>Loading settings...</div>
            ) : (
                <>
                    {smsOnly.map((channel) => {
                        const provider = currentProvider(channel.channel);
                        const options = providersFor(channel.channel);
                        return (
                            <Card key={channel.channel}>
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between text-lg">
                                        <span>
                                            {CHANNEL_TITLES[channel.channel] ?? channel.channel}
                                            {channel.active && (
                                                <span className="ml-3 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                                    active
                                                </span>
                                            )}
                                            {!channel.active && channel.configured && (
                                                <span className="ml-3 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                                                    configured, not active
                                                </span>
                                            )}
                                        </span>
                                        <span className="flex items-center gap-2">
                                            {channel.active ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={busy === channel.channel}
                                                    onClick={() => handleDeactivate(channel.channel)}
                                                >
                                                    <ShieldOff className="mr-2 h-4 w-4" /> Pause
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    disabled={
                                                        busy === channel.channel ||
                                                        !channel.configured ||
                                                        Boolean(channel.error)
                                                    }
                                                    onClick={() => handleActivate(channel.channel)}
                                                >
                                                    <CheckCircle2 className="mr-2 h-4 w-4" /> Activate
                                                </Button>
                                            )}
                                        </span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {channel.error && (
                                        <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                                            <AlertTriangle className="h-4 w-4" />
                                            {channel.error}
                                        </p>
                                    )}

                                    <p className="text-sm text-muted-foreground">
                                        One provider at a time — choosing a different vendor
                                        replaces the current one rather than running both.
                                    </p>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Provider</Label>
                                            <Select
                                                name={`provider-${channel.channel}`}
                                                value={selected[channel.channel] ?? channel.provider ?? ""}
                                                placeholder="Choose a provider"
                                                onChange={(event) => {
                                                    setSelected((current) => ({
                                                        ...current,
                                                        [channel.channel]: event.target.value,
                                                    }));
                                                    setDrafts((current) => ({
                                                        ...current,
                                                        [channel.channel]: {},
                                                    }));
                                                }}
                                                options={options.map((option) => ({
                                                    value: option.id,
                                                    label: option.label,
                                                }))}
                                            />
                                        </div>
                                        <div className="flex items-end">
                                            <Button
                                                variant="outline"
                                                disabled={!provider || busy === channel.channel}
                                                onClick={() => handleSave(channel.channel)}
                                            >
                                                Save credentials
                                            </Button>
                                        </div>
                                    </div>

                                    {provider && (
                                        <div className="grid gap-4 md:grid-cols-2">
                                            {provider.fields.map((field) => {
                                                const stored =
                                                    channel.provider === provider.id &&
                                                    channel.maskedCredentials?.[field.name];
                                                return (
                                                    <div key={field.name} className="space-y-2">
                                                        <Label htmlFor={`${channel.channel}-${field.name}`}>
                                                            {field.label}
                                                            {field.required && (
                                                                <span className="text-destructive"> *</span>
                                                            )}
                                                        </Label>
                                                        <Input
                                                            id={`${channel.channel}-${field.name}`}
                                                            type={field.secret ? "password" : "text"}
                                                            placeholder={
                                                                stored
                                                                    ? `stored — leave blank to keep`
                                                                    : ""
                                                            }
                                                            value={drafts[channel.channel]?.[field.name] ?? ""}
                                                            onChange={(event) =>
                                                                setDrafts((current) => ({
                                                                    ...current,
                                                                    [channel.channel]: {
                                                                        ...current[channel.channel],
                                                                        [field.name]: event.target.value,
                                                                    },
                                                                }))
                                                            }
                                                        />
                                                        {stored && (
                                                            <p className="font-mono text-xs text-muted-foreground">
                                                                {stored}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {channel.configured && (
                                        <div className="flex flex-wrap items-end gap-4 border-t pt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor={`test-${channel.channel}`}>
                                                    Send a test message to
                                                </Label>
                                                <Input
                                                    id={`test-${channel.channel}`}
                                                    placeholder="+254700000000"
                                                    value={testNumber[channel.channel] ?? ""}
                                                    onChange={(event) =>
                                                        setTestNumber((current) => ({
                                                            ...current,
                                                            [channel.channel]: event.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    disabled={
                                                        busy === channel.channel ||
                                                        !testNumber[channel.channel]
                                                    }
                                                    onClick={() => handleTest(channel.channel)}
                                                >
                                                    <Send className="mr-2 h-4 w-4" /> Test send
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {channel.updatedAt && (
                                        <p className="text-xs text-muted-foreground">
                                            Last changed{" "}
                                            {new Date(channel.updatedAt).toLocaleString()}
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Email</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Email is catalogued (SMTP settings can be stored) but no mail
                                client is wired yet, so the channel cannot be activated and
                                email deliveries are recorded as not sent. In-app notifications
                                work regardless of this page.
                            </p>
                        </CardContent>
                    </Card>

                    <p className="text-sm text-muted-foreground">
                        Reminders for lease expiry, rent due and overdue rent are sent daily and
                        by in-app delivery. A channel that is not active is skipped and the
                        message is recorded as not sent, rather than failing silently.
                    </p>
                </>
            )}
        </div>
    );
}