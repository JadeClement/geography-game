"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Input from "@/components/ui/Input";
import ValidationMessage from "@/components/ui/ValidationMessage";
import {
  authForm,
  authSwitch,
  linkBtn,
  modalCard,
  modalClose,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
} from "@/lib/ui";
import { cn } from "@/lib/cn";

export default function AuthModal({ open, onClose, initialMode = "signin", onSuccess }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const resetForm = () => {
    setError("");
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    resetForm();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Could not create account.");
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(
          mode === "signup"
            ? "Account created, but sign-in failed. Try signing in."
            : "Invalid email or password."
        );
      }

      resetForm();
      onSuccess?.();
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={modalOverlay} onClick={onClose}>
      <div
        className={cn(modalCard, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <button type="button" className={modalClose} onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 id="auth-modal-title" className={modalTitle}>
          {mode === "signup" ? "Create an account" : "Sign in"}
        </h2>
        <p className={modalSubtitle}>
          {mode === "signup"
            ? "Save your scores and track progress across games."
            : "Sign in to save scores and track your progress."}
        </p>

        <form className={authForm} onSubmit={handleSubmit}>
          {mode === "signup" && (
            <Input
              label="Name"
              id="auth-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          )}

          <Input
            label="Email"
            id="auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />

          <Input
            label="Password"
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError("");
            }}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 8 : undefined}
            required
          />

          {mode === "signup" && (
            <Input
              label="Confirm password"
              id="auth-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (error) setError("");
              }}
              autoComplete="new-password"
              minLength={8}
              required
            />
          )}

          {error && <ValidationMessage type="error" message={error} />}

          {mode === "signin" && (
            <p className="m-0 text-right text-sm">
              <Link href="/forgot-password" className={linkBtn} onClick={onClose}>
                Forgot password?
              </Link>
            </p>
          )}

          <button type="submit" className={primaryBtn} disabled={loading}>
            {loading
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className={authSwitch}>
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" className={linkBtn} onClick={() => switchMode("signin")}>
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button type="button" className={linkBtn} onClick={() => switchMode("signup")}>
                Create an account
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
