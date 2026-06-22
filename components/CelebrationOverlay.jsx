"use client";

import { useEffect, useMemo, useState } from "react";

const VISIBLE_MS = 3000;
const FADE_MS = 500;
const CONFETTI_COUNT = 36;
const CONFETTI_COLORS = [
  "#4ade80",
  "#3b82f6",
  "#facc15",
  "#f472b6",
  "#22d3ee",
  "#c084fc",
  "#fb923c",
];

function buildConfetti() {
  return Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    duration: 2.2 + Math.random() * 1.6,
    drift: Math.round((Math.random() - 0.5) * 120),
    rotate: Math.round(Math.random() * 360),
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    round: Math.random() > 0.6,
  }));
}

/**
 * Full-screen celebratory overlay shown when a player hits a milestone.
 * Auto-dismisses after ~3s (fade out) and is dismissable by clicking.
 * The semi-transparent background keeps the results visible underneath.
 */
export default function CelebrationOverlay({ milestone, onDismiss }) {
  const [leaving, setLeaving] = useState(false);
  const confetti = useMemo(() => buildConfetti(), [milestone?.id]);

  useEffect(() => {
    if (!milestone) return undefined;

    setLeaving(false);
    const hideTimer = setTimeout(() => setLeaving(true), VISIBLE_MS);
    const dismissTimer = setTimeout(() => onDismiss?.(), VISIBLE_MS + FADE_MS);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(dismissTimer);
    };
  }, [milestone, onDismiss]);

  if (!milestone) return null;

  const handleDismiss = () => {
    setLeaving(true);
    setTimeout(() => onDismiss?.(), FADE_MS);
  };

  return (
    <div
      className={`celebration-overlay ${leaving ? "celebration-overlay--leaving" : ""}`}
      role="alertdialog"
      aria-live="assertive"
      aria-label={`${milestone.headline}. ${milestone.subtitle}`}
      onClick={handleDismiss}
    >
      <div className="celebration-confetti" aria-hidden="true">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className={`celebration-confetti-piece ${piece.round ? "celebration-confetti-piece--round" : ""}`}
            style={{
              left: `${piece.left}%`,
              backgroundColor: piece.color,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
              "--confetti-drift": `${piece.drift}px`,
              "--confetti-rotate": `${piece.rotate}deg`,
            }}
          />
        ))}
      </div>

      <div className="celebration-card" role="presentation">
        <span className="celebration-emoji" aria-hidden="true">
          {milestone.emoji}
        </span>
        <p className="celebration-headline">{milestone.headline}</p>
        <p className="celebration-subtitle">{milestone.subtitle}</p>
        <p className="celebration-hint">Tap to dismiss</p>
      </div>
    </div>
  );
}
