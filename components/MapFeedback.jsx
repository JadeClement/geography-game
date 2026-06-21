function FeedbackIcon({ type }) {
  if (type === "correct" || type === "got-it") {
    return (
      <svg className="map-feedback__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
        <path
          d="M8 12.5l2.5 2.5 5.5-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === "wrong") {
    return (
      <svg className="map-feedback__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
        <path
          d="M12 8v5M12 16h.01"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg className="map-feedback__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function MapFeedback({ text, type }) {
  if (!text) return null;

  return (
    <div
      className={`map-feedback map-feedback--${type}`}
      role="status"
      aria-live="polite"
      key={`${type}-${text}`}
    >
      <FeedbackIcon type={type} />
      <span className="map-feedback__text">{text}</span>
    </div>
  );
}
