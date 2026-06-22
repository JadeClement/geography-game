"use client";

import { useId } from "react";
import ValidationMessage from "./ValidationMessage";

export default function Dropdown({
  label,
  id,
  options = [],
  error,
  className = "",
  ...rest
}) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={selectId}
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <select
          id={selectId}
          aria-invalid={hasError || undefined}
          className={`w-full appearance-none rounded-[var(--radius-sm)] border bg-[var(--color-bg-input)] py-2.5 pl-3 pr-10 text-base text-[var(--color-text)] shadow-sm outline-none transition-[border-color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${
            hasError
              ? "border-[var(--color-error)] focus:border-[var(--color-error)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-error)_22%,transparent)]"
              : "border-[var(--color-border-subtle)] focus:border-[var(--color-accent)] focus:shadow-[0_0_0_4px_var(--color-accent-soft)]"
          } ${className}`}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
        >
          <path
            d="M6 8l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {hasError && <ValidationMessage type="error" message={error} />}
    </div>
  );
}
