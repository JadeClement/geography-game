"use client";

import { useRef } from "react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import {
  modalActions,
  modalCard,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
} from "@/lib/ui";

export default function IdlePromptModal({ open, onContinue }) {
  const dialogRef = useFocusTrap(open);

  if (!open) return null;

  return (
    <div className={modalOverlay}>
      <div
        ref={dialogRef}
        className={modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="idle-prompt-title"
      >
        <h2 id="idle-prompt-title" className={modalTitle}>
          Are you still there?
        </h2>
        <p className={modalSubtitle}>Your timer is paused.</p>
        <div className={modalActions}>
          <button type="button" className={primaryBtn} onClick={onContinue}>
            I&apos;m still here
          </button>
        </div>
      </div>
    </div>
  );
}
