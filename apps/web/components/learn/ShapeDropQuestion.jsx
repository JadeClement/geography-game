"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import {
  learnPrompt,
  learnPromptSubtext,
  learnQuestion,
  learnShapePromptSvg,
} from "@/lib/learnUi";
import ClueButton from "./ClueButton";
import CountrySilhouette from "./CountrySilhouette";

/**
 * Viewport-fixed country silhouette. Portaled to `document.body` so
 * `position: fixed` is not trapped by the Learn card's `backdrop-filter`.
 *
 * `excludeRect` punches a hole (viewport coords) so the map's true-country
 * fill can show through when a dropped shape overlaps the correct location.
 */
export function ShapeDropPlacement({
  rect,
  feature,
  countryId,
  tone = "idle",
  className,
  excludeRect = null,
}) {
  if (!rect || typeof document === "undefined") return null;
  const left = rect.left ?? rect.x;
  const top = rect.top ?? rect.y;
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  if (!(rect.width > 0) || !(rect.height > 0)) return null;

  const clipPath = clipPathExcludingOverlap(rect, excludeRect);

  return createPortal(
    <div
      className={cn("pointer-events-none fixed z-[3]", className)}
      style={{
        left,
        top,
        width: rect.width,
        height: rect.height,
        ...(clipPath ? { clipPath } : {}),
      }}
    >
      <CountrySilhouette
        feature={feature}
        countryId={countryId}
        fit="aspect"
        padding={0}
        preserveAspectRatio="none"
        tone={tone}
        className="h-full w-full"
        label=""
      />
    </div>,
    document.body
  );
}

/**
 * Miss line + distance label, portaled above the dropped silhouette.
 * Label is the top layer; the dotted line sits just under it.
 */
export function DistanceRevealOverlay({
  from,
  to,
  label,
  projectClient,
  mapMoveHandlerRef,
  revision = 0,
}) {
  const [pts, setPts] = useState(null);
  const projectRef = useRef(projectClient);
  projectRef.current = projectClient;
  const fromRef = useRef(from);
  const toRef = useRef(to);
  fromRef.current = from;
  toRef.current = to;

  const update = useCallback(() => {
    const start = fromRef.current;
    const end = toRef.current;
    const project = projectRef.current;
    if (!start || !end || typeof project !== "function") {
      setPts(null);
      return;
    }
    const a = project(start.lng, start.lat);
    const b = project(end.lng, end.lat);
    if (
      !a ||
      !b ||
      !Number.isFinite(a.x) ||
      !Number.isFinite(a.y) ||
      !Number.isFinite(b.x) ||
      !Number.isFinite(b.y)
    ) {
      setPts(null);
      return;
    }
    setPts({ a, b });
  }, []);

  useLayoutEffect(() => {
    update();
  }, [update, from, to, revision]);

  useEffect(() => {
    if (!mapMoveHandlerRef) return undefined;
    mapMoveHandlerRef.current = update;
    return () => {
      if (mapMoveHandlerRef.current === update) {
        mapMoveHandlerRef.current = null;
      }
    };
  }, [mapMoveHandlerRef, update]);

  if (typeof document === "undefined" || !pts) return null;

  const { a, b } = pts;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[40]">
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#0f172a"
          strokeWidth="4.5"
          strokeDasharray="8 6"
          strokeLinecap="round"
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke="#f8fafc"
          strokeWidth="2.25"
          strokeDasharray="8 6"
          strokeLinecap="round"
        />
      </svg>
      {label ? (
        <div
          className="absolute z-[1] -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-pill border border-border bg-surface/95 px-2.5 py-1 text-xs font-semibold text-text shadow-lg"
          style={{ left: midX, top: midY }}
        >
          {label}
        </div>
      ) : null}
    </div>,
    document.body
  );
}

function clipPathExcludingOverlap(rect, hole) {
  if (!hole) return null;
  const left = rect.left ?? rect.x;
  const top = rect.top ?? rect.y;
  const width = rect.width;
  const height = rect.height;
  const holeLeft = hole.left ?? hole.x;
  const holeTop = hole.top ?? hole.y;
  if (
    !Number.isFinite(holeLeft) ||
    !Number.isFinite(holeTop) ||
    !(hole.width > 0) ||
    !(hole.height > 0)
  ) {
    return null;
  }
  const x0 = Math.max(left, holeLeft);
  const y0 = Math.max(top, holeTop);
  const x1 = Math.min(left + width, holeLeft + hole.width);
  const y1 = Math.min(top + height, holeTop + hole.height);
  if (!(x1 > x0 && y1 > y0)) return null;
  const lx0 = x0 - left;
  const ly0 = y0 - top;
  const lx1 = x1 - left;
  const ly1 = y1 - top;
  return `polygon(evenodd, 0px 0px, ${width}px 0px, ${width}px ${height}px, 0px ${height}px, 0px 0px, ${lx0}px ${ly0}px, ${lx0}px ${ly1}px, ${lx1}px ${ly1}px, ${lx1}px ${ly0}px, ${lx0}px ${ly0}px)`;
}

/**
 * Unlabeled silhouette the learner drags onto a borderless map.
 * The ghost is the country's on-map pixel size and lifts off the prompt
 * silhouette (same grab point) so placing it is a 1:1 overlay.
 */
export default function ShapeDropQuestion({
  question,
  emit,
  onShapeDropReady,
  onDropPoint,
  onDraggingChange,
  resolveCountry,
  getMapShapeRect,
  mapViewRevision = 0,
  clues = [],
}) {
  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState(null);
  const [dropped, setDropped] = useState(false);
  const [mapSize, setMapSize] = useState(null);
  const startedAtRef = useRef(Date.now());
  const draggingRef = useRef(false);
  const revealUsedRef = useRef(false);
  const sourceRef = useRef(null);
  const grabRef = useRef({ fracX: 0.5, fracY: 0.5 });
  const ghostRef = useRef(null);
  const sizeRef = useRef(null);

  const shapeMeta = resolveCountry?.(question?.countryId) ?? {};

  useEffect(() => {
    onShapeDropReady?.(emit);
  }, [onShapeDropReady, emit]);

  const measureMapSize = useCallback(() => {
    const country = resolveCountry?.(question?.countryId);
    if (!country) return;
    const rect = getMapShapeRect?.(country);
    if (!rect || !(rect.width > 2) || !(rect.height > 2)) return;
    const next = { width: rect.width, height: rect.height };
    sizeRef.current = next;
    setMapSize(next);
  }, [getMapShapeRect, question?.countryId, resolveCountry]);

  useEffect(() => {
    setDragging(false);
    setGhost(null);
    setDropped(false);
    setMapSize(null);
    sizeRef.current = null;
    draggingRef.current = false;
    revealUsedRef.current = false;
    startedAtRef.current = Date.now();
    onDraggingChange?.(false);
  }, [question?.id, onDraggingChange]);

  useEffect(() => {
    measureMapSize();
    const frame = window.requestAnimationFrame(measureMapSize);
    const timers = [80, 200, 500].map((ms) => window.setTimeout(measureMapSize, ms));
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [measureMapSize, mapViewRevision, question?.id]);

  const ghostFromPointer = (clientX, clientY) => {
    const source = sourceRef.current?.getBoundingClientRect();
    const size = sizeRef.current ?? mapSize ?? (
      source
        ? { width: source.width, height: source.height }
        : { width: 96, height: 96 }
    );
    const { fracX, fracY } = grabRef.current;
    return {
      x: clientX - fracX * size.width,
      y: clientY - fracY * size.height,
      width: size.width,
      height: size.height,
    };
  };

  const endDrag = useCallback(
    (clientX, clientY) => {
      if (!draggingRef.current || dropped) return;
      draggingRef.current = false;
      setDragging(false);
      onDraggingChange?.(false);

      const card = document.elementFromPoint(clientX, clientY);
      if (card?.closest("[data-learn-shape-source]")) {
        setGhost(null);
        ghostRef.current = null;
        return;
      }

      const box = ghostRef.current ?? ghostFromPointer(clientX, clientY);
      setGhost(null);
      ghostRef.current = null;
      setDropped(true);
      const dropRect = {
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
      };
      onDropPoint?.({
        clientX: dropRect.left + dropRect.width / 2,
        clientY: dropRect.top + dropRect.height / 2,
        dropRect,
        responseTimeMs: Date.now() - startedAtRef.current,
        revealUsed: revealUsedRef.current,
      });
    },
    [dropped, onDropPoint, onDraggingChange]
  );

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMove = (event) => {
      const next = ghostFromPointer(event.clientX, event.clientY);
      ghostRef.current = next;
      setGhost(next);
    };
    const handleUp = (event) => {
      endDrag(event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [dragging, endDrag]);

  const startDrag = (event) => {
    if (dropped) return;
    event.preventDefault();
    const source = sourceRef.current?.getBoundingClientRect();
    if (source && source.width > 0 && source.height > 0) {
      grabRef.current = {
        fracX: Math.min(1, Math.max(0, (event.clientX - source.left) / source.width)),
        fracY: Math.min(1, Math.max(0, (event.clientY - source.top) / source.height)),
      };
    } else {
      grabRef.current = { fracX: 0.5, fracY: 0.5 };
    }
    draggingRef.current = true;
    setDragging(true);
    onDraggingChange?.(true);
    const next = ghostFromPointer(event.clientX, event.clientY);
    ghostRef.current = next;
    setGhost(next);
  };

  const promptStyle = mapSize
    ? { width: mapSize.width, height: mapSize.height }
    : undefined;

  return (
    <div className={cn(learnQuestion, "select-none")}>
      <p className={learnPrompt}>{question?.prompt}</p>
      {question?.promptSubtext && (
        <p className={learnPromptSubtext}>{question.promptSubtext}</p>
      )}
      <div
        data-learn-shape-source
        className={cn(
          "flex justify-center",
          dragging && "opacity-30",
          dropped && "pointer-events-none opacity-40"
        )}
      >
        <button
          type="button"
          className="inline-flex cursor-grab touch-none border-0 bg-transparent p-5 active:cursor-grabbing"
          onPointerDown={startDrag}
          disabled={dropped}
          aria-label="Drag this country outline onto the map"
        >
          <span ref={sourceRef} className="block">
          <CountrySilhouette
            feature={shapeMeta.feature}
            countryId={question?.countryId}
            fit="aspect"
            padding={0}
            preserveAspectRatio={mapSize ? "none" : "xMidYMid meet"}
            tone="idle"
            className={cn("mx-auto", !mapSize && learnShapePromptSvg)}
            style={promptStyle}
            label="Country outline"
          />
          </span>
        </button>
      </div>
      {!dropped && (
        <ClueButton
          question={question}
          clues={clues}
          onReveal={() => {
            revealUsedRef.current = true;
          }}
        />
      )}
      {dragging && ghost && (
        <ShapeDropPlacement
          rect={ghost}
          feature={shapeMeta.feature}
          countryId={question?.countryId}
          tone="idle"
          className="z-[80] drop-shadow-lg"
        />
      )}
    </div>
  );
}
