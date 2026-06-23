"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppHeader from "@/components/AppHeader";
import ValidationMessage from "@/components/ui/ValidationMessage";
import {
  linkBtn,
  modalMessage,
  primaryBtn,
  settingsBack,
  settingsContent,
  settingsPage,
  settingsSection,
  settingsSectionDescription,
  settingsSectionTitle,
  settingsTitle,
} from "@/lib/ui";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const { update } = useSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Verification link is missing or invalid.");
      return;
    }

    let cancelled = false;

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((res) => res.json())
      .then(async (data) => {
        if (cancelled) return;
        if (data.error && !data.message?.includes("already verified")) {
          setError(data.error);
        } else {
          setSuccess(data.message || "Email verified successfully.");
          await update({ emailVerified: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not verify email.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, update]);

  if (loading) {
    return <p className="text-text-muted">Verifying your email…</p>;
  }

  if (error) {
    return (
      <>
        <ValidationMessage type="error" message={error} />
        <p className="mt-4 text-center text-sm text-text-muted">
          Signed in?{" "}
          <button
            type="button"
            className={linkBtn}
            onClick={() =>
              fetch("/api/auth/verify-email/resend", { method: "POST" })
                .then((res) => res.json())
                .then((data) => setSuccess(data.message || data.error))
            }
          >
            Resend verification email
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <p className={modalMessage({ success: true })}>{success}</p>
      <Link href="/" className={primaryBtn}>
        Continue to Worldly
      </Link>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className={settingsPage}>
      <AppHeader />
      <main className={settingsContent}>
        <Link href="/" className={settingsBack}>
          ← Back to game
        </Link>

        <h1 className={settingsTitle}>Email verification</h1>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>Verify your email</h2>
          <p className={settingsSectionDescription}>
            We&apos;re confirming your email address for your Worldly account.
          </p>

          <Suspense fallback={<p className="text-text-muted">Loading…</p>}>
            <VerifyEmailContent />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
