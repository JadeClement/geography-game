"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getFlagUrl } from "@/lib/flags";
import {
  learnChoiceFlag,
  learnChoiceGrid,
  learnChoiceButton,
  learnFlagChoiceButton,
  learnFlagChoiceGrid,
  learnFlagChoiceImg,
  learnPrompt,
  learnPromptMedia,
  learnPromptSubtext,
  learnQuestion,
} from "@/lib/learnUi";
import ClueButton from "./ClueButton";

const FEEDBACK_DELAY_MS = 800;

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
  const showsCountryOptions = question?.type === "neighbor_identification";
  const locked = selectedValue != null;

  const promptIso2 = useMemo(() => {
    if (isFlagGrid) return null; // flags are the options, not a hint
    return resolveCountry?.(question?.countryId)?.iso2 ?? null;
  }, [isFlagGrid, resolveCountry, question?.countryId]);

  const handleSelect = (value) => {
    if (locked) return;
    const responseTimeMs = Date.now() - startedAtRef.current;
    setSelectedValue(value);
    const correct = value === question.correctAnswer;
    timerRef.current = setTimeout(() => {
      onAnswer?.({ correct, responseTimeMs, revealUsed, timedOut: false, selectedValue: value });
    }, FEEDBACK_DELAY_MS);
  };

  const optionState = (option) => {
    if (!locked) return "idle";
    if (option.value === question.correctAnswer) return "correct";
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
