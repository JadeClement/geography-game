"use client";

export default function IdlePromptModal({ open, onContinue }) {
  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="idle-prompt-title"
      >
        <h2 id="idle-prompt-title" className="modal-title">
          Are you still there?
        </h2>
        <p className="modal-subtitle">Your timer is paused.</p>
        <div className="modal-actions">
          <button type="button" className="primary-btn" onClick={onContinue}>
            I&apos;m still here
          </button>
        </div>
      </div>
    </div>
  );
}
