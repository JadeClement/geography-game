"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { isFastResponse } from "@/lib/mastery";
import {
  learnPrompt,
  learnPromptSubtext,
  learnQuestion,
  learnTextForm,
  learnTextInput,
  learnTextInputOutcome,
  learnTextCorrectReveal,
  learnContinueArrowBtn,
} from "@/lib/learnUi";
import { primaryBtn } from "@/lib/ui";
import ClueButton from "./ClueButton";
import MultipleChoiceQuestion from "./MultipleChoiceQuestion";
import MultiSelectQuestion from "./MultiSelectQuestion";
import YesNoQuestion from "./YesNoQuestion";
import BinaryChoiceQuestion from "./BinaryChoiceQuestion";
import MultiTextEntryQuestion from "./MultiTextEntryQuestion";

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function defaultMatch(input, correctAnswer) {
  const normalized = normalizeText(input);
  if (!normalized) return false;
  const acceptable = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];
  return acceptable.some((candidate) => normalizeText(candidate) === normalized);
}

function formatCorrectAnswerLabel(correctAnswer) {
  if (correctAnswer == null) return null;
  if (typeof correctAnswer === "boolean") return correctAnswer ? "Yes" : "No";
  if (Array.isArray(correctAnswer)) {
    const parts = correctAnswer.filter((value) => value != null && value !== "");
    return parts.length > 0 ? parts.join(", ") : null;
  }
  const label = String(correctAnswer).trim();
  return label || null;
}

function ContinueArrowButton({ onClick, className }) {
  return (
    <button
      type="button"
      className={cn(learnContinueArrowBtn, className)}
      onClick={onClick}
      aria-label="Continue"
      autoFocus
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <path
          d="M5 12h12M13 6l6 6-6 6"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * Self-contained text entry (Tier 1 free recall). The integrated app can pass a
 * richer `matchAnswer` (the existing accent-tolerant/suggestion matcher); by
 * default we normalize + compare against the acceptable answer(s).
 *
 * Highlight-map free recall ("What country is highlighted?"): after submit the
 * typed answer turns green/red and Submit becomes the continue arrow in place.
 * On a miss, a green box under the input shows the correct answer.
 */
function TextEntryQuestion({
  question,
  onEmit,
  onSelectFeedback,
  matchAnswer,
  clues,
  onContinue,
}) {
  const [value, setValue] = useState("");
  const [revealUsed, setRevealUsed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [outcome, setOutcome] = useState(null); // "correct" | "wrong" | null
  const startedAtRef = useRef(Date.now());
  // Keep the card short when the map is the answer surface so the full region
  // stays visible under a top-pinned prompt.
  const compact = question?.mapConfig?.display === "highlight";
  const correctLabel = formatCorrectAnswerLabel(question?.correctAnswer);

  useEffect(() => {
    setValue("");
    setRevealUsed(false);
    setSubmitted(false);
    setOutcome(null);
    startedAtRef.current = Date.now();
  }, [question?.id]);

  const submit = (event) => {
    event.preventDefault();
    if (submitted || !value.trim()) return;
    const responseTimeMs = Date.now() - startedAtRef.current;
    const correct = matchAnswer
      ? matchAnswer(value, question.correctAnswer, question)
      : defaultMatch(value, question.correctAnswer);
    setSubmitted(true);
    setOutcome(correct ? "correct" : "wrong");
    onSelectFeedback?.({ correct, selectedValue: value });
    onEmit({
      correct,
      responseTimeMs,
      revealUsed,
      timedOut: false,
      selectedValue: value,
    });
  };

  return (
    <div className={cn(learnQuestion, compact && "gap-2")}>
      <p className={cn(learnPrompt, compact && "text-base max-md:text-sm")}>
        {question?.prompt}
      </p>
      {question?.promptSubtext && (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      )}
      <form
        className={cn(learnTextForm, compact && "gap-2")}
        onSubmit={submit}
      >
        {compact ? (
          <div className="flex w-full items-stretch gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                className={cn(
                  learnTextInput,
                  "w-full max-w-none py-1.5 text-sm",
                  learnTextInputOutcome(outcome)
                )}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Type your answer…"
                autoComplete="off"
                autoCapitalize="words"
                autoFocus={!submitted}
                disabled={submitted}
                aria-label={question?.prompt}
              />
              {outcome === "wrong" && correctLabel ? (
                <div
                  className={cn(learnTextCorrectReveal, "max-w-none py-1.5 text-sm")}
                  role="status"
                >
                  {correctLabel}
                </div>
              ) : null}
            </div>
            {submitted && onContinue ? (
              <ContinueArrowButton
                onClick={onContinue}
                className="h-[2.25rem] shrink-0 self-start"
              />
            ) : (
              <button
                type="submit"
                className={cn(primaryBtn, "h-[2.25rem] w-auto shrink-0 self-start px-3 py-1.5 text-sm")}
                disabled={submitted || !value.trim()}
              >
                Submit
              </button>
            )}
          </div>
        ) : (
          <>
            <input
              className={cn(learnTextInput, learnTextInputOutcome(outcome))}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Type your answer…"
              autoComplete="off"
              autoCapitalize="words"
              autoFocus={!submitted}
              disabled={submitted}
              aria-label={question?.prompt}
            />
            {outcome === "wrong" && correctLabel ? (
              <div className={learnTextCorrectReveal} role="status">
                {correctLabel}
              </div>
            ) : null}
            <button
              type="submit"
              className={primaryBtn}
              disabled={submitted || !value.trim()}
            >
              Submit
            </button>
          </>
        )}
      </form>
      {!submitted && (
        <ClueButton question={question} clues={clues} onReveal={() => setRevealUsed(true)} />
      )}
    </div>
  );
}

/**
 * Map-click prompt (Tier 1 blank map click / Tier 4 shared border click). The map
 * itself is owned by the host game screen; this renders only the prompt overlay
 * and clue ladder. The host wires the actual map click to the `emit` function via
 * `onMapClickReady(emit)`, keeping the answer-event shape centralized here.
 */
function MapClickPrompt({ question, emit, onMapClickReady, clues }) {
  useEffect(() => {
    onMapClickReady?.(emit);
  }, [onMapClickReady, emit]);

  return (
    <div className={learnQuestion}>
      <p className={learnPrompt}>{question?.prompt}</p>
      {question?.promptSubtext && (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      )}
      <ClueButton question={question} clues={clues} />
    </div>
  );
}

/**
 * Routes a Learn question object to the correct answer UI and normalizes every
 * answer into a single event shape (Step 5a):
 *   { questionId, countryId, correct, fast, timedOut, revealUsed, questionType, tier }
 *
 * Props:
 * - question: the question object from the generator/sequencer
 * - onAnswer: receives the normalized event
 * - resolveCountry?: (countryId) => { name, iso2, population, area, neighborCount }
 * - speedBaselineMs?: number — the user's personal speed baseline (for `fast`)
 * - clues?: string[] — Tier 1/2 clue ladder text
 * - matchAnswer?, onMapClickReady? — integration seams (see subcomponents)
 */
export default function LearnQuestionRenderer({
  question,
  onAnswer,
  onSelectFeedback,
  resolveCountry,
  speedBaselineMs = null,
  clues = [],
  matchAnswer,
  onMapClickReady,
  onContinue,
}) {
  const emit = useCallback(
    (partial = {}) => {
      const responseTimeMs = partial.responseTimeMs ?? null;
      const fast = isFastResponse(responseTimeMs, speedBaselineMs);
      onAnswer?.({
        questionId: question?.id ?? null,
        countryId: question?.countryId ?? null,
        correct: Boolean(partial.correct),
        fast: Boolean(fast),
        timedOut: Boolean(partial.timedOut),
        revealUsed: Boolean(partial.revealUsed),
        priorMiss: Boolean(partial.priorMiss),
        questionType: question?.type ?? null,
        tier: question?.tier ?? null,
        predictedSuccess:
          question?.predictedSuccess != null &&
          Number.isFinite(question.predictedSuccess)
            ? question.predictedSuccess
            : null,
        responseTimeMs,
        selectedValue: partial.selectedValue,
      });
    },
    [question, onAnswer, speedBaselineMs]
  );

  const preview = useCallback(
    (partial = {}) => {
      onSelectFeedback?.({
        questionId: question?.id ?? null,
        countryId: question?.countryId ?? null,
        questionType: question?.type ?? null,
        correct: Boolean(partial.correct),
        selectedValue: partial.selectedValue,
      });
    },
    [question, onSelectFeedback]
  );

  if (!question) return null;

  // Key every answer UI by question id so a new question fully remounts the
  // component. Without this, React reuses the same instance across questions and
  // stale internal state (e.g. a prior selection) persists — making the next
  // question appear already answered.
  switch (question.answerType) {
    case "multiple_choice":
      return (
        <MultipleChoiceQuestion
          key={question.id}
          question={question}
          onAnswer={emit}
          resolveCountry={resolveCountry}
          clues={clues}
        />
      );
    case "multi_select":
      return (
        <MultiSelectQuestion
          key={question.id}
          question={question}
          onAnswer={emit}
          resolveCountry={resolveCountry}
          clues={clues}
        />
      );
    case "yes_no":
      return (
        <YesNoQuestion
          key={question.id}
          question={question}
          onAnswer={emit}
          clues={clues}
        />
      );
    case "binary_choice":
      return (
        <BinaryChoiceQuestion
          key={question.id}
          question={question}
          onAnswer={emit}
          onSelectFeedback={preview}
          resolveCountry={resolveCountry}
        />
      );
    case "text_entry":
      return (
        <TextEntryQuestion
          key={question.id}
          question={question}
          onEmit={emit}
          onSelectFeedback={preview}
          matchAnswer={matchAnswer}
          clues={clues}
          onContinue={onContinue}
        />
      );
    case "multi_text_entry":
      return (
        <MultiTextEntryQuestion key={question.id} question={question} onEmit={emit} />
      );
    case "map_click":
      return (
        <MapClickPrompt
          key={question.id}
          question={question}
          emit={emit}
          onMapClickReady={onMapClickReady}
          clues={clues}
        />
      );
    default:
      return null;
  }
}
