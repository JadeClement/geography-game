"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
 * Unlabeled silhouette the learner drags onto a borderless map.
 * The ghost is the country's on-map pixel size and lifts off the prompt
 * silhouette (same grab point) so placing it is a 1:1 overlay.
 */
export default function ShapeDropQuestion({
  question,
  emit,
  onShapeDropReady,
  onDropPoint,
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
  }, [question?.id]);

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
      onDropPoint?.({
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
        responseTimeMs: Date.now() - startedAtRef.current,
        revealUsed: revealUsedRef.current,
      });
    },
    [dropped, onDropPoint]
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
        <div
          className="pointer-events-none fixed z-[80] drop-shadow-lg"
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.width,
            height: ghost.height,
          }}
        >
          <CountrySilhouette
            feature={shapeMeta.feature}
            countryId={question?.countryId}
            fit="aspect"
            padding={0}
            preserveAspectRatio="none"
            tone="idle"
            className="h-full w-full"
            label=""
          />
        </div>
      )}
    </div>
  );
}
