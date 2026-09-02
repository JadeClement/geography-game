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
 * The host owns the map; this component reports the pointer-up client
 * coordinates so GeographyGame can unproject and score the drop.
 */
export default function ShapeDropQuestion({
  question,
  emit,
  onShapeDropReady,
  onDropPoint,
  resolveCountry,
  clues = [],
}) {
  const [dragging, setDragging] = useState(false);
  const [ghost, setGhost] = useState(null);
  const [dropped, setDropped] = useState(false);
  const startedAtRef = useRef(Date.now());
  const draggingRef = useRef(false);
  const revealUsedRef = useRef(false);

  const shapeMeta = resolveCountry?.(question?.countryId) ?? {};

  useEffect(() => {
    onShapeDropReady?.(emit);
  }, [onShapeDropReady, emit]);

  useEffect(() => {
    setDragging(false);
    setGhost(null);
    setDropped(false);
    draggingRef.current = false;
    revealUsedRef.current = false;
    startedAtRef.current = Date.now();
  }, [question?.id]);

  const endDrag = useCallback(
    (clientX, clientY) => {
      if (!draggingRef.current || dropped) return;
      draggingRef.current = false;
      setDragging(false);
      setGhost(null);

      const card = document.elementFromPoint(clientX, clientY);
      if (card?.closest("[data-learn-shape-source]")) return;

      setDropped(true);
      onDropPoint?.({
        clientX,
        clientY,
        responseTimeMs: Date.now() - startedAtRef.current,
        revealUsed: revealUsedRef.current,
      });
    },
    [dropped, onDropPoint]
  );

  useEffect(() => {
    if (!dragging) return undefined;
    const handleMove = (event) => {
      setGhost({ x: event.clientX, y: event.clientY });
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
    event.currentTarget.setPointerCapture?.(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    setGhost({ x: event.clientX, y: event.clientY });
  };

  return (
    <div className={learnQuestion}>
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
          className="cursor-grab touch-none border-0 bg-transparent p-0 active:cursor-grabbing"
          onPointerDown={startDrag}
          disabled={dropped}
          aria-label="Drag this country outline onto the map"
        >
          <CountrySilhouette
            feature={shapeMeta.feature}
            countryId={question?.countryId}
            fit="aspect"
            tone="idle"
            className={learnShapePromptSvg}
            label="Country outline"
          />
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
          className="pointer-events-none fixed z-[80] h-24 w-24 -translate-x-1/2 -translate-y-1/2"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <CountrySilhouette
            feature={shapeMeta.feature}
            countryId={question?.countryId}
            fit="aspect"
            tone="idle"
            className="h-full w-full drop-shadow-lg"
            label=""
          />
        </div>
      )}
    </div>
  );
}
