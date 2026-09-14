"use client";

import { useEffect, useRef, useState } from "react";
import { getFlagUrl } from "@/lib/flags";
import {
  learnChoiceButton,
  learnChoiceFlag,
  learnMultiSelectGrid,
  learnQuestion,
} from "@/lib/learnUi";
import ClueButton from "./ClueButton";
import LearnPromptBar from "./LearnPromptBar";

const FEEDBACK_DELAY_MS = 1100;

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

/**
 * Multi-select ("select all that apply") question — Tier 2 neighbor_select_all.
 *
 * question.options: [{ value, label, countryId? }]
 * question.correctAnswer: string[] — the exact set that must be selected.
 *
 * Learner toggles options, then submits. The round is correct only on an exact
 * set match (every bordering country, no distractors). Mastery still gets
 * partial credit for the share of the set that was right. Feedback paints
 * correct / wrong / missed before emitting the answer event.
 */
export default function MultiSelectQuestion({
  question,
  onAnswer,
  resolveCountry,
  clues = [],
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const [revealUsed, setRevealUsed] = useState(false);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef(null);

  useEffect(() => {
    setSelected(new Set());
    setSubmitted(false);
    setRevealUsed(false);
    startedAtRef.current = Date.now();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [question?.id]);

  const correctSet = new Set(
    Array.isArray(question?.correctAnswer) ? question.correctAnswer : []
  );
  const options = question?.options ?? [];
  const locked = submitted;

  const toggle = (value) => {
    if (locked) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const submit = () => {
    if (locked || selected.size === 0) return;
    const responseTimeMs = Date.now() - startedAtRef.current;
    const correct = sameSet(selected, correctSet);
    setSubmitted(true);
    timerRef.current = setTimeout(() => {
      onAnswer?.({
        correct,
        responseTimeMs,
        revealUsed,
        timedOut: false,
        selectedValue: [...selected],
      });
    }, FEEDBACK_DELAY_MS);
  };

  const handleGiveUp = () => {
    if (locked) return;
    const responseTimeMs = Date.now() - startedAtRef.current;
    setSubmitted(true);
    timerRef.current = setTimeout(() => {
      onAnswer?.({
        correct: false,
        responseTimeMs,
        revealUsed: false,
        timedOut: false,
        selectedValue: [...selected],
        givenUp: true,
      });
    }, FEEDBACK_DELAY_MS);
  };

  const optionState = (option) => {
    const isCorrect = correctSet.has(option.value);
    const isSelected = selected.has(option.value);
    if (!locked) return isSelected ? "selected" : "idle";
    if (isCorrect && isSelected) return "correct";
    if (!isCorrect && isSelected) return "wrong";
    if (isCorrect && !isSelected) return "missed";
    return "muted";
  };

  return (
    <div className={learnQuestion}>
      <LearnPromptBar
        prompt={question?.prompt}
        subtext={question?.promptSubtext}
        showSubmit={!locked}
        onSubmit={submit}
        submitLabel={selected.size > 0 ? `Check (${selected.size})` : "Check"}
        submitDisabled={selected.size === 0}
        showGiveUp={!locked}
        onGiveUp={handleGiveUp}
      />

      <div className={learnMultiSelectGrid} role="group" aria-label={question?.prompt}>
        {options.map((option) => {
          const iso2 = resolveCountry?.(option.countryId)?.iso2 ?? null;
          const src = getFlagUrl(iso2, 160);
          const isSelected = selected.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={learnChoiceButton({ state: optionState(option), locked })}
              onClick={() => toggle(option.value)}
              disabled={locked}
              aria-pressed={isSelected}
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
