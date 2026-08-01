"use client";

import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import {
  modalActions,
  modalCard,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
} from "@/lib/ui";

export default function DiscoverTerritoryModal({ open, note, onClose }) {
  const dialogRef = useFocusTrap(open);

  if (!open || !note) return null;

  return (
    <div className={modalOverlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-territory-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="discover-territory-title" className={modalTitle}>
          {note.title}
        </h2>
        <p className={modalSubtitle}>{note.message}</p>
        <div className={modalActions}>
          <button type="button" className={primaryBtn} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
