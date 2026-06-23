"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdjacentCountryNames } from "@/lib/adjacentCountries";
import { cn } from "@/lib/cn";
import {
  countryFact,
  countryFactBadge,
  countryFactNext,
  countryFactText,
  countryHintCount,
  countryHintEmpty,
  countryHintFacts,
  countryHintHeader,
  countryHintItem,
  countryHintList,
  countryHintNote,
  countryHintTitle,
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

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export default function CountryHintsPanel({ country, allCountries, open, onToggle }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [factIndex, setFactIndex] = useState(0);

  const countriesById = useMemo(
    () => new Map(allCountries.map((entry) => [entry.id, entry])),
    [allCountries],
  );

  const adjacentNames = useMemo(
    () => getAdjacentCountryNames(country, countriesById),
    [country, countriesById],
  );

  const facts = useMemo(
    () => (Array.isArray(country?.facts) ? country.facts : []),
    [country?.facts],
  );
  const hasFacts = facts.length > 0;
  const activeFact = hasFacts ? facts[factIndex % facts.length] : null;

  useEffect(() => {
    setRevealedCount(0);
    setFactIndex(0);
  }, [country?.id]);

  useEffect(() => {
    if (!open || adjacentNames.length === 0) return;

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
  }, [adjacentNames.length, open, revealedCount]);

  const allRevealed = revealedCount >= adjacentNames.length;
  const hasNeighbors = adjacentNames.length > 0;

  return (
    <aside
      id="country-hints-panel"
      className={cn(mapSidePanel({ open }), "country-hints-panel")}
      role="complementary"
      aria-label="Country hints"
    >
      <div className={mapSidePanelHeader({ open })}>
        <div className={mapSidePanelHeading}>
          <h2 className={mapSidePanelTitle}>Hints</h2>
        </div>
        <button
          type="button"
          className={mapSidePanelToggle}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="country-hints-panel-body"
          aria-label={open ? "Collapse hints panel" : "Expand hints panel"}
        >
          <span className={mapSidePanelChevron({ open })} aria-hidden="true" />
        </button>
      </div>

      <div id="country-hints-panel-body" className={mapSidePanelBody({ open })}>
        <section>
          <div className={countryHintHeader}>
            <h3 className={countryHintTitle}>Adjacent countries</h3>
            {hasNeighbors && !allRevealed && (
              <kbd className={cn(mapSidePanelShortcut, "max-md:hidden")} aria-hidden="true">
                Space
              </kbd>
            )}
          </div>

          {!hasNeighbors ? (
            <p className={countryHintEmpty}>No land neighbors for this country.</p>
          ) : (
            <>
              <ul className={countryHintList}>
                {adjacentNames.map((name, index) => {
                  const revealed = index < revealedCount;
                  return (
                    <li key={name} className={countryHintItem({ revealed })}>
                      {revealed ? name : "???"}
                    </li>
                  );
                })}
              </ul>
              <p className={countryHintNote}>
                {allRevealed
                  ? `${adjacentNames.length} ${adjacentNames.length === 1 ? "neighbor" : "neighbors"} revealed.`
                  : "Press Space to reveal the next neighbor."}
              </p>
            </>
          )}
        </section>

        {hasFacts && (
          <section className={countryHintFacts}>
            <div className={countryHintHeader}>
              <h3 className={countryHintTitle}>Facts</h3>
              {facts.length > 1 && (
                <span className={countryHintCount}>
                  {(factIndex % facts.length) + 1} / {facts.length}
                </span>
              )}
            </div>

            <div className={countryFact}>
              <span className={countryFactBadge(activeFact.category)}>
                {FACT_CATEGORY_LABELS[activeFact.category] ?? activeFact.category}
              </span>
              <p className={countryFactText}>{activeFact.text}</p>
            </div>

            {facts.length > 1 && (
              <button
                type="button"
                className={countryFactNext}
                onClick={() => setFactIndex((index) => (index + 1) % facts.length)}
              >
                Next fact →
              </button>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
