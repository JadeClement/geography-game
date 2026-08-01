"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

function VerifyEmailResult({ result }) {
  const { update } = useSession();
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const sessionUpdatedRef = useRef(false);

  useEffect(() => {
    if (!result?.ok || sessionUpdatedRef.current) return;
    sessionUpdatedRef.current = true;
    update({ emailVerified: true }).catch(() => {
      // Session refresh is best-effort; verification already succeeded server-side.
    });
  }, [result?.ok, update]);

  const handleResend = async () => {
    setResendLoading(true);
    setResendMessage("");
    setResendError("");

    try {
      const response = await fetch("/api/auth/verify-email/resend", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not send verification email.");
      }

      setResendMessage(data.message || "Verification email sent.");
    } catch (resendErr) {
      setResendError(resendErr.message || "Could not send verification email.");
    } finally {
      setResendLoading(false);
    }
  };

  if (!result?.ok) {
    return (
      <>
        <ValidationMessage
          type="error"
          message={result?.error || "Could not verify email."}
        />
        <p className="mt-4 text-center text-sm text-text-muted">
          Signed in?{" "}
          <button
            type="button"
            className={linkBtn}
            onClick={handleResend}
            disabled={resendLoading}
          >
            {resendLoading ? "Sending…" : "Resend verification email"}
          </button>
        </p>
        {resendMessage && (
          <div className="mt-3">
            <ValidationMessage type="success" message={resendMessage} />
          </div>
        )}
        {resendError && (
          <div className="mt-3">
            <ValidationMessage type="error" message={resendError} />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <p className={modalMessage({ success: true })}>{result.message}</p>
      <Link href="/" className={primaryBtn}>
        Continue to Worldly
      </Link>
    </>
  );
}

export default function VerifyEmailPage({ result }) {
  const ok = Boolean(result?.ok);

  return (
    <div className={settingsPage}>
      <AppHeader />
      <main className={settingsContent}>
        <Link href="/" className={settingsBack}>
          Play now!
        </Link>

        <h1 className={settingsTitle}>Email verification</h1>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>
            {ok ? "You're verified" : "Verify your email"}
          </h2>
          <p className={settingsSectionDescription}>
            {ok
              ? "Your Worldly account email is confirmed."
              : "We couldn't confirm this verification link."}
          </p>

          <VerifyEmailResult result={result} />
        </section>
      </main>
    </div>
  );
}
