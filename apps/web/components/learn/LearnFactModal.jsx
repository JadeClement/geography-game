"use client";

import { useEffect, useRef, useState } from "react";
import { getFlagUrl } from "@/lib/flags";
import {
  learnFactBackdrop,
  learnFactBody,
  learnFactCategory,
  learnFactFlag,
  learnFactHandle,
  learnFactHeader,
  learnFactName,
  learnFactSheet,
} from "@/lib/learnUi";

const AUTO_DISMISS_MS = 4000;
const EXIT_ANIM_MS = 260;
const SWIPE_DISMISS_PX = 60;

/**
 * Mobile-only post-answer fact bottom sheet (Step 7). Slides up over ~65% of the
 * screen so the top of the map stays visible. Dismisses on tap, swipe-down, or a
 * 4s timeout that starts only AFTER the slide-up animation completes.
 *
 * This component renders nothing on desktop (its container is `md:hidden`) and
 * must not be rendered after the final question — the host goes straight to the
 * results screen instead.
 *
 * Props:
 * - country: { name, iso2 } (the answered country)
 * - fact: { category, text }
 * - onDismiss: () => void  (called once, after the exit animation)
 */
export default function LearnFactModal({ country, fact, onDismiss }) {
  const [open, setOpen] = useState(false);
  const dismissedRef = useRef(false);
  const autoTimerRef = useRef(null);
  const exitTimerRef = useRef(null);
  const touchStartYRef = useRef(null);

  useEffect(() => {
    // Trigger the slide-up on the next frame so the transition runs.
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => {
      cancelAnimationFrame(raf);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  const dismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    setOpen(false); // slide back down
    exitTimerRef.current = setTimeout(() => onDismiss?.(), EXIT_ANIM_MS);
  };

  // Start the auto-dismiss countdown only once the slide-up finishes.
  const handleTransitionEnd = (event) => {
    if (event.propertyName !== "transform" || !open || dismissedRef.current) return;
    autoTimerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
  };

  const handleTouchStart = (event) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };
  const handleTouchMove = (event) => {
    if (touchStartYRef.current == null) return;
    const deltaY = (event.touches[0]?.clientY ?? 0) - touchStartYRef.current;
    if (deltaY > SWIPE_DISMISS_PX) {
      touchStartYRef.current = null;
      dismiss();
    }
  };

  if (!country || !fact) return null;

  const flagSrc = getFlagUrl(country.iso2, 160);

  return (
    <div
      className={learnFactBackdrop}
      role="dialog"
      aria-label={`Fact about ${country.name}`}
      onClick={dismiss}
    >
      <div
        className={learnFactSheet}
        data-open={open ? "true" : "false"}
        onClick={dismiss}
        onTransitionEnd={handleTransitionEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        <div className={learnFactHandle} aria-hidden="true" />
        <div className={learnFactHeader}>
          {flagSrc && (
            <img src={flagSrc} alt="" className={learnFactFlag} draggable={false} />
          )}
          <h2 className={learnFactName}>{country.name}</h2>
        </div>
        <p className={learnFactBody}>{fact.text}</p>
        {fact.category && <span className={learnFactCategory}>{fact.category}</span>}
      </div>
    </div>
  );
}
