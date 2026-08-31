"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { getFlagUrl } from "@/lib/flags";
import {
  learnChoiceFlag,
  learnChoiceGrid,
  learnChoiceButton,
  learnFlagChoiceButton,
  learnFlagChoiceGrid,
  learnFlagChoiceImg,
  learnShapeChoiceButton,
  learnShapeChoiceGrid,
  learnShapeChoiceSvg,
  learnPrompt,
  learnPromptMedia,
  learnPromptSubtext,
  learnQuestion,
} from "@/lib/learnUi";
import ClueButton from "./ClueButton";
import CountrySilhouette from "./CountrySilhouette";

const FEEDBACK_DELAY_MS = 800;

function ShapeOutcomeMark({ state }) {
  if (state !== "correct" && state !== "wrong") return null;
  const isCorrect = state === "correct";
  return (
    <span
      className={cn(
        "absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white",
        isCorrect ? "bg-success" : "bg-error"
      )}
      aria-hidden="true"
    >
      {isCorrect ? (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <path
            d="M6.5 12.5l3.5 3.5 7.5-8"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
          <path
            d="M7 7l10 10M17 7 7 17"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

/**
 * Multiple choice question (Tier 2 recognition + Tier 4 association).
 *
 * Props:
 * - question: question object (options: {value,label,countryId?}, correctAnswer=value)
 * - onAnswer: normalized answer callback (supplied by LearnQuestionRenderer)
 * - resolveCountry?: (countryId) => { name, iso2 } — used to render flags/shapes
 * - clues?: string[] — optional Tier 1/2 clue ladder text
 *
 * On tap: immediately marks the correct option green and a wrong selection red,
 * locks the grid, then calls onAnswer after 800ms so the feedback is seen.
 */
export default function MultipleChoiceQuestion({
  question,
  onAnswer,
  resolveCountry,
  clues = [],
}) {
  const [selectedValue, setSelectedValue] = useState(null);
  const [revealUsed, setRevealUsed] = useState(false);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [question?.id]);

  const isFlagGrid = question?.type === "flag_identification";
  const isShapeGrid = question?.type === "shape_identification";
  const showsCountryOptions = question?.type === "neighbor_identification";
  const locked = selectedValue != null;

  const correctSet = useMemo(() => {
    const answer = question?.correctAnswer;
    if (Array.isArray(answer)) return new Set(answer);
    if (answer == null) return new Set();
    return new Set([answer]);
  }, [question?.correctAnswer]);

  // When the map already highlights the country, skip the prompt flag.
  const promptIso2 = useMemo(() => {
    if (isFlagGrid || isShapeGrid) return null;
    if (question?.mapConfig?.display === "highlight") return null;
    return resolveCountry?.(question?.countryId)?.iso2 ?? null;
  }, [isFlagGrid, isShapeGrid, resolveCountry, question?.countryId, question?.mapConfig?.display]);

  const handleSelect = (value) => {
    if (locked) return;
    const responseTimeMs = Date.now() - startedAtRef.current;
    setSelectedValue(value);
    const correct = correctSet.has(value);
    timerRef.current = setTimeout(() => {
      onAnswer?.({ correct, responseTimeMs, revealUsed, timedOut: false, selectedValue: value });
    }, FEEDBACK_DELAY_MS);
  };

  const optionState = (option) => {
    if (!locked) return "idle";
    // Every accepted answer paints green (e.g. East Timor accepts all five).
    if (correctSet.has(option.value)) return "correct";
    if (option.value === selectedValue) return "wrong";
    return "muted";
  };

  const options = question?.options ?? [];

  return (
    <div className={learnQuestion}>
      {promptIso2 && (
        <div className={learnPromptMedia}>
          <img
            src={getFlagUrl(promptIso2, 320)}
            alt=""
            className="h-14 w-auto rounded-[4px] object-cover ring-1 ring-black/10"
            draggable={false}
          />
        </div>
      )}

      <p className={learnPrompt}>{question?.prompt}</p>
      {question?.promptSubtext && (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      )}

      {isFlagGrid ? (
        <div className={learnFlagChoiceGrid}>
          {options.map((option) => {
            const iso2 = resolveCountry?.(option.countryId)?.iso2 ?? null;
            const src = getFlagUrl(iso2, 320);
            return (
              <button
                key={option.value}
                type="button"
                className={learnFlagChoiceButton({ state: optionState(option), locked })}
                onClick={() => handleSelect(option.value)}
                disabled={locked}
                aria-label={locked ? option.label : `Flag option`}
              >
                {src ? (
                  <img src={src} alt="" className={learnFlagChoiceImg} draggable={false} />
                ) : (
                  <span className="text-sm text-text-muted">{option.label}</span>
                )}
                <span
                  className={cn(
                    "text-center text-sm font-semibold leading-tight",
                    locked ? "text-text" : "invisible"
                  )}
                >
                  {resolveCountry?.(option.countryId)?.name ?? option.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : isShapeGrid ? (
        <div className={learnShapeChoiceGrid}>
          {options.map((option) => {
            const state = optionState(option);
            const tone =
              state === "correct"
                ? "correct"
                : state === "wrong"
                  ? "wrong"
                  : state === "muted"
                    ? "muted"
                    : "idle";
            const meta = resolveCountry?.(option.countryId) ?? {};
            return (
              <button
                key={option.value}
                type="button"
                className={learnShapeChoiceButton({ state, locked })}
                onClick={() => handleSelect(option.value)}
                disabled={locked}
                aria-label={locked ? option.label : "Country shape"}
              >
                <ShapeOutcomeMark state={state} />
                <CountrySilhouette
                  feature={meta.feature}
                  countryId={option.countryId}
                  tone={tone}
                  fit="aspect"
                  className={learnShapeChoiceSvg}
                />
                <span
                  className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 px-1 pb-1 text-center text-sm font-semibold leading-tight",
                    locked ? "text-text" : "hidden"
                  )}
                >
                  {meta.name ?? option.label}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={learnChoiceGrid}>
          {options.map((option) => {
            const iso2 = showsCountryOptions
              ? resolveCountry?.(option.countryId)?.iso2 ?? null
              : null;
            const src = getFlagUrl(iso2, 160);
            return (
              <button
                key={option.value}
                type="button"
                className={learnChoiceButton({ state: optionState(option), locked })}
                onClick={() => handleSelect(option.value)}
                disabled={locked}
              >
                {src ? (
                  <span className="flex min-w-0 flex-col items-center gap-1.5">
                    <img src={src} alt="" className={learnChoiceFlag} draggable={false} />
                    <span className="leading-tight">{option.label}</span>
                  </span>
                ) : (
                  <span className="leading-tight">{option.label}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!locked && (
        <ClueButton
          question={question}
          clues={clues}
          onReveal={() => setRevealUsed(true)}
        />
      )}
    </div>
  );
}
