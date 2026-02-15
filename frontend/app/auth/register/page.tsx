"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import axios from "axios";

// Zod schema for validation
const registerSchema = z
    .object({
        firstName: z.string().min(2, "First name is required"),
        lastName: z.string().min(2, "Last name is required"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(6, "Password must be at least 6 characters"),
        confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
    const { login } = useAuth();
    const [error, setError] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
    });

    const onSubmit = async (data: RegisterFormValues) => {
        setError(null);
        try {
            // Prepare data for backend (remove confirmPassword, map fields if needed)
            const payload = {
                firstName: data.firstName,
                lastName: data.lastName,
                email: data.email,
                passwordHash: data.password, // Backend expects passwordHash for now, or auth service handles hashing
            };

            const response = await axios.post(
                "http://localhost:3000/auth/register",
                payload
            );

            const { access_token, user } = response.data;
            login(access_token, user);
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Failed to register. Please try again."
            );
        }
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2 text-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Create an account
                </h1>
                <p className="text-sm text-muted-foreground">
                    Enter your information to get started
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label
                            htmlFor="firstName"
                            className="text-sm font-medium leading-none"
                        >
                            First Name
                        </label>
                        <Input
                            id="firstName"
                            {...register("firstName")}
                            disabled={isSubmitting}
                        />
                        {errors.firstName && (
                            <p className="text-xs text-destructive">
                                {errors.firstName.message}
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label
                            htmlFor="lastName"
                            className="text-sm font-medium leading-none"
                        >
                            Last Name
                        </label>
                        <Input
                            id="lastName"
                            {...register("lastName")}
                            disabled={isSubmitting}
                        />
                        {errors.lastName && (
                            <p className="text-xs text-destructive">
                                {errors.lastName.message}
                            </p>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium leading-none">
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
                        className="text-sm font-medium leading-none"
                    >
                        Password
                    </label>
                    <Input
                        id="password"
                        type="password"
                        {...register("password")}
                        disabled={isSubmitting}
                    />
                    {errors.password && (
                        <p className="text-xs text-destructive">{errors.password.message}</p>
                    )}
                </div>

                <div className="space-y-2">
                    <label
                        htmlFor="confirmPassword"
                        className="text-sm font-medium leading-none"
                    >
                        Confirm Password
                    </label>
                    <Input
                        id="confirmPassword"
                        type="password"
                        {...register("confirmPassword")}
                        disabled={isSubmitting}
                    />
                    {errors.confirmPassword && (
                        <p className="text-xs text-destructive">
                            {errors.confirmPassword.message}
                        </p>
                    )}
                </div>

                {error && (
                    <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Creating account..." : "Create account"}
                </Button>
            </form>

            <div className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link
                    href="/auth/login"
                    className="font-medium text-primary hover:underline"
                >
                    Sign in
                </Link>
            </div>
        </div>
    );
}
