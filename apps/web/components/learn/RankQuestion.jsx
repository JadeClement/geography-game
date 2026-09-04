"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  learnRankPlaceholder,
  learnRankGhost,
  learnRankPositionBar,
  learnRankPositionLabel,
  learnRankPositionRow,
  learnRankPositionBtn,
  learnRankMoveGroup,
  learnRankMoveBtn,
} from "@/lib/learnUi";
import { primaryBtn } from "@/lib/ui";
import {
  reorder,
  slotIndexFromY,
  slotsWithPlaceholder,
} from "@/lib/learn/rankList";

const STAT_BY_TYPE = {
  population_rank: "population",
  area_rank: "area",
  gdp_rank: "gdp",
};

const DRAG_THRESHOLD_PX = 8;
const DEFAULT_HINT = "Largest at the top.";

function formatStat(field, value) {
  if (typeof value !== "number") return "—";
  if (field === "population") return formatPopulation(value) ?? "—";
  if (field === "area") return `${value.toLocaleString()} km²`;
  if (field === "gdp") return formatGdp(value) ?? "—";
  return String(value);
}

function GripIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <circle cx="7" cy="4" r="1.5" />
      <circle cx="13" cy="4" r="1.5" />
      <circle cx="7" cy="10" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="7" cy="16" r="1.5" />
      <circle cx="13" cy="16" r="1.5" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M6 15l6-6 6 6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RankRowBody({ index, meta, src, statNode }) {
  return (
    <>
      <span className={learnRankHandle}>
        <GripIcon />
      </span>
      <span className={learnRankIndex}>{index + 1}</span>
      {src ? (
        <img
          src={src}
          alt=""
          className="h-6 w-9 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10"
          draggable={false}
        />
      ) : null}
      <span className={learnRankName}>{meta.name ?? ""}</span>
      {statNode}
    </>
  );
}

function setGrabbingCursor(on) {
  if (typeof document === "undefined") return;
  document.body.style.cursor = on ? "grabbing" : "";
  document.body.style.userSelect = on ? "none" : "";
}

/**
 * Drag-to-rank five countries by population, area, or GDP.
 * Stats stay hidden until submit; each row then turns green/red.
 *
 * Reorder by dragging (ghost follows the pointer; drop index uses stable
 * list slots so multi-spot moves don't jitter), tapping a country then a
 * position number, tapping another row, or using the per-row arrows.
 */
export default function RankQuestion({ question, onAnswer, resolveCountry }) {
  const initial = (question?.options ?? []).map((option) => option.countryId);
  const [order, setOrder] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [liveDrag, setLiveDrag] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const startedAtRef = useRef(Date.now());
  const listRef = useRef(null);
  const ghostRef = useRef(null);
  const pendingRef = useRef(null);
  const dragRef = useRef(null);
  const orderRef = useRef(order);
  const submitTimerRef = useRef(null);
  const trackingRef = useRef(false);
  const submittingRef = useRef(false);
  const selectedIdRef = useRef(null);
  const lockedRef = useRef(false);
  const moveLogicRef = useRef(() => {});
  const upLogicRef = useRef(() => {});
  const onPointerMoveStable = useRef((event) =>
    moveLogicRef.current(event)
  ).current;
  const onPointerUpStable = useRef((event) => upLogicRef.current(event)).current;

  orderRef.current = order;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    setOrder((question?.options ?? []).map((option) => option.countryId));
    setSubmitted(false);
    setSelectedId(null);
    setLiveDrag(null);
    pendingRef.current = null;
    dragRef.current = null;
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

  const correctOrder = Array.isArray(question?.correctAnswer)
    ? question.correctAnswer
    : [];
  const statField = question?.rankField ?? STAT_BY_TYPE[question?.type] ?? null;
  const locked = submitted;
  lockedRef.current = locked;
  const selectedIndex = selectedId ? order.indexOf(selectedId) : -1;
  const selectedMeta = selectedId ? resolveCountry?.(selectedId) ?? {} : null;

  const rowState = (countryId, index) => {
    if (!locked) return "idle";
    return correctOrder[index] === countryId ? "correct" : "wrong";
  };

  const countryName = (countryId) =>
    resolveCountry?.(countryId)?.name ?? countryId;

  const moveTo = (from, to, { keepSelection = false } = {}) => {
    const last = orderRef.current.length - 1;
    const nextTo = Math.min(Math.max(to, 0), last);
    if (from === nextTo || from < 0 || from > last) return;
    const id = orderRef.current[from];
    setOrder((current) => reorder(current, from, nextTo));
    if (!keepSelection) setSelectedId(null);
    setAnnouncement(`${countryName(id)} moved to position ${nextTo + 1}`);
  };

  const handleTap = (index) => {
    const id = orderRef.current[index];
    if (!id) return;
    const selected = selectedIdRef.current;
    if (selected && selected !== id) {
      moveTo(orderRef.current.indexOf(selected), index);
      return;
    }
    setSelectedId((current) => (current === id ? null : id));
  };

  const endGesture = (event) => {
    const pending = pendingRef.current;
    const drag = dragRef.current;
    pendingRef.current = null;
    dragRef.current = null;
    trackingRef.current = false;
    setGrabbingCursor(false);
    window.removeEventListener("pointermove", onPointerMoveStable);
    window.removeEventListener("pointerup", onPointerUpStable);
    window.removeEventListener("pointercancel", onPointerUpStable);

    if (drag) {
      const listRect = listRef.current?.getBoundingClientRect();
      const overIndex = slotIndexFromY(
        event?.clientY ?? drag.lastY,
        listRect?.top ?? drag.listTop,
        listRect?.height ?? drag.listHeight,
        drag.count
      );
      setLiveDrag(null);
      moveTo(drag.fromIndex, overIndex);
      return;
    }

    setLiveDrag(null);
    if (pending && !lockedRef.current) handleTap(pending.index);
  };

  moveLogicRef.current = (event) => {
    const pending = pendingRef.current;
    const drag = dragRef.current;
    if (drag) {
      drag.lastY = event.clientY;
      if (ghostRef.current) {
        ghostRef.current.style.top = `${drag.rect.top + (event.clientY - drag.startY)}px`;
      }
      const listRect = listRef.current?.getBoundingClientRect();
      const listTop = listRect?.top ?? drag.listTop;
      const listHeight = listRect?.height ?? drag.listHeight;
      const overIndex = slotIndexFromY(
        event.clientY,
        listTop,
        listHeight,
        drag.count
      );
      if (overIndex !== drag.overIndex) {
        drag.overIndex = overIndex;
        setLiveDrag((current) =>
          current ? { ...current, overIndex } : current
        );
      }
      return;
    }
    if (!pending) return;
    const dx = event.clientX - pending.startX;
    const dy = event.clientY - pending.startY;
    if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;

    const nextDrag = {
      fromIndex: pending.index,
      overIndex: pending.index,
      startY: pending.startY,
      lastY: event.clientY,
      rect: pending.rowRect,
      listTop: pending.listTop,
      listHeight: pending.listHeight,
      count: pending.count,
    };
    pendingRef.current = null;
    dragRef.current = nextDrag;
    setSelectedId(null);
    setLiveDrag({
      fromIndex: nextDrag.fromIndex,
      overIndex: nextDrag.overIndex,
      offsetY: event.clientY - pending.startY,
      rect: nextDrag.rect,
      countryId: orderRef.current[nextDrag.fromIndex],
    });
    setGrabbingCursor(true);
  };
  upLogicRef.current = (event) => {
    endGesture(event);
  };

  const handleRowPointerDown = (index) => (event) => {
    if (locked || event.button !== 0 || dragRef.current) return;
    const list = listRef.current;
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    pendingRef.current = {
      index,
      startX: event.clientX,
      startY: event.clientY,
      rowRect: event.currentTarget.getBoundingClientRect(),
      listTop: listRect.top,
      listHeight: listRect.height,
      count: orderRef.current.length,
    };
    if (!trackingRef.current) {
      trackingRef.current = true;
      window.addEventListener("pointermove", onPointerMoveStable);
      window.addEventListener("pointerup", onPointerUpStable);
      window.addEventListener("pointercancel", onPointerUpStable);
    }
  };

  const handleRowKeyDown = (index) => (event) => {
    if (locked) return;
    const last = order.length - 1;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(index, index - 1, { keepSelection: true });
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(index, index + 1, { keepSelection: true });
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(index, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(index, last);
    } else if (event.key === " ") {
      event.preventDefault();
      handleTap(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSelectedId(null);
    }
  };

  const submit = () => {
    if (locked || submittingRef.current) return;
    submittingRef.current = true;
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
    setSelectedId(null);
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

  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (locked) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Enter" || event.repeat) return;
      if (dragRef.current) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      event.preventDefault();
      submitRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked]);

  const hint = locked ? null : DEFAULT_HINT;

  const displaySlots = liveDrag
    ? slotsWithPlaceholder(order, liveDrag.fromIndex, liveDrag.overIndex)
    : order.map((id) => ({ kind: "item", id }));

  const ghostCountryId = liveDrag?.countryId;
  const ghostMeta = ghostCountryId ? resolveCountry?.(ghostCountryId) ?? {} : {};
  const ghostSrc = ghostCountryId ? getFlagUrl(ghostMeta.iso2, 320) : null;

  const statNodeFor = (countryId, state) => {
    if (!statField || !locked) return null;
    const meta = resolveCountry?.(countryId) ?? {};
    const correctIndex = correctOrder.indexOf(countryId);
    return (
      <span className={learnRankStat}>
        {formatStat(statField, meta[statField])}
        {state === "wrong" && correctIndex >= 0 ? (
          <span className="ml-1 text-xs font-semibold text-error">
            #{correctIndex + 1}
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <div className={learnQuestion}>
      <p className={learnPrompt}>{question?.prompt}</p>
      {hint && <p className={learnPromptSubtext}>{hint}</p>}
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      {!locked && (
        <div className={learnRankPositionBar}>
          <p className={learnRankPositionLabel}>
            {selectedMeta
              ? `Move ${selectedMeta.name ?? "this country"} to`
              : "Tap a country, then a number to jump several spots."}
          </p>
          <div className={learnRankPositionRow}>
            {order.map((_, index) => (
              <button
                key={index}
                type="button"
                className={learnRankPositionBtn({
                  current: selectedIndex >= 0 && index === selectedIndex,
                })}
                disabled={selectedIndex < 0 || index === selectedIndex}
                aria-label={`Place at position ${index + 1}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  if (selectedIndex < 0) return;
                  moveTo(selectedIndex, index);
                }}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      <ol
        ref={listRef}
        className={learnRankList}
        aria-label={question?.prompt}
      >
        {displaySlots.map((slot, visualIndex) => {
          if (slot.kind === "placeholder") {
            return (
              <li
                key={`placeholder-${slot.id}`}
                className={learnRankPlaceholder}
                aria-hidden="true"
              >
                <span className={learnRankIndex}>{visualIndex + 1}</span>
              </li>
            );
          }

          const countryId = slot.id;
          const originIndex = order.indexOf(countryId);
          const meta = resolveCountry?.(countryId) ?? {};
          const src = getFlagUrl(meta.iso2, 320);
          const state = rowState(countryId, originIndex);
          const selected = !locked && selectedId === countryId;
          const dropTarget = !locked && Boolean(selectedId) && selectedId !== countryId;

          return (
            <li
              key={countryId}
              data-rank-row
              tabIndex={locked ? -1 : 0}
              aria-label={`${meta.name ?? countryId}, position ${visualIndex + 1}`}
              aria-grabbed={liveDrag?.fromIndex === originIndex}
              aria-selected={selected}
              className={learnRankRow({ state, locked, selected, dropTarget })}
              onPointerDown={handleRowPointerDown(originIndex)}
              onKeyDown={handleRowKeyDown(originIndex)}
            >
              <RankRowBody
                index={visualIndex}
                meta={meta}
                src={src}
                statNode={locked ? statNodeFor(countryId, state) : null}
              />
              {!locked && !liveDrag && (
                <span className={learnRankMoveGroup}>
                  <button
                    type="button"
                    className={learnRankMoveBtn}
                    aria-label={`Move ${meta.name ?? "country"} up`}
                    disabled={originIndex === 0}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      moveTo(originIndex, originIndex - 1);
                    }}
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    type="button"
                    className={learnRankMoveBtn}
                    aria-label={`Move ${meta.name ?? "country"} down`}
                    disabled={originIndex === order.length - 1}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      moveTo(originIndex, originIndex + 1);
                    }}
                  >
                    <ChevronDownIcon />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {liveDrag && ghostCountryId && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={ghostRef}
              className={cn(learnRankGhost, "scale-[1.03]")}
              style={{
                left: liveDrag.rect.left,
                top: liveDrag.rect.top + (liveDrag.offsetY ?? 0),
                width: liveDrag.rect.width,
              }}
            >
              <RankRowBody
                index={liveDrag.overIndex}
                meta={ghostMeta}
                src={ghostSrc}
                statNode={null}
              />
            </div>,
            document.body
          )
        : null}

      {!locked && (
        <button type="button" className={primaryBtn} onClick={submit}>
          Submit ranking
        </button>
      )}
    </div>
  );
}
