"use client";

import Link from "next/link";
import { useState } from "react";
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setSuccess(data.message);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={settingsPage}>
      <AppHeader />
      <main className={settingsContent}>
        <Link href="/" className={settingsBack}>
          Play now!
        </Link>

        <h1 className={settingsTitle}>Forgot password</h1>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>Reset your password</h2>
          <p className={settingsSectionDescription}>
            Enter the email address for your account and we&apos;ll send you a link to
            reset your password.
          </p>

          <form className={authForm} onSubmit={handleSubmit}>
            <Input
              label="Email"
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />

            {error && <ValidationMessage type="error" message={error} />}
            {success && (
              <p className={modalMessage({ success: true })}>{success}</p>
            )}

            <button type="submit" className={primaryBtn} disabled={loading || Boolean(success)}>
              {loading ? "Please wait…" : "Send reset link"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-text-muted">
            Remember your password?{" "}
            <Link href="/" className={linkBtn}>
              Back to sign in
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
