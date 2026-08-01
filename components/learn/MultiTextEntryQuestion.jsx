"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { learnPrompt, learnPromptSubtext, learnQuestion, learnTextForm, learnTextInput } from "@/lib/learnUi";
import { primaryBtn } from "@/lib/ui";

const FEEDBACK_DELAY_MS = 900;

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Tier 1 free recall of the FULL neighbor set ("Name every country that borders
 * X."). The learner types one country at a time; each correct, not-yet-found
 * neighbor is accepted and shown as a chip. The question resolves when every
 * neighbor is found (correct) or the learner gives up (reveal → incorrect).
 *
 * question.options: [{ value: iso3, label: name }] — the neighbors to recall.
 * Emits the standard answer event via onEmit (supplied by LearnQuestionRenderer).
 */
export default function MultiTextEntryQuestion({ question, onEmit }) {
  const options = useMemo(() => question?.options ?? [], [question?.options]);
  const [foundIds, setFoundIds] = useState(() => new Set());
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState(null); // "wrong" | "dupe" | null
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef(null);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    setFoundIds(new Set());
    setValue("");
    setRevealed(false);
    setFlash(null);
    startedAtRef.current = Date.now();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, [question?.id]);

  const total = options.length;
  const foundCount = foundIds.size;
  const done = revealed || foundCount >= total;

  const showFlash = (kind) => {
    setFlash(kind);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 1100);
  };

  const emitResult = ({ correct, revealUsed }) => {
    const responseTimeMs = Date.now() - startedAtRef.current;
    const foundNames = options
      .filter((option) => foundIds.has(option.value))
      .map((option) => option.label);
    onEmit?.({ correct, responseTimeMs, revealUsed, timedOut: false, selectedValue: foundNames });
  };

  const submit = (event) => {
    event.preventDefault();
    if (done) return;
    const guess = normalizeText(value);
    if (!guess) return;

    const match = options.find((option) => normalizeText(option.label) === guess);
    if (!match) {
      showFlash("wrong");
      setValue("");
      return;
    }
    if (foundIds.has(match.value)) {
      showFlash("dupe");
      setValue("");
      return;
    }

    const next = new Set(foundIds);
    next.add(match.value);
    setFoundIds(next);
    setValue("");
    setFlash(null);

    if (next.size >= total) {
      timerRef.current = setTimeout(() => emitResult({ correct: true, revealUsed: false }), FEEDBACK_DELAY_MS);
    }
  };

  const handleGiveUp = () => {
    if (done) return;
    setRevealed(true);
    timerRef.current = setTimeout(() => emitResult({ correct: false, revealUsed: true }), FEEDBACK_DELAY_MS);
  };

  return (
    <div className={learnQuestion}>
      <p className={learnPrompt}>{question?.prompt}</p>
      {question?.promptSubtext && (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      )}

      <p className={learnPromptSubtext}>
        {foundCount} / {total} found
      </p>

      <div className="flex flex-wrap justify-center gap-2">
        {options.map((option) => {
          const isFound = foundIds.has(option.value);
          const state = isFound ? "found" : revealed ? "missed" : "hidden";
          return (
            <span
              key={option.value}
              className={
                "inline-flex items-center rounded-pill border px-3 py-1 text-sm font-semibold " +
                (state === "found"
                  ? "border-success bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)] text-success"
                  : state === "missed"
                    ? "border-error bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] text-error"
                    : "border-border-subtle bg-inset text-text-muted")
              }
            >
              {state === "hidden" ? "•••••" : option.label}
            </span>
          );
        })}
      </div>

      {!done && (
        <form className={learnTextForm} onSubmit={submit}>
          <input
            className={learnTextInput}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Type a bordering country…"
            autoComplete="off"
            autoCapitalize="words"
            autoFocus
            aria-label={question?.prompt}
          />
          {flash === "wrong" && (
            <p className="m-0 text-center text-sm font-semibold text-error">Not a border — try another.</p>
          )}
          {flash === "dupe" && (
            <p className="m-0 text-center text-sm font-semibold text-text-muted">Already found.</p>
          )}
          <button type="submit" className={primaryBtn} disabled={!value.trim()}>
            Add
          </button>
          <button
            type="button"
            onClick={handleGiveUp}
            className="cursor-pointer border-0 bg-transparent text-sm font-semibold text-text-muted underline underline-offset-2 hover:text-text-secondary"
          >
            Give up
          </button>
        </form>
      )}
    </div>
  );
}
