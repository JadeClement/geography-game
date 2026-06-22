"use client";

import { useState } from "react";
import FlagPrompt from "@/components/FlagPrompt";
import { cn } from "@/lib/cn";
import {
  buildReferenceRows,
  getReferenceVisibility,
  hasHiddenReferenceFields,
} from "@/lib/referencePanel";
import {
  countryFactBadge,
  countryReferenceEmpty,
  countryReferenceFact,
  countryReferenceFacts,
  countryReferenceFactsList,
  countryReferenceFactsTitle,
  countryReferenceFactText,
  countryReferenceFlag,
  countryReferenceLabel,
  countryReferenceList,
  countryReferenceNote,
  countryReferenceRow,
  countryReferenceValue,
  mapSidePanel,
  mapSidePanelBody,
  mapSidePanelChevron,
  mapSidePanelHeader,
  mapSidePanelHeading,
  mapSidePanelShortcut,
  mapSidePanelTitle,
  mapSidePanelToggle,
} from "@/lib/ui";

const FACT_CATEGORY_LABELS = {
  history: "History",
  politics: "Politics",
  society: "Society",
  geography: "Geography",
};

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
  const facts = Array.isArray(country?.facts) ? country.facts : [];
  const [isMac] = useState(
    () => typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent),
  );

  const shortcutLabel = isMac ? "Command+I" : "Control+I";

  return (
    <aside
      id="country-reference-panel"
      className={cn(mapSidePanel({ open }), "country-reference-panel")}
      role="complementary"
      aria-label="Country reference"
    >
      <div className={mapSidePanelHeader({ open })}>
        <div className={mapSidePanelHeading}>
          <h2 className={mapSidePanelTitle}>Reference</h2>
          <kbd className={mapSidePanelShortcut} aria-hidden="true">
            {isMac ? "⌘I" : "Ctrl+I"}
          </kbd>
        </div>
        <button
          type="button"
          className={mapSidePanelToggle}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="country-reference-panel-body"
          aria-label={
            open
              ? `Collapse reference panel (${shortcutLabel})`
              : `Expand reference panel (${shortcutLabel})`
          }
        >
          <span className={mapSidePanelChevron({ open })} aria-hidden="true" />
        </button>
      </div>

      <div id="country-reference-panel-body" className={mapSidePanelBody({ open })}>
        {rows.length === 0 ? (
          <p className={countryReferenceEmpty}>No reference details available.</p>
        ) : (
          <dl className={countryReferenceList}>
            {rows.map((row) => (
              <div key={row.id} className={countryReferenceRow}>
                <dt className={countryReferenceLabel}>{row.label}</dt>
                <dd className={countryReferenceValue}>
                  {row.type === "flag" ? (
                    <FlagPrompt iso2={row.value} size="card" className={countryReferenceFlag} />
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {showHiddenNote && (
          <p className={countryReferenceNote}>Some details hidden while you&apos;re guessing.</p>
        )}

        {facts.length > 0 && (
          <section className={countryReferenceFacts}>
            <h3 className={countryReferenceFactsTitle}>Did you know?</h3>
            <ul className={countryReferenceFactsList}>
              {facts.map((fact, index) => (
                <li key={`${fact.category}-${index}`} className={countryReferenceFact}>
                  <span className={countryFactBadge(fact.category)}>
                    {FACT_CATEGORY_LABELS[fact.category] ?? fact.category}
                  </span>
                  <span className={countryReferenceFactText}>{fact.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
