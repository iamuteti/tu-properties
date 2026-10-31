"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { authApi } from "@/lib/api";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "success" | "error">(() =>
    token ? "idle" : "error"
  );
  const [message, setMessage] = useState<string>(() =>
    token ? "" : "No verification token was provided in the link."
  );

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        await authApi.verifyEmail(token);
        if (!cancelled) {
          setStatus("success");
          setMessage("Your email has been verified. You can now sign in.");
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStatus("error");
          setMessage(
            (err as { response?: { data?: { message?: string } } })?.response
              ?.data?.message ||
              "The verification link is invalid or has expired. You can request a new one on the sign-in page."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const Icon = status === "error" ? AlertCircle : status === "success" ? CheckCircle2 : Mail;
  const iconColor =
    status === "error"
      ? "text-destructive"
      : status === "success"
        ? "text-green-500"
        : "text-amber-500";

  return (
    <div className="flex min-h-[400px] items-center justify-center bg-muted p-4 sm:p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-3 text-center">
          <div className={`mx-auto h-10 w-10 rounded-full flex items-center justify-center ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-bold text-foreground">
            {status === "error"
              ? "Verification failed"
              : status === "success"
                ? "Email verified"
                : "Verifying your email…"}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {message}
          </p>
        </div>
        {(status === "success" || status === "error") && (
          <div className="mt-6 flex justify-center">
            <Link
              href="/auth/login"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {status === "success" ? "Sign in" : "Go to sign in"} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
