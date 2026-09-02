"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { getFlagUrl } from "@/lib/flags";
import { formatGdp, formatPopulation } from "@/lib/referencePanel";
import {
  learnPrompt,
  learnPromptSubtext,
  learnQuestion,
  learnRankList,
  learnRankRow,
  learnRankHandle,
  learnRankIndex,
  learnRankName,
  learnRankStat,
  learnRankStatHidden,
} from "@/lib/learnUi";
import { primaryBtn } from "@/lib/ui";

const STAT_BY_TYPE = {
  population_rank: "population",
  area_rank: "area",
  gdp_rank: "gdp",
};

function formatStat(field, value) {
  if (typeof value !== "number") return "—";
  if (field === "population") return formatPopulation(value) ?? "—";
  if (field === "area") return `${value.toLocaleString()} km²`;
  if (field === "gdp") return formatGdp(value) ?? "—";
  return String(value);
}

function reorder(list, from, to) {
  if (from === to || from < 0 || to < 0) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Drag-to-rank five countries by population, area, or GDP.
 * Stats stay hidden until submit; each row then turns green/red.
 */
export default function RankQuestion({ question, onAnswer, resolveCountry }) {
  const initial = (question?.options ?? []).map((option) => option.countryId);
  const [order, setOrder] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const startedAtRef = useRef(Date.now());
  const listRef = useRef(null);
  const dragIndexRef = useRef(null);
  const submitTimerRef = useRef(null);

  useEffect(() => {
    setOrder((question?.options ?? []).map((option) => option.countryId));
    setSubmitted(false);
    setDragIndex(null);
    dragIndexRef.current = null;
    startedAtRef.current = Date.now();
    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    };
  }, [question?.id]);

  const correctOrder = Array.isArray(question?.correctAnswer)
    ? question.correctAnswer
    : [];
  const statField = question?.rankField ?? STAT_BY_TYPE[question?.type] ?? null;
  const locked = submitted;

  const rowState = (countryId, index) => {
    if (!locked) return "idle";
    return correctOrder[index] === countryId ? "correct" : "wrong";
  };

  const handlePointerDown = (index) => (event) => {
    if (locked) return;
    event.preventDefault();
    dragIndexRef.current = index;
    setDragIndex(index);
  };

  useEffect(() => {
    if (dragIndex == null) return undefined;
    const handlePointerMove = (event) => {
      if (dragIndexRef.current == null || !listRef.current) return;
      const rows = [...listRef.current.querySelectorAll("[data-rank-row]")];
      if (rows.length === 0) return;
      const y = event.clientY;
      let over = dragIndexRef.current;
      for (let i = 0; i < rows.length; i += 1) {
        const rect = rows[i].getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          over = i;
          break;
        }
        over = i;
      }
      if (over !== dragIndexRef.current) {
        setOrder((current) => reorder(current, dragIndexRef.current, over));
        dragIndexRef.current = over;
        setDragIndex(over);
      }
    };
    const handlePointerUp = () => {
      dragIndexRef.current = null;
      setDragIndex(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragIndex]);

  const submit = () => {
    if (locked) return;
    const responseTimeMs = Date.now() - startedAtRef.current;
    const countryUpdates = (question?.options ?? []).map((option) => {
      const countryId = option.countryId;
      return {
        countryId,
        correct: order.indexOf(countryId) === correctOrder.indexOf(countryId),
      };
    });
    const correct = countryUpdates.every((update) => update.correct);
    setSubmitted(true);
    submitTimerRef.current = window.setTimeout(() => {
      onAnswer?.({
        correct,
        responseTimeMs,
        revealUsed: false,
        timedOut: false,
        selectedValue: order,
        countryUpdates,
      });
    }, 1400);
  };

  return (
    <div className={learnQuestion}>
      <p className={learnPrompt}>{question?.prompt}</p>
      {question?.promptSubtext && (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      )}
      <ol ref={listRef} className={learnRankList} aria-label={question?.prompt}>
        {order.map((countryId, index) => {
          const meta = resolveCountry?.(countryId) ?? {};
          const src = getFlagUrl(meta.iso2, 320);
          const state = rowState(countryId, index);
          const correctIndex = correctOrder.indexOf(countryId);
          return (
            <li
              key={countryId}
              data-rank-row
              className={cn(
                learnRankRow({ state, locked, dragging: dragIndex === index })
              )}
              onPointerDown={handlePointerDown(index)}
            >
              <span className={learnRankHandle} aria-hidden="true">
                ⋮⋮
              </span>
              <span className={learnRankIndex}>{index + 1}</span>
              {src && (
                <img
                  src={src}
                  alt=""
                  className="h-6 w-9 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10"
                  draggable={false}
                />
              )}
              <span className={learnRankName}>{meta.name ?? countryId}</span>
              {statField &&
                (locked ? (
                  <span className={learnRankStat}>
                    {formatStat(statField, meta[statField])}
                    {state === "wrong" && correctIndex >= 0 ? (
                      <span className="ml-1 text-xs font-semibold text-error">
                        #{correctIndex + 1}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className={learnRankStatHidden}>· · ·</span>
                ))}
            </li>
          );
        })}
      </ol>
      {!locked && (
        <button type="button" className={primaryBtn} onClick={submit}>
          Submit ranking
        </button>
      )}
    </div>
  );
}
