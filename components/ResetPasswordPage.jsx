"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import Input from "@/components/ui/Input";
import ValidationMessage from "@/components/ui/ValidationMessage";
import {
  authForm,
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

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenValid(false);
      setError("Reset link is missing or invalid.");
      return;
    }

    let cancelled = false;

    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setTokenValid(Boolean(data.valid));
        if (!data.valid) {
          setError(data.error || "This reset link is invalid or has expired.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not validate reset link.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setValidating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not reset password.");
      }

      setSuccess(data.message);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return <p className="text-text-muted">Checking reset link…</p>;
  }

  if (!tokenValid) {
    return (
      <>
        <ValidationMessage type="error" message={error || "This reset link is invalid or has expired."} />
        <p className="mt-4 text-center text-sm text-text-muted">
          <Link href="/forgot-password" className={linkBtn}>
            Request a new reset link
          </Link>
        </p>
      </>
    );
  }

  if (success) {
    return (
      <>
        <p className={modalMessage({ success: true })}>{success}</p>
        <Link href="/" className={primaryBtn}>
          Sign in
        </Link>
      </>
    );
  }

  return (
    <form className={authForm} onSubmit={handleSubmit}>
      <Input
        label="New password"
        id="reset-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />

      <Input
        label="Confirm new password"
        id="reset-confirm-password"
        type="password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        autoComplete="new-password"
        minLength={8}
        required
      />

      {error && <ValidationMessage type="error" message={error} />}

      <button type="submit" className={primaryBtn} disabled={loading}>
        {loading ? "Please wait…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className={settingsPage}>
      <AppHeader />
      <main className={settingsContent}>
        <Link href="/" className={settingsBack}>
          ← Back to game
        </Link>

        <h1 className={settingsTitle}>Reset password</h1>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>Choose a new password</h2>
          <p className={settingsSectionDescription}>
            Enter a new password for your account.
          </p>

          <Suspense fallback={<p className="text-text-muted">Loading…</p>}>
            <ResetPasswordForm />
          </Suspense>
        </section>
      </main>
    </div>
  );
}
