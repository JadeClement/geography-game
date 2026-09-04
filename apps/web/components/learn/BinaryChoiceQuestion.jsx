"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { getFlagUrl } from "@/lib/flags";
import { formatGdp } from "@/lib/referencePanel";
import {
  learnBinaryCard,
  learnBinaryFlag,
  learnBinaryName,
  learnBinaryRow,
  learnBinaryStat,
  learnBinaryStatHidden,
  learnPrompt,
  learnPromptSubtext,
  learnQuestion,
} from "@/lib/learnUi";

const FEEDBACK_DELAY_MS = 1200;

// Which stat each comparative type reveals after the answer. binary_map_choice is
// a map-recognition question with no numeric stat, so it reveals nothing.
const STAT_BY_TYPE = {
  population_compare: "population",
  area_compare: "area",
  gdp_compare: "gdp",
};

// Map-recognition binary choice: names only (no flags) so the top prompt card
// stays short and doesn't cover the highlighted country.
const COMPACT_TYPES = new Set(["binary_map_choice"]);

function formatStat(field, value) {
  if (typeof value !== "number") return "—";
  if (field === "population") return `${value.toLocaleString()} people`;
  if (field === "area") return `${value.toLocaleString()} km²`;
  if (field === "gdp") return formatGdp(value) ?? "—";
  if (field === "neighborCount") return `${value} border${value === 1 ? "" : "s"}`;
  return String(value);
}

/**
 * Binary comparison (Tier 3 population/area/GDP compares + Tier 2 map choice).
 * Two country cards side by side. The relevant stat is hidden BEFORE the answer
 * (so it stays a geography question, not reading comprehension) and revealed AFTER.
 *
 * Props: question, onAnswer, resolveCountry(countryId) => { name, iso2, population, area, gdp, neighborCount }
 */
export default function BinaryChoiceQuestion({
  question,
  onAnswer,
  onSelectFeedback,
  resolveCountry,
}) {
  const [selected, setSelected] = useState(null); // countryId | null
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [question?.id]);

  const locked = selected != null;
  const statField = STAT_BY_TYPE[question?.type] ?? null;
  const options = question?.options ?? [];
  const compact = COMPACT_TYPES.has(question?.type);

  const handleSelect = (countryId) => {
    if (locked) return;
    const responseTimeMs = Date.now() - startedAtRef.current;
    setSelected(countryId);
    const correct = countryId === question.correctAnswer;
    onSelectFeedback?.({ correct, selectedValue: countryId });
    timerRef.current = setTimeout(() => {
      onAnswer?.({
        correct,
        responseTimeMs,
        revealUsed: false,
        timedOut: false,
        selectedValue: countryId,
      });
    }, FEEDBACK_DELAY_MS);
  };

  const cardState = (countryId) => {
    if (!locked) return "idle";
    if (countryId === question.correctAnswer) return "winner";
    if (countryId === selected) return "wrong";
    return "loser";
  };

  return (
    <div className={cn(learnQuestion, compact && "gap-2")}>
      <p className={cn(learnPrompt, compact && "text-base max-md:text-sm")}>
        {question?.prompt}
      </p>
      {question?.promptSubtext && (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      )}

      <div className={learnBinaryRow}>
        {options.map((option) => {
          const meta = resolveCountry?.(option.countryId) ?? {};
          const iso2 = meta.iso2 ?? null;
          const src = !compact ? getFlagUrl(iso2, 320) : null;
          const statValue = statField ? meta[statField] : null;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(
                learnBinaryCard({ state: cardState(option.countryId), locked }),
                compact && "gap-1 p-2.5"
              )}
              onClick={() => handleSelect(option.countryId)}
              disabled={locked}
            >
              {src && <img src={src} alt="" className={learnBinaryFlag} draggable={false} />}
              <span className={cn(learnBinaryName, compact && "text-sm")}>
                {meta.name ?? option.label}
              </span>
              {statField &&
                (locked ? (
                  <span className={learnBinaryStat}>{formatStat(statField, statValue)}</span>
                ) : (
                  <span className={learnBinaryStatHidden}>· · ·</span>
                ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
