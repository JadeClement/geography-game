"use client";

import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import {
  discoverCompleteAction,
  discoverCompleteActionDesc,
  discoverCompleteActionTitle,
  discoverCompleteBody,
  discoverCompleteHero,
  discoverCompleteIconWrap,
  discoverCompleteModalCard,
  discoverCompletePrompt,
  modalOverlay,
  modalSubtitle,
  modalTitle,
} from "@/lib/ui";

function ExploreCompleteIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M3 12h18M12 3c2.8 2.2 4.5 5.2 4.5 9s-1.7 6.8-4.5 9M12 3C9.2 5.2 7.5 8.2 7.5 12s1.7 6.8 4.5 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M16.5 8.5 11 14l-2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DiscoverCompleteModal({
  open,
  countryCount,
  regionLabel,
  modeLabel,
  testLevelLabel,
  onKeepDiscovering,
  onStartTest,
}) {
  const dialogRef = useFocusTrap(open);

  if (!open) return null;

  const countryLabel = countryCount === 1 ? "country" : "countries";

  return (
    <div className={modalOverlay}>
      <div
        ref={dialogRef}
        className={discoverCompleteModalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-complete-title"
        aria-describedby="discover-complete-desc"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={discoverCompleteHero}>
          <div className={discoverCompleteIconWrap}>
            <ExploreCompleteIcon />
          </div>
          <div>
            <h2 id="discover-complete-title" className={cn(modalTitle, "mb-1")}>
              You&apos;ve explored them all!
            </h2>
            <p id="discover-complete-desc" className={cn(modalSubtitle, "mb-0")}>
              {countryCount} {countryLabel} in {regionLabel} · {modeLabel}
            </p>
          </div>
        </div>

        <div className={discoverCompleteBody}>
          <p className={discoverCompletePrompt}>What would you like to do next?</p>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              className={discoverCompleteAction({ recommended: true })}
              onClick={onStartTest}
            >
              <span className={discoverCompleteActionTitle}>Ready to test yourself?</span>
              <span className={discoverCompleteActionDesc}>
                Start a {testLevelLabel} quiz for this region
              </span>
            </button>
            <button
              type="button"
              className={discoverCompleteAction()}
              onClick={onKeepDiscovering}
            >
              <span className={discoverCompleteActionTitle}>Keep discovering?</span>
              <span className={discoverCompleteActionDesc}>
                Stay on the map and keep tapping around
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
