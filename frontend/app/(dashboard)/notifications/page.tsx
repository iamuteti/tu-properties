"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import { Bell, Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { notificationsApi, AppNotification } from "@/lib/api";

const PRIORITY_STYLES: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-800",
    HIGH: "bg-amber-100 text-amber-800",
    NORMAL: "bg-muted text-muted-foreground",
    LOW: "bg-muted text-muted-foreground",
};

/**
 * The notification list (Module 17). Every message is kept whatever its
 * channel — a message whose SMS was suppressed still belongs in the trail, and
 * hiding it would make the system look like it did less work than it did.
 */
export default function NotificationsPage() {
    const router = useRouter();
    const [items, setItems] = useState<AppNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await notificationsApi.findAll(
                unreadOnly ? { unreadOnly: true } : undefined,
            );
            setItems(response.data);
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to load notifications",
            );
        } finally {
            setIsLoading(false);
        }
    }, [unreadOnly]);

    useEffect(() => {
        load();
    }, [load]);

    const handleOpen = async (notification: AppNotification) => {
        if (!notification.readAt) {
            try {
                await notificationsApi.markRead(notification.id);
            } catch {
                // Marking read is a convenience; failing it must not stop the
                // reader reaching the thing they were notified about.
            }
        }
        if (notification.actionUrl) router.push(notification.actionUrl);
        else load();
    };

    const handleMarkAll = async () => {
        setBusy(true);
        try {
            await notificationsApi.markAllRead();
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to mark notifications as read",
            );
        } finally {
            setBusy(false);
        }
    };

    const handleRunTriggers = async () => {
        if (!confirm("Run the reminder sweep now? In-app reminders will be created.")) return;
        setBusy(true);
        setError(null);
        try {
            const response = await notificationsApi.runTriggers();
            const { leases, due, overdue } = response.data;
            setNotice(
                `Sweep complete: ${leases} lease expiry, ${due} rent due, ${overdue} overdue reminders. Messages already sent today are skipped.`,
            );
            load();
        } catch (err) {
            setError(
                err instanceof AxiosError
                    ? err.response?.data?.message || err.message
                    : "Failed to run the reminder sweep",
            );
        } finally {
            setBusy(false);
        }
    };

    const unread = items.filter((item) => !item.readAt).length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
                    <p className="text-muted-foreground">
                        {unread} unread of {items.length}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => setUnreadOnly((value) => !value)}
                    >
                        {unreadOnly ? "Show all" : "Unread only"}
                    </Button>
                    <Button variant="outline" onClick={handleMarkAll} disabled={busy}>
                        <Check className="mr-2 h-4 w-4" /> Mark all read
                    </Button>
                    <Button onClick={handleRunTriggers} disabled={busy}>
                        <Play className="mr-2 h-4 w-4" /> Run reminders
                    </Button>
                </div>
            </div>

            {notice && (
                <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                    {notice}
                </div>
            )}
            {error && <div className="text-destructive text-sm">{error}</div>}

            {isLoading ? (
                <div>Loading notifications...</div>
            ) : items.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <Bell className="mx-auto mb-2 h-8 w-8" />
                        Nothing yet. Reminders run each morning for lease expiry, rent due
                        and overdue rent — use &ldquo;Run reminders&rdquo; to do it now.
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <ul className="divide-y">
                            {items.map((item) => (
                                <li
                                    key={item.id}
                                    className={`flex cursor-pointer items-start gap-4 py-3 ${
                                        item.readAt ? "opacity-60" : ""
                                    }`}
                                    onClick={() => handleOpen(item)}
                                >
                                    {!item.readAt && (
                                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-medium">{item.title}</p>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs ${
                                                    PRIORITY_STYLES[item.priority] ??
                                                    PRIORITY_STYLES.NORMAL
                                                }`}
                                            >
                                                {item.priority.toLowerCase()}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {item.channel.replace("_", " ").toLowerCase()}
                                            </span>
                                            {item.status === "SUPPRESSED" && (
                                                <span
                                                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                                                    title="No provider is configured for this channel, so it was not sent"
                                                >
                                                    not sent
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {item.body}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {new Date(item.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}