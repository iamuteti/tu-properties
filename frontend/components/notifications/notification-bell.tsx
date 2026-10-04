"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { notificationsApi } from "@/lib/api";

/**
 * The notification bell (Module 17), in the shell rather than on a page: an
 * unread count is only useful if it is visible from wherever you already are.
 * Polled rather than pushed — there is no websocket layer, and a stale-by-a-minute
 * badge is acceptable where a missing badge is not.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await notificationsApi.unreadCount();
        if (!cancelled) setCount(response.data.count);
      } catch {
        // A badge that fails to refresh should not disturb the page; the
        // notifications page itself surfaces the error.
      }
    };

    poll();
    const timer = setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      aria-label={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-medium text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}