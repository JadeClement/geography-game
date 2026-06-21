"use client";

import { useState } from "react";
import FlagPrompt from "@/components/FlagPrompt";
import {
  buildReferenceRows,
  getReferenceVisibility,
  hasHiddenReferenceFields,
} from "@/lib/referencePanel";

export default function CountryReferencePanel({
  country,
  mode,
  level,
  revealMode,
  open,
  onToggle,
}) {
  const visibility = getReferenceVisibility({ mode, level, revealMode });
  const rows = buildReferenceRows(country, visibility);
  const showHiddenNote = hasHiddenReferenceFields(visibility);
  const [isMac] = useState(
    () => typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent),
  );

  const shortcutLabel = isMac ? "Command+I" : "Control+I";

  return (
    <aside
      id="country-reference-panel"
      className={`map-side-panel country-reference-panel ${open ? "map-side-panel--open" : ""}`}
      role="complementary"
      aria-label="Country reference"
    >
      <div className="map-side-panel-header">
        <div className="map-side-panel-heading">
          <h2 className="map-side-panel-title">Reference</h2>
          <kbd className="map-side-panel-shortcut" aria-hidden="true">
            {isMac ? "⌘I" : "Ctrl+I"}
          </kbd>
        </div>
        <button
          type="button"
          className="map-side-panel-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="country-reference-panel-body"
          aria-label={
            open
              ? `Collapse reference panel (${shortcutLabel})`
              : `Expand reference panel (${shortcutLabel})`
          }
        >
          <span className="map-side-panel-chevron" aria-hidden="true" />
        </button>
      </div>

      <div id="country-reference-panel-body" className="map-side-panel-body">
        {rows.length === 0 ? (
          <p className="country-reference-panel-empty">No reference details available.</p>
        ) : (
          <dl className="country-reference-list">
            {rows.map((row) => (
              <div key={row.id} className="country-reference-row">
                <dt>{row.label}</dt>
                <dd>
                  {row.type === "flag" ? (
                    <FlagPrompt iso2={row.value} size="card" className="country-reference-flag" />
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {showHiddenNote && (
          <p className="country-reference-note">Some details hidden while you&apos;re guessing.</p>
        )}
      </div>
    </aside>
  );
}
