"use client";

import { Building2, Eye, EyeOff, KeyRound, Sparkles } from "lucide-react";
import { useState, useEffect, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/entity-states";
import { authApi, setAuthToken } from "@/lib/api";

// Zod schema for validation
const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * `useSearchParams` opts the page out of static rendering, so the part of the
 * page that reads the query string has to sit behind a Suspense boundary —
 * otherwise the build fails to prerender this route.
 */
export default function LoginPage() {
    return (
        <Suspense fallback={<LoadingState label="Loading sign-in…" />}>
            <LoginForm />
        </Suspense>
    );
}

function LoginForm() {
    const { login } = useAuth();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [mfa, setMfa] = useState<{ mfaToken: string; email: string } | null>(null);
    const [mfaCode, setMfaCode] = useState("");
    const [mfaBusy, setMfaBusy] = useState(false);
    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
    });

    useEffect(() => {
        const emailParam = searchParams.get('email');
        if (emailParam) {
            setValue('email', emailParam);
            setValue('password', 'Password123!');
        }
    }, [searchParams, setValue]);

    useEffect(() => {
        if (!error) return;
        const timer = setTimeout(() => setError(null), 5000);
        return () => clearTimeout(timer);
    }, [error]);

    const onSubmit = async (data: LoginFormValues) => {
        setError(null);
        try {
            const response = await authApi.login(data.email, data.password);
            const { user, mfaRequired, mfaToken, accessToken } = response.data;
            if (mfaRequired && mfaToken) {
                setMfa({ mfaToken, email: data.email });
                setMfaCode("");
                return;
            }
            if (!user) {
                setError("Login failed: invalid server response.");
                return;
            }
            // Present only when the API runs in bearer mode; `null` clears any
            // token from an earlier session, which is what cookie mode wants.
            setAuthToken(accessToken ?? null);
            login(user);
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Failed to login. Please try again."
            );
        }
    };

    const onVerifyMfa = async () => {
        if (!mfa) return;
        setError(null);
        setMfaBusy(true);
        try {
            const response = await authApi.verifyMfa(mfa.mfaToken, mfaCode);
            setAuthToken(response.data.accessToken ?? null);
            login(response.data.user);
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Invalid verification code. Please try again."
            );
        } finally {
            setMfaBusy(false);
        }
    };

    if (mfa) {
        return (
            <div className="space-y-6">
                <div className="space-y-2 text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Two-step verification
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Enter the 6-digit code from your authenticator app for{" "}
                        <span className="font-medium text-foreground">{mfa.email}</span>
                    </p>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        onVerifyMfa();
                    }}
                    className="space-y-4"
                >
                    <div className="space-y-2">
                        <label
                            htmlFor="mfa-code"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            Verification code
                        </label>
                        <Input
                            id="mfa-code"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            placeholder="000000"
                            value={mfaCode}
                            onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                            disabled={mfaBusy}
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={mfaBusy || mfaCode.length !== 6}>
                        {mfaBusy ? "Verifying..." : "Verify"}
                    </Button>
                </form>

                <div className="text-center text-sm text-muted-foreground">
                    <button
                        type="button"
                        onClick={() => {
                            setMfa(null);
                            setError(null);
                        }}
                        className="font-medium text-primary hover:underline"
                    >
                        Back to sign in
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-center">
                <Link
                    href="/"
                    aria-label="TU Properties - back to home"
                    className="group flex items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-slate-950 shadow-md shadow-amber-500/25 transition-transform duration-200 group-hover:scale-105">
                        <Building2 className="h-5 w-5 stroke-[2.3]" />
                    </span>
                    <span className="text-lg font-extrabold tracking-tight text-foreground">
                        TU Properties
                    </span>
                </Link>
            </div>

            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Welcome back
                </h1>
                <p className="text-sm text-muted-foreground">
                    Enter your credentials to access your account
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                    <label
                        htmlFor="email"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        Email
                    </label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        {...register("email")}
                        disabled={isSubmitting}
                    />
                    {errors.email && (
                        <p className="text-xs text-destructive">{errors.email.message}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="password"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                        Password
                    </label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            className="pr-10"
                            {...register("password")}
                            disabled={isSubmitting}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    {errors.password && (
                        <p className="text-xs text-destructive">{errors.password.message}</p>
                    )}
                </div>

                {error && (
                    <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
            </form>

            {/* Quick Demo Fill Buttons */}
            {/* <div className="pt-4 border-t border-border space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    <span>Quick Fill Demo Personas (Password123!):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {[
                        { label: 'Admin', email: 'admin@westhill.co.ke' },
                        { label: 'Manager', email: 'manager@westhill.co.ke' },
                        { label: 'Accountant', email: 'accountant@westhill.co.ke' },
                        { label: 'Maintenance', email: 'maintenance@rohi.co.ke' },
                        { label: 'Super Admin', email: 'admin@tuproperties.co.ke' },
                    ].map((demo) => (
                        <button
                            key={demo.email}
                            type="button"
                            onClick={() => {
                                setValue('email', demo.email);
                                setValue('password', 'Password123!');
                            }}
                            className="px-2.5 py-1 text-xs rounded-md bg-secondary hover:bg-amber-500/10 hover:text-amber-500 hover:border-amber-500/30 border border-border text-secondary-foreground font-mono transition-colors"
                        >
                            {demo.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link
                    href="/auth/register"
                    className="font-medium text-primary hover:underline"
                >
                    Sign up
                </Link>
            </div> */}
        </div>
    );
}
