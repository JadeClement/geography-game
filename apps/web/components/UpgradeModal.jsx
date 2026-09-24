"use client";

import { useState } from "react";
import { startCheckout } from "@/lib/billingClient";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import {
  modalActions,
  modalCard,
  modalClose,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
  secondaryBtn,
} from "@/lib/ui";
import { cn } from "@/lib/cn";

export default function UpgradeModal({ open, onClose, cap = null }) {
  const dialogRef = useFocusTrap(open);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const handleUpgrade = async () => {
    setError(null);
    setLoading(true);
    try {
      await startCheckout();
    } catch (checkoutError) {
      setError(checkoutError.message);
      setLoading(false);
    }
  };

  return (
    <div className={modalOverlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={cn(modalCard, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
      >
        <button type="button" className={modalClose} onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="upgrade-modal-title" className={modalTitle}>
          You&apos;ve used today&apos;s free Learn sessions
        </h2>
        <p className={modalSubtitle}>
          {cap ? `Free accounts get ${cap} Learn sessions a day. ` : ""}
          Get unlimited Learn sessions with Learn+, or come back tomorrow. Test,
          Discover, and Go! are always free.
        </p>
        {error && <p className="m-0 mb-3 text-sm text-error">{error}</p>}
        <div className={modalActions}>
          <button
            type="button"
            className={primaryBtn}
            disabled={loading}
            onClick={handleUpgrade}
          >
            {loading ? "Opening checkout…" : "Upgrade to Learn+"}
          </button>
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
