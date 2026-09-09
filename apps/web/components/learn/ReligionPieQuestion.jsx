"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  learnPieChartWrap,
  learnPieCorrectValue,
  learnPieLegend,
  learnPieLegendRow,
  learnPieName,
  learnPieNudgeBtn,
  learnPieNudgeGroup,
  learnPieSwatch,
  learnPieValue,
  learnPrompt,
  learnPromptSubtext,
  learnQuestion,
} from "@/lib/learnUi";
import { primaryBtn } from "@/lib/ui";
import {
  RELIGION_PIE_MIN_SLICE,
  RELIGION_PIE_TOLERANCE,
  movePieBoundary,
  nudgePieSlice,
  pieCumulative,
  scoreReligionPie,
  startingPiePercents,
} from "@/lib/learn/religionPie";
import ClueButton from "./ClueButton";

const CX = 100;
const CY = 100;
const RADIUS = 86;
const HANDLE_R = 7.5;
const HIT_R = 16;
const LABEL_R = 52;

const RELIGION_COLORS = {
  Christianity: "#5B8DEF",
  Islam: "#2FA36B",
  Hinduism: "#E07A3D",
  Buddhism: "#D4A017",
  Judaism: "#7B6CDB",
  "No religion": "#8B95A8",
  Other: "#C084FC",
};

function colorFor(name) {
  return RELIGION_COLORS[name] ?? "#9AA3B2";
}

function formatShare(value) {
  const n = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? `${n}%` : `${n.toFixed(1)}%`;
}

function polar(percent, radius) {
  const angle = (percent / 100) * 2 * Math.PI - Math.PI / 2;
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

function slicePath(start, end) {
  const span = Math.max(0, end - start);
  if (span >= 99.95) {
    return `M ${CX} ${CY - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CX} ${CY + RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CX} ${CY - RADIUS} Z`;
  }
  const [x1, y1] = polar(start, RADIUS);
  const [x2, y2] = polar(end, RADIUS);
  const large = span > 50 ? 1 : 0;
  return `M ${CX} ${CY} L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${x2} ${y2} Z`;
}

function percentFromClient(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const dx = clientX - (rect.left + rect.width / 2);
  const dy = clientY - (rect.top + rect.height / 2);
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return (deg / 360) * 100;
}

function setGrabbingCursor(on) {
  if (typeof document === "undefined") return;
  document.body.style.cursor = on ? "grabbing" : "";
  document.body.style.userSelect = on ? "none" : "";
}

/**
 * Drag pie slices (and the handles between them) to match a country's
 * religious makeup. Submit locks the chart and tints each group green/red.
 */
export default function ReligionPieQuestion({ question, onAnswer, clues = [] }) {
  const slices = Array.isArray(question?.correctAnswer) ? question.correctAnswer : [];
  const initial =
    Array.isArray(question?.startingPercents) &&
    question.startingPercents.length === slices.length
      ? question.startingPercents
      : startingPiePercents(slices.length);

  const [percents, setPercents] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [revealUsed, setRevealUsed] = useState(false);
  const [activeHandle, setActiveHandle] = useState(null);
  const startedAtRef = useRef(Date.now());
  const svgRef = useRef(null);
  const percentsRef = useRef(percents);
  const submitTimerRef = useRef(null);
  const submittingRef = useRef(false);
  const dragRef = useRef(null);
  const trackingRef = useRef(false);
  const moveLogicRef = useRef(() => {});
  const upLogicRef = useRef(() => {});
  const onPointerMoveStable = useRef((event) =>
    moveLogicRef.current(event)
  ).current;
  const onPointerUpStable = useRef((event) => upLogicRef.current(event)).current;

  percentsRef.current = percents;
  const locked = submitted;

  useEffect(() => {
    setPercents(
      Array.isArray(question?.startingPercents) &&
        question.startingPercents.length === slices.length
        ? question.startingPercents
        : startingPiePercents(slices.length)
    );
    setSubmitted(false);
    setRevealUsed(false);
    setActiveHandle(null);
    submittingRef.current = false;
    startedAtRef.current = Date.now();
    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
      window.removeEventListener("pointermove", onPointerMoveStable);
      window.removeEventListener("pointerup", onPointerUpStable);
      window.removeEventListener("pointercancel", onPointerUpStable);
      setGrabbingCursor(false);
    };
  }, [question?.id]);

  const names = slices.map((slice) => slice.name);
  const ends = pieCumulative(percents);
  const correctByName = new Map(slices.map((slice) => [slice.name, slice.percent]));

  const applyBoundary = (boundaryIndex, nextCumulative) => {
    setPercents((current) => movePieBoundary(current, boundaryIndex, nextCumulative));
  };

  const endDrag = () => {
    if (dragRef.current == null && !trackingRef.current) return;
    dragRef.current = null;
    trackingRef.current = false;
    setActiveHandle(null);
    setGrabbingCursor(false);
    window.removeEventListener("pointermove", onPointerMoveStable);
    window.removeEventListener("pointerup", onPointerUpStable);
    window.removeEventListener("pointercancel", onPointerUpStable);
  };

  moveLogicRef.current = (event) => {
    if (dragRef.current == null) return;
    const svg = svgRef.current;
    if (!svg) return;
    applyBoundary(
      dragRef.current,
      percentFromClient(svg, event.clientX, event.clientY)
    );
  };
  upLogicRef.current = () => {
    endDrag();
  };

  const beginDrag = (boundaryIndex, event) => {
    if (locked || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    dragRef.current = boundaryIndex;
    setActiveHandle(boundaryIndex);
    setGrabbingCursor(true);
    applyBoundary(boundaryIndex, percentFromClient(svg, event.clientX, event.clientY));
    if (!trackingRef.current) {
      trackingRef.current = true;
      window.addEventListener("pointermove", onPointerMoveStable);
      window.addEventListener("pointerup", onPointerUpStable);
      window.addEventListener("pointercancel", onPointerUpStable);
    }
  };

  const handleSlicePointerDown = (index) => (event) => {
    if (locked || event.button !== 0) return;
    const n = percentsRef.current.length;
    if (n < 2) return;
    let boundary;
    if (index === 0) boundary = 0;
    else if (index === n - 1) boundary = n - 2;
    else {
      const svg = svgRef.current;
      const pointer = svg
        ? percentFromClient(svg, event.clientX, event.clientY)
        : ends[index];
      const prev = ends[index - 1];
      const next = ends[index];
      boundary = Math.abs(pointer - prev) <= Math.abs(pointer - next) ? index - 1 : index;
    }
    beginDrag(boundary, event);
  };

  const handleKeyNudge = (boundaryIndex) => (event) => {
    if (locked) return;
    const step =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const currentEnds = pieCumulative(percentsRef.current);
    applyBoundary(boundaryIndex, currentEnds[boundaryIndex] + step);
  };

  const submit = () => {
    if (locked || submittingRef.current) return;
    submittingRef.current = true;
    const responseTimeMs = Date.now() - startedAtRef.current;
    const currentGuessed = names.map((name, index) => ({
      name,
      percent: percentsRef.current[index],
    }));
    const correct = scoreReligionPie(currentGuessed, slices);
    setSubmitted(true);
    setActiveHandle(null);
    submitTimerRef.current = window.setTimeout(() => {
      onAnswer?.({
        correct,
        responseTimeMs,
        revealUsed,
        timedOut: false,
        selectedValue: currentGuessed,
      });
    }, 1400);
  };

  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (locked) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Enter" || event.repeat) return;
      if (dragRef.current != null) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      event.preventDefault();
      submitRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked]);

  if (slices.length < 2) return null;

  return (
    <div className={cn(learnQuestion, "gap-3")}>
      <p className={learnPrompt}>{question?.prompt}</p>
      {!locked && question?.promptSubtext ? (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      ) : null}

      <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className={learnPieChartWrap}>
          <svg
            ref={svgRef}
            viewBox="0 0 200 200"
            className="h-auto w-full"
            role="img"
            aria-label={question?.prompt}
          >
          {names.map((name, index) => {
            const start = index === 0 ? 0 : ends[index - 1];
            const end = ends[index];
            const mid = (start + end) / 2;
            const span = end - start;
            const [lx, ly] = polar(mid, LABEL_R);
            const state = locked
              ? Math.abs((percents[index] ?? 0) - (correctByName.get(name) ?? 0)) <=
                RELIGION_PIE_TOLERANCE
                ? "correct"
                : "wrong"
              : "idle";
            return (
              <g key={name}>
                <path
                  d={slicePath(start, end)}
                  fill={colorFor(name)}
                  fillOpacity={locked && state === "wrong" ? 0.55 : 0.92}
                  stroke={
                    locked
                      ? state === "correct"
                        ? "var(--color-success)"
                        : "var(--color-error)"
                      : "var(--color-surface)"
                  }
                  strokeWidth={locked ? 2.4 : 1.6}
                  className={locked ? "cursor-default" : "cursor-grab"}
                  onPointerDown={handleSlicePointerDown(index)}
                />
                {span >= 12 ? (
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none fill-white text-[11px] font-bold"
                    style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2.5 }}
                  >
                    {formatShare(percents[index])}
                  </text>
                ) : null}
              </g>
            );
          })}

          {!locked &&
            ends.slice(0, -1).map((end, index) => {
              const [hx, hy] = polar(end, RADIUS);
              const active = activeHandle === index;
              return (
                <g key={`handle-${index}`}>
                  <circle
                    cx={hx}
                    cy={hy}
                    r={HIT_R}
                    fill="transparent"
                    tabIndex={0}
                    role="slider"
                    aria-valuemin={1}
                    aria-valuemax={99}
                    aria-valuenow={Math.round(end)}
                    aria-label={`Boundary after ${names[index]}`}
                    className="cursor-grab focus:outline-none"
                    onPointerDown={(event) => beginDrag(index, event)}
                    onKeyDown={handleKeyNudge(index)}
                  />
                  <circle
                    cx={hx}
                    cy={hy}
                    r={HANDLE_R}
                    fill="var(--color-surface)"
                    stroke={active ? "var(--color-accent)" : "var(--color-text)"}
                    strokeWidth={active ? 2.4 : 1.8}
                    className="pointer-events-none"
                  />
                  <circle
                    cx={hx}
                    cy={hy}
                    r="2.2"
                    fill={active ? "var(--color-accent)" : "var(--color-text)"}
                    className="pointer-events-none"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        <ul className={cn(learnPieLegend, "sm:flex-1")}>
        {names.map((name, index) => {
          const guessedPct = percents[index];
          const truth = correctByName.get(name);
          const state = locked
            ? Math.abs((guessedPct ?? 0) - (truth ?? 0)) <= RELIGION_PIE_TOLERANCE
              ? "correct"
              : "wrong"
            : "idle";
          return (
            <li key={name} className={learnPieLegendRow({ state })}>
              <span
                className={learnPieSwatch}
                style={{ background: colorFor(name) }}
                aria-hidden="true"
              />
              <span className={learnPieName}>{name}</span>
              <span className={learnPieValue}>{formatShare(guessedPct)}</span>
              {locked ? (
                <span
                  className={cn(
                    learnPieCorrectValue,
                    state === "correct" ? "text-success" : "text-error"
                  )}
                >
                  {state === "correct" ? "✓" : `was ${formatShare(truth)}`}
                </span>
              ) : (
                <span className={learnPieNudgeGroup}>
                  <button
                    type="button"
                    className={learnPieNudgeBtn}
                    aria-label={`Decrease ${name}`}
                    disabled={guessedPct <= RELIGION_PIE_MIN_SLICE}
                    onClick={() =>
                      setPercents((current) => nudgePieSlice(current, index, -1))
                    }
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={learnPieNudgeBtn}
                    aria-label={`Increase ${name}`}
                    disabled={guessedPct >= 100 - RELIGION_PIE_MIN_SLICE}
                    onClick={() =>
                      setPercents((current) => nudgePieSlice(current, index, 1))
                    }
                  >
                    +
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      </div>

      {!locked && (
        <ClueButton
          question={question}
          clues={clues}
          onReveal={() => setRevealUsed(true)}
        />
      )}

      {!locked && (
        <button type="button" className={primaryBtn} onClick={submit}>
          Submit
        </button>
      )}
    </div>
  );
}
