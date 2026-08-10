"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import ValidationMessage from "./ValidationMessage";

const inputBase =
  "w-full rounded-sm border bg-input px-3 py-2.5 text-base text-text shadow-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60";

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3" />
      <path d="M6.6 6.6C3.9 8.2 2 12 2 12s3.5 7 10 7a10.9 10.9 0 0 0 4-.7" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export default function Input({
  label,
  id,
  error,
  helpText,
  className = "",
  type,
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hasError = Boolean(error);
  const helpId = helpText ? `${inputId}-help` : undefined;

  const isPassword = type === "password";
  const [revealed, setRevealed] = useState(false);
  const inputType = isPassword && revealed ? "text" : type;

  const reveal = () => setRevealed(true);
  const hide = () => setRevealed(false);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          type={inputType}
          aria-invalid={hasError || undefined}
          aria-describedby={!hasError ? helpId : undefined}
          className={cn(
            inputBase,
            hasError
              ? "border-error focus:border-error focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-error)_22%,transparent)]"
              : "border-border-subtle focus:border-accent focus:shadow-[0_0_0_4px_var(--color-accent-soft)]",
            isPassword && "pr-11",
            className
          )}
          {...rest}
        />

        {isPassword && (
          <button
            type="button"
            disabled={rest.disabled}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-sm text-text-muted transition-colors hover:text-text focus-visible:text-text focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={revealed ? "Hide password (release to hide)" : "Show password (hold to reveal)"}
            aria-pressed={revealed}
            title={revealed ? "Release to hide" : "Hold to show password"}
            onPointerDown={(event) => {
              event.preventDefault();
              reveal();
            }}
            onPointerUp={hide}
            onPointerLeave={hide}
            onPointerCancel={hide}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                reveal();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === "Enter" || event.key === " ") hide();
            }}
            onBlur={hide}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>

      {hasError ? (
        <ValidationMessage type="error" message={error} />
      ) : (
        helpText && (
          <p id={helpId} className="text-xs text-text-muted">
            {helpText}
          </p>
        )
      )}
    </div>
  );
}
