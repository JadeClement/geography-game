"use client";

import { useEffect, useRef, useState } from "react";
import {
  learnPrompt,
  learnPromptSubtext,
  learnQuestion,
  learnYesNoButton,
  learnYesNoRow,
} from "@/lib/learnUi";
import ClueButton from "./ClueButton";

const FEEDBACK_DELAY_MS = 800;

/**
 * Yes / No question (neighbor confirm — Tier 2, landlocked check — Tier 3).
 * correctAnswer is a boolean. Same immediate-feedback pattern as multiple choice.
 *
 * Props: question, onAnswer, clues?
 */
export default function YesNoQuestion({ question, onAnswer, clues = [] }) {
  const [selected, setSelected] = useState(null); // true | false | null
  const [revealUsed, setRevealUsed] = useState(false);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [question?.id]);

  const locked = selected != null;

  const handleSelect = (value) => {
    if (locked) return;
    const responseTimeMs = Date.now() - startedAtRef.current;
    setSelected(value);
    const correct = value === question.correctAnswer;
    timerRef.current = setTimeout(() => {
      onAnswer?.({ correct, responseTimeMs, revealUsed, timedOut: false, selectedValue: value });
    }, FEEDBACK_DELAY_MS);
  };

  const stateFor = (value) => {
    if (!locked) return "idle";
    if (value === question.correctAnswer) return "correct";
    if (value === selected) return "wrong";
    return "muted";
  };

  return (
    <div className={learnQuestion}>
      <p className={learnPrompt}>{question?.prompt}</p>
      {question?.promptSubtext && (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      )}

      <div className={learnYesNoRow}>
        <button
          type="button"
          className={learnYesNoButton({ state: stateFor(true), locked })}
          onClick={() => handleSelect(true)}
          disabled={locked}
        >
          Yes
        </button>
        <button
          type="button"
          className={learnYesNoButton({ state: stateFor(false), locked })}
          onClick={() => handleSelect(false)}
          disabled={locked}
        >
          No
        </button>
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
