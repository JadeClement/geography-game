"use client";

import { useEffect, useMemo, useState } from "react";
import FlagPrompt from "@/components/FlagPrompt";
import { getAdjacentCountryNames } from "@/lib/adjacentCountries";
import { cn } from "@/lib/cn";
import { FACT_CATEGORY_LABELS, partitionCountryFacts } from "@/lib/countryFacts";
import {
  buildReferenceRows,
  getReferenceVisibility,
  hasHiddenReferenceFields,
} from "@/lib/referencePanel";
import {
  countryFactBadge,
  countryFactNext,
  countryHintEmpty,
  countryHintHeader,
  countryHintItem,
  countryHintList,
  countryHintNote,
  countryHintTitle,
  countryReferenceEmpty,
  countryReferenceFact,
  countryReferenceFacts,
  countryReferenceFactsList,
  countryReferenceFactsTitle,
  countryReferenceFactText,
  countryReferenceFlag,
  countryReferenceHighlight,
  countryReferenceHighlights,
  countryReferenceLabel,
  countryReferenceList,
  countryReferenceNote,
  countryReferenceRow,
  countryReferenceValue,
  hintInfo,
  hintInfoIcon,
  hintInfoRow,
  hintInfoTooltip,
  learnMoreReference,
  learnMoreTab,
  learnMoreTabPanel,
  learnMoreTabs,
  mapSidePanel,
  mapSidePanelBody,
  mapSidePanelChevron,
  mapSidePanelHeader,
  mapSidePanelHeading,
  mapSidePanelShortcut,
  mapSidePanelTitle,
  mapSidePanelToggle,
} from "@/lib/ui";

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export default function CountryLearnMorePanel({
  country,
  allCountries,
  mode,
  level,
  revealMode,
  isDiscover = false,
  open,
  onToggle,
  embedded = false,
}) {
  const [activeTab, setActiveTab] = useState("hints");
  const [revealedCount, setRevealedCount] = useState(0);
  const [isMac] = useState(
    () => typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent),
  );

  const visibility = getReferenceVisibility({ mode, level, revealMode });
  const rows = buildReferenceRows(country, visibility);
  const showHiddenNote = hasHiddenReferenceFields(visibility);
  const { standardFacts, highlights } = partitionCountryFacts(country?.facts);

  const countriesById = useMemo(
    () => new Map(allCountries.map((entry) => [entry.id, entry])),
    [allCountries],
  );

  const adjacentNames = useMemo(
    () => getAdjacentCountryNames(country, countriesById),
    [country, countriesById],
  );

  const hasNeighbors = adjacentNames.length > 0;
  // Discover mode has no scoring/mastery, so reveal every neighbor up front.
  const revealedTotal = isDiscover ? adjacentNames.length : revealedCount;
  const allRevealed = revealedTotal >= adjacentNames.length;

  useEffect(() => {
    setRevealedCount(0);
  }, [country?.id]);

  useEffect(() => {
    if (isDiscover || !open || activeTab !== "hints" || adjacentNames.length === 0) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key !== " " && event.code !== "Space") return;
      if (isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (revealedCount >= adjacentNames.length) return;

      event.preventDefault();
      setRevealedCount((count) => Math.min(count + 1, adjacentNames.length));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, adjacentNames.length, isDiscover, open, revealedCount]);

  const shortcutLabel = isMac ? "Command+I" : "Control+I";

  const referenceSection =
    rows.length === 0 ? (
      <p className={countryReferenceEmpty}>No reference details available.</p>
    ) : (
      <>
        <dl className={cn(countryReferenceList, learnMoreReference)}>
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
        {showHiddenNote && (
          <p className={countryReferenceNote}>Some details hidden while you&apos;re guessing.</p>
        )}
      </>
    );

  const hintsPanel = !hasNeighbors ? (
    <p className={countryHintEmpty}>No land neighbors for this country.</p>
  ) : (
    <>
      <ul className={countryHintList}>
        {adjacentNames.map((name, index) => {
          const revealed = index < revealedTotal;
          return (
            <li key={name} className={countryHintItem({ revealed })}>
              {revealed ? name : "???"}
            </li>
          );
        })}
      </ul>
      {!isDiscover && (
        <>
          <p className={countryHintNote}>
            {allRevealed
              ? `${adjacentNames.length} ${adjacentNames.length === 1 ? "neighbor" : "neighbors"} revealed.`
              : embedded
                ? "Tap below to reveal the next neighbor."
                : "Press Space to reveal the next neighbor."}
          </p>
          {!allRevealed && (
            <button
              type="button"
              className={countryFactNext}
              onClick={() =>
                setRevealedCount((count) => Math.min(count + 1, adjacentNames.length))
              }
            >
              Reveal next →
            </button>
          )}
        </>
      )}
    </>
  );

  const hasFacts = highlights.length > 0 || standardFacts.length > 0;
  const factsPanel = !hasFacts ? (
    <p className={countryHintEmpty}>No facts available for this country.</p>
  ) : (
    <>
      {highlights.length > 0 && (
        <section className={countryReferenceHighlights}>
          <h3 className={countryReferenceFactsTitle}>Did you know?</h3>
          <ul className={countryReferenceFactsList}>
            {highlights.map((fact, index) => (
              <li key={`highlight-${index}`}>
                <p className={countryReferenceHighlight}>{fact.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {standardFacts.length > 0 && (
        <section className={countryReferenceFacts}>
          <ul className={countryReferenceFactsList}>
            {standardFacts.map((fact, index) => (
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
    </>
  );

  const bodyContent = (
    <>
      {referenceSection}

      <div className={learnMoreTabs} role="tablist" aria-label="More about this country">
        <button
          type="button"
          role="tab"
          className={learnMoreTab({ active: activeTab === "hints" })}
          aria-selected={activeTab === "hints"}
          onClick={() => setActiveTab("hints")}
        >
          Hints
        </button>
        <button
          type="button"
          role="tab"
          className={learnMoreTab({ active: activeTab === "facts" })}
          aria-selected={activeTab === "facts"}
          onClick={() => setActiveTab("facts")}
        >
          Facts
        </button>
      </div>

      <div className={learnMoreTabPanel} role="tabpanel">
        {activeTab === "hints" ? (
          <section>
            <div className={countryHintHeader}>
              <div className={hintInfoRow}>
                <h3 className={countryHintTitle}>Adjacent countries</h3>
                {!isDiscover && (
                  <span className={hintInfo}>
                    <button
                      type="button"
                      className={hintInfoIcon}
                      aria-label="About revealing hints"
                    >
                      i
                    </button>
                    <span role="tooltip" className={hintInfoTooltip}>
                      Revealing hints will be taken into account when calculating your
                      mastery — only reveal if you need help.
                    </span>
                  </span>
                )}
              </div>
              {hasNeighbors && !allRevealed && !embedded && (
                <kbd className={cn(mapSidePanelShortcut, "max-md:hidden")} aria-hidden="true">
                  Space
                </kbd>
              )}
            </div>
            {hintsPanel}
          </section>
        ) : (
          <section>{factsPanel}</section>
        )}
      </div>
    </>
  );

  if (embedded) {
    return bodyContent;
  }

  return (
    <aside
      id="country-learn-more-panel"
      className={cn(mapSidePanel({ open }), "country-learn-more-panel")}
      role="complementary"
      aria-label="Learn more about this country"
    >
      <div className={mapSidePanelHeader({ open })}>
        <div className={mapSidePanelHeading}>
          <h2 className={mapSidePanelTitle}>Learn More</h2>
          <kbd className={cn(mapSidePanelShortcut, "max-md:hidden")} aria-hidden="true">
            {isMac ? "⌘I" : "Ctrl+I"}
          </kbd>
        </div>
        <button
          type="button"
          className={mapSidePanelToggle}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="country-learn-more-panel-body"
          aria-label={
            open
              ? `Collapse Learn More panel (${shortcutLabel})`
              : `Expand Learn More panel (${shortcutLabel})`
          }
        >
          <span className={mapSidePanelChevron({ open })} aria-hidden="true" />
        </button>
      </div>

      <div id="country-learn-more-panel-body" className={mapSidePanelBody({ open })}>
        {bodyContent}
      </div>
    </aside>
  );
}
