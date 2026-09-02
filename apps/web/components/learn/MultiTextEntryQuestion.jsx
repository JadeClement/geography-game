"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeName } from "@/lib/constants";
import { learnPrompt, learnPromptSubtext, learnQuestion, learnTextForm, learnTextInput } from "@/lib/learnUi";
import { primaryBtn } from "@/lib/ui";

const FEEDBACK_DELAY_MS = 900;

const foundChipClass =
  "inline-flex items-center rounded-pill border px-3 py-1 text-sm font-semibold border-success bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)] text-success";
const missedChipClass =
  "inline-flex items-center rounded-pill border px-3 py-1 text-sm font-semibold border-error bg-[color-mix(in_srgb,var(--color-error)_14%,transparent)] text-error";
const hiddenChipClass =
  "inline-flex items-center rounded-pill border px-3 py-1 text-sm font-semibold border-border-subtle bg-inset text-text-muted";

function normalizeText(value) {
  return normalizeName(String(value ?? ""));
}

/**
 * Tier 1 free recall of the FULL neighbor set ("Name every country that borders
 * X."). The learner types one country at a time; each correct, not-yet-found
 * neighbor is accepted and shown as a chip. Extra (non-border) guesses stay as
 * red chips above the text box and mean the round is never marked fully correct.
 * The question resolves when every neighbor is found, or the learner gives up.
 *
 * question.options: [{ value: iso3, label: name }] — the neighbors to recall.
 * Emits the standard answer event via onEmit (supplied by LearnQuestionRenderer).
 */
export default function MultiTextEntryQuestion({
  question,
  onEmit,
  lookupCountryByName,
}) {
  const options = useMemo(() => question?.options ?? [], [question?.options]);
  const [foundIds, setFoundIds] = useState(() => new Set());
  const [wrongGuesses, setWrongGuesses] = useState([]);
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState(null); // "dupe" | null
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef(null);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    setFoundIds(new Set());
    setWrongGuesses([]);
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

  const emitResult = ({ correct, revealUsed, found }) => {
    const foundSet = found ?? foundIds;
    const responseTimeMs = Date.now() - startedAtRef.current;
    onEmit?.({
      correct,
      responseTimeMs,
      revealUsed,
      timedOut: false,
      selectedValue: [...foundSet],
      wrongValues: wrongGuesses.map((guess) => guess.key),
    });
  };

  const alreadyWrong = (key, label) => {
    const normalized = normalizeText(label);
    return wrongGuesses.some(
      (guess) => guess.key === key || normalizeText(guess.label) === normalized
    );
  };

  const submit = (event) => {
    event.preventDefault();
    if (done) return;
    const raw = value.trim();
    const guess = normalizeText(raw);
    if (!guess) return;

    const match = options.find((option) => normalizeText(option.label) === guess);
    if (!match) {
      const resolved = lookupCountryByName?.(raw) ?? null;
      const label = resolved?.name ?? raw;
      const key = resolved?.id ?? guess;
      if (alreadyWrong(key, label)) {
        showFlash("dupe");
        setValue("");
        return;
      }
      setWrongGuesses((prev) => [...prev, { key, label }]);
      setValue("");
      setFlash(null);
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
      const perfect = wrongGuesses.length === 0;
      timerRef.current = setTimeout(
        () =>
          emitResult({
            correct: perfect,
            revealUsed: false,
            found: next,
          }),
        FEEDBACK_DELAY_MS
      );
    }
  };

  const handleGiveUp = () => {
    if (done) return;
    setRevealed(true);
    // Reveal chips immediately; host shows Continue (no auto-advance timer).
    emitResult({ correct: false, revealUsed: true, found: foundIds });
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
                state === "found"
                  ? foundChipClass
                  : state === "missed"
                    ? missedChipClass
                    : hiddenChipClass
              }
            >
              {state === "hidden" ? "•••••" : option.label}
            </span>
          );
        })}
      </div>

      {wrongGuesses.length > 0 && (
        <div
          className="flex flex-wrap justify-center gap-2"
          aria-label="Incorrect guesses"
        >
          {wrongGuesses.map((guess) => (
            <span key={guess.key} className={missedChipClass}>
              {guess.label}
            </span>
          ))}
        </div>
      )}

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
          {flash === "dupe" && (
            <p className="m-0 text-center text-sm font-semibold text-text-muted">
              Already entered.
            </p>
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
