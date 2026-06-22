"use client";

import { startBackArrow } from "@/lib/ui";

export default function StartBackButton({ onClick, label = "Back" }) {
  return (
    <button type="button" className={startBackArrow} onClick={onClick} aria-label={label}>
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 12H5" />
        <path d="M12 19l-7-7 7-7" />
      </svg>
    </button>
  );
}
