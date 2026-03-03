/**
 * useAuthGuard — Ephemeral Session Authentication Guard
 *
 * Checks sessionStorage for the 'sentry_auth' sentinel key on component mount.
 * If the key is absent (tab was fresh / never logged in), the user is
 * immediately redirected to the login page at /.
 *
 * Design rationale:
 * ─ sessionStorage is deliberately chosen over localStorage so the session
 *   clears automatically when the presenter closes the browser tab between
 *   demo runs. No manual logout required.
 * ─ There is no server-side token validation — this is a demo auth guard,
 *   not a production security boundary.
 * ─ `router.replace` is used (not `push`) so pressing the back button from
 *   /dashboard does not cycle back to a protected view.
 *
 * Usage:
 *   Call as the first hook in DashboardPage() before any rendering logic.
 *   The component will still mount briefly before the redirect fires, so
 *   ensure no sensitive data is rendered before this resolves.
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const AUTH_SESSION_KEY = "sentry_auth" as const;

export function useAuthGuard(): void {
  const router = useRouter();

  useEffect(() => {
    // Guard against SSR — sessionStorage is browser-only
    if (typeof window === "undefined") return;

    const isAuthenticated = sessionStorage.getItem(AUTH_SESSION_KEY) === "1";

    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [router]);
}
