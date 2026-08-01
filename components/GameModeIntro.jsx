"use client";

import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import {
  gameTutorialBackdrop,
  gameTutorialCard,
  gameTutorialCardBody,
  gameTutorialCardTitle,
  gameTutorialNavBtn,
  gameTutorialNavBtnPrimary,
  gameTutorialOverlay,
} from "@/lib/ui";
import { cn } from "@/lib/cn";

export default function GameModeIntro({ open, title, paragraphs, onClose }) {
  const dialogRef = useFocusTrap(open);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className={gameTutorialOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-mode-intro-title"
    >
      <div className={gameTutorialBackdrop} aria-hidden="true" />
      <div className={gameTutorialCard}>
        <h2 id="game-mode-intro-title" className={gameTutorialCardTitle}>
          {title}
        </h2>
        {(paragraphs ?? []).map((text, index) => (
          <p
            key={index}
            className={cn(
              gameTutorialCardBody,
              index === (paragraphs?.length ?? 0) - 1 && "mb-5"
            )}
          >
            {text}
          </p>
        ))}
        <div className="flex justify-end">
          <button
            type="button"
            className={cn(gameTutorialNavBtn, gameTutorialNavBtnPrimary)}
            onClick={onClose}
          >
            Let&apos;s go
          </button>
        </div>
      </div>
    </div>
  );
}
