"use client";

import { getFlagUrl } from "@/lib/flags";
import { formatTypeBreakdown } from "@/lib/learn/sessionSummary";
import {
  learnSummary,
  learnSummaryChevron,
  learnSummaryCount,
  learnSummaryDeltaDown,
  learnSummaryDeltaList,
  learnSummaryDeltaName,
  learnSummaryDeltaRow,
  learnSummaryDeltaUp,
  learnSummaryDetails,
  learnSummaryFact,
  learnSummaryFactLabel,
  learnSummaryFactText,
  learnSummarySection,
  learnSummarySummary,
  learnSummaryTitle,
  learnSummaryTypeChip,
  learnSummaryTypeList,
} from "@/lib/learnUi";

function formatDelta(delta) {
  const points = Math.round(delta * 100);
  return `${points > 0 ? "+" : ""}${points}%`;
}

/**
 * Learn-mode session summary, appended BELOW the existing per-session results
 * (score/accuracy) in the game-complete screen. Renders nothing unless it has a
 * summary with content, so it's safe to mount unconditionally for Learn mode.
 *
 * Props:
 * - summary: output of buildLearnSessionSummary()
 * - afterIntro: rendered after "This session" and before Improved / Needs work,
 *   so complete-screen actions sit above the collapsible lists.
 */
export default function LearnSessionSummary({ summary, afterIntro = null }) {
  if (!summary) return afterIntro ?? null;

  const typeChips = formatTypeBreakdown(summary.typeBreakdown);
  const improved = summary.masteryDeltas.filter((entry) => entry.delta > 0);
  const dropped = summary.masteryDeltas
    .filter((entry) => entry.delta < 0)
    .sort((a, b) => a.delta - b.delta);
  const dropFact = summary.biggestDropFact;

  if (
    typeChips.length === 0 &&
    improved.length === 0 &&
    dropped.length === 0 &&
    !afterIntro
  ) {
    return null;
  }

  const dropFlag = dropFact ? getFlagUrl(dropFact.country?.iso2, 160) : null;

  return (
    <div className={learnSummary}>
      {typeChips.length > 0 && (
        <section className={learnSummarySection}>
          <h3 className={learnSummaryTitle}>This session</h3>
          <div className={learnSummaryTypeList}>
            {typeChips.map((chip) => (
              <span key={chip.label} className={learnSummaryTypeChip}>
                {chip.text}
              </span>
            ))}
          </div>
        </section>
      )}

      {afterIntro}

      {improved.length > 0 && (
        <details className={learnSummaryDetails}>
          <summary className={learnSummarySummary}>
            Improved
            <span className={learnSummaryCount}>{improved.length}</span>
            <span className={learnSummaryChevron} aria-hidden="true" />
          </summary>
          <div className={learnSummaryDeltaList}>
            {improved.map((entry) => (
              <div key={entry.countryId} className={learnSummaryDeltaRow}>
                <span className={learnSummaryDeltaName}>{entry.name}</span>
                <span className={learnSummaryDeltaUp}>▲ {formatDelta(entry.delta)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {dropped.length > 0 && (
        <details className={learnSummaryDetails}>
          <summary className={learnSummarySummary}>
            Needs work
            <span className={learnSummaryCount}>{dropped.length}</span>
            <span className={learnSummaryChevron} aria-hidden="true" />
          </summary>
          <div className={learnSummaryDeltaList}>
            {dropped.map((entry) => (
              <div key={entry.countryId} className={learnSummaryDeltaRow}>
                <span className={learnSummaryDeltaName}>{entry.name}</span>
                <span className={learnSummaryDeltaDown}>▼ {formatDelta(entry.delta)}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {dropFact?.fact && (
        <section className={learnSummaryFact}>
          <span className={learnSummaryFactLabel}>
            Did you know · {dropFact.country?.name}
          </span>
          <div className="flex items-start gap-2">
            {dropFlag && (
              <img
                src={dropFlag}
                alt=""
                className="mt-0.5 h-5 w-7 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10"
                draggable={false}
              />
            )}
            <p className={learnSummaryFactText}>{dropFact.fact.text}</p>
          </div>
        </section>
      )}
    </div>
  );
}
