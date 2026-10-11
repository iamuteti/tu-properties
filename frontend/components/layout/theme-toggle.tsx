"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Light/dark switch for the whole app (the marketing site stays dark by design).
 *
 * `next-themes` flips the `dark` class on `<html>` and persists the choice in
 * localStorage; every dashboard surface reads the semantic tokens in
 * `globals.css`, so this button is the entire mechanism — there is no per-page
 * theme state to drift. Mounted guard: the resolved theme is unknown on the
 * first server render, and rendering the icon before hydration would mismatch.
 */
export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    return (
        <button
            type="button"
            onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            className="rounded-full p-2 hover:bg-accent hover:text-accent-foreground"
            aria-label={
                resolvedTheme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            }
            title={
                resolvedTheme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
            }
        >
            {resolvedTheme === "dark" ? (
                <Sun className="h-5 w-5" />
            ) : (
                <Moon className="h-5 w-5" />
            )}
        </button>
    );
}
