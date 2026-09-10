"use client";

import { applyWorldlyCurve } from "@/lib/worldlyScore";
import {
  SKILL_DOMAIN_LABELS,
  WORLDLY_DOMAIN_WEIGHTS,
  getWeakestDomain,
} from "@/lib/masteryTiers";
import {
  modalCard,
  modalClose,
  modalOverlay,
  modalSubtitle,
  modalTitle,
} from "@/lib/ui";

function displayPct(raw) {
  return Math.round(applyWorldlyCurve(Number(raw) || 0));
}

export default function CountryMasteryModal({
  open,
  countryName,
  domainScores,
  onClose,
}) {
  if (!open) return null;

  const weakest = getWeakestDomain(domainScores);
  const weakestLabel = SKILL_DOMAIN_LABELS[weakest] ?? weakest;
  const domains = Object.keys(WORLDLY_DOMAIN_WEIGHTS);

  return (
    <div className={modalOverlay} onClick={onClose}>
      <div
        className={modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="country-mastery-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className={modalClose} onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="country-mastery-title" className={modalTitle}>
          {countryName}
        </h2>
        <p className={modalSubtitle}>How well you know this country, by skill.</p>

        <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0">
          {domains.map((domain) => {
            const raw = domainScores?.[domain] ?? 0;
            const pct = displayPct(raw);
            const isWeakest = domain === weakest;
            return (
              <li
                key={domain}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-inset px-3 py-2"
              >
                <span className="text-sm font-semibold text-text">
                  {SKILL_DOMAIN_LABELS[domain] ?? domain}
                  {isWeakest ? (
                    <span className="ml-2 text-[0.7rem] font-medium uppercase tracking-wide text-accent">
                      weakest
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums text-sm font-bold text-text">{pct}%</span>
              </li>
            );
          })}
        </ul>

        {weakest && (
          <p className="m-0 text-sm text-text-secondary">
            Next up: practice <strong>{weakestLabel.toLowerCase()}</strong> to raise this
            country&apos;s Worldly score.
          </p>
        )}
      </div>
    </div>
  );
}
