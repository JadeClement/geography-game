"use client";

import { getFlagUrl } from "@/lib/flags";
import { formatTypeBreakdown } from "@/lib/learn/sessionSummary";
import {
  learnSummary,
  learnSummaryDeltaDown,
  learnSummaryDeltaList,
  learnSummaryDeltaName,
  learnSummaryDeltaRow,
  learnSummaryDeltaUp,
  learnSummaryFact,
  learnSummaryFactLabel,
  learnSummaryFactText,
  learnSummarySection,
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
 */
export default function LearnSessionSummary({ summary }) {
  if (!summary) return null;

  const typeChips = formatTypeBreakdown(summary.typeBreakdown);
  const improved = summary.masteryDeltas.filter((entry) => entry.delta > 0);
  const dropped = summary.masteryDeltas
    .filter((entry) => entry.delta < 0)
    .sort((a, b) => a.delta - b.delta);
  const dropFact = summary.biggestDropFact;

  if (typeChips.length === 0 && improved.length === 0 && dropped.length === 0) {
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

      {improved.length > 0 && (
        <section className={learnSummarySection}>
          <h3 className={learnSummaryTitle}>Improved</h3>
          <div className={learnSummaryDeltaList}>
            {improved.map((entry) => (
              <div key={entry.countryId} className={learnSummaryDeltaRow}>
                <span className={learnSummaryDeltaName}>{entry.name}</span>
                <span className={learnSummaryDeltaUp}>▲ {formatDelta(entry.delta)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {dropped.length > 0 && (
        <section className={learnSummarySection}>
          <h3 className={learnSummaryTitle}>Needs another look</h3>
          <div className={learnSummaryDeltaList}>
            {dropped.map((entry) => (
              <div key={entry.countryId} className={learnSummaryDeltaRow}>
                <span className={learnSummaryDeltaName}>{entry.name}</span>
                <span className={learnSummaryDeltaDown}>▼ {formatDelta(entry.delta)}</span>
              </div>
            ))}
          </div>
        </section>
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
