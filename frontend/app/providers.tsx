"use client";

import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/context/auth-context";

/**
 * Client-side providers. Theme sits outside auth: the theme class must apply on
 * the very first paint (including the public marketing site, which is always
 * dark by design and simply never reads these tokens), while auth state resolves
 * afterwards without moving pixels.
 */
export default function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
        >
            <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
    );
}
