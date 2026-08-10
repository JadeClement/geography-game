"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { focusRing, linkBtn } from "@/lib/ui";

const DISMISS_KEY_PREFIX = "worldly-verify-banner-dismissed:";

export default function EmailVerificationBanner() {
  const { data: session, status, update } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const signedIn = status === "authenticated" && session?.user;
  const userId = session?.user?.id;
  const emailVerified = session?.user?.emailVerified;

  useEffect(() => {
    if (!userId) {
      setDismissed(false);
      return;
    }
    try {
      setDismissed(localStorage.getItem(`${DISMISS_KEY_PREFIX}${userId}`) === "1");
    } catch {
      setDismissed(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!signedIn || emailVerified) return;

    let cancelled = false;

    fetch("/api/auth/verification-status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.emailVerified) {
          update({ emailVerified: true });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [signedIn, emailVerified, update]);

  const handleDismiss = useCallback(() => {
    if (!userId) return;
    setDismissed(true);
    try {
      localStorage.setItem(`${DISMISS_KEY_PREFIX}${userId}`, "1");
    } catch {
      // Ignore storage errors.
    }
  }, [userId]);

  const handleResend = async () => {
    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send verification email.");
      }

      setMessage(data.message || "Verification email sent.");
    } catch (resendError) {
      setError(resendError.message);
    } finally {
      setLoading(false);
    }
  };

  if (!signedIn || emailVerified || dismissed) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 items-start justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-text max-md:px-3"
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 font-medium text-amber-100">
          Please verify your email address.
        </p>
        <p className="m-0 mt-0.5 text-text-muted">
          Check your inbox for a verification link, or{" "}
          <button
            type="button"
            className={cn(linkBtn, "text-[inherit]")}
            onClick={handleResend}
            disabled={loading}
          >
            {loading ? "Sending…" : "resend verification email"}
          </button>
          .
        </p>
        {message && <p className="m-0 mt-1 text-success">{message}</p>}
        {error && <p className="m-0 mt-1 text-error">{error}</p>}
      </div>
      <button
        type="button"
        className={cn(
          "shrink-0 rounded-sm border-0 bg-transparent px-3 py-2 text-lg leading-none text-text-muted cursor-pointer hover:text-text",
          focusRing
        )}
        onClick={handleDismiss}
        aria-label="Dismiss verification reminder"
      >
        ×
      </button>
    </div>
  );
}
