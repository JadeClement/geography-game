"use client";

import { useId } from "react";
import ValidationMessage from "./ValidationMessage";

export default function Input({
  label,
  id,
  error,
  helpText,
  className = "",
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hasError = Boolean(error);
  const helpId = helpText ? `${inputId}-help` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          {label}
        </label>
      )}

      <input
        id={inputId}
        aria-invalid={hasError || undefined}
        aria-describedby={!hasError ? helpId : undefined}
        className={`w-full rounded-[var(--radius-sm)] border bg-[var(--color-bg-input)] px-3 py-2.5 text-base text-[var(--color-text)] shadow-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--color-text-muted)] disabled:cursor-not-allowed disabled:opacity-60 ${
          hasError
            ? "border-[var(--color-error)] focus:border-[var(--color-error)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-error)_22%,transparent)]"
            : "border-[var(--color-border-subtle)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_4px_var(--color-accent-soft)]"
        } ${className}`}
        {...rest}
      />

      {hasError ? (
        <ValidationMessage type="error" message={error} />
      ) : (
        helpText && (
          <p id={helpId} className="text-xs text-[var(--color-text-muted)]">
            {helpText}
          </p>
        )
      )}
    </div>
  );
}
