"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import ValidationMessage from "./ValidationMessage";

export default function Checkbox({
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
      <label htmlFor={inputId} className="flex cursor-pointer select-none items-start gap-2.5">
        <span className="relative inline-flex h-5 w-5 shrink-0">
          <input
            id={inputId}
            type="checkbox"
            aria-invalid={hasError || undefined}
            aria-describedby={!hasError ? helpId : undefined}
            className={cn("peer sr-only", className)}
            {...rest}
          />
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center rounded-sm border bg-input transition-colors",
              "peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:shadow-[0_0_0_3px_var(--color-accent-ring)]",
              hasError ? "border-error" : "border-border-subtle"
            )}
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100"
          >
            <path
              d="M3.5 8.5l3 3 6-6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        {label && <span className="text-sm leading-5 text-text-secondary">{label}</span>}
      </label>

      {hasError ? (
        <ValidationMessage type="error" message={error} />
      ) : (
        helpText && (
          <p id={helpId} className="pl-7 text-xs text-text-muted">
            {helpText}
          </p>
        )
      )}
    </div>
  );
}
