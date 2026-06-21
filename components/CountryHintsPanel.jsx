"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdjacentCountryNames } from "@/lib/adjacentCountries";

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export default function CountryHintsPanel({ country, allCountries, open, onToggle }) {
  const [revealedCount, setRevealedCount] = useState(0);

  const countriesById = useMemo(
    () => new Map(allCountries.map((entry) => [entry.id, entry])),
    [allCountries],
  );

  const adjacentNames = useMemo(
    () => getAdjacentCountryNames(country, countriesById),
    [country, countriesById],
  );

  useEffect(() => {
    setRevealedCount(0);
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
      className={`map-side-panel country-hints-panel ${open ? "map-side-panel--open" : ""}`}
      role="complementary"
      aria-label="Country hints"
    >
      <div className="map-side-panel-header">
        <div className="map-side-panel-heading">
          <h2 className="map-side-panel-title">Hints</h2>
        </div>
        <button
          type="button"
          className="map-side-panel-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="country-hints-panel-body"
          aria-label={open ? "Collapse hints panel" : "Expand hints panel"}
        >
          <span className="map-side-panel-chevron" aria-hidden="true" />
        </button>
      </div>

      <div id="country-hints-panel-body" className="map-side-panel-body">
        <section className="country-hint">
          <div className="country-hint-header">
            <h3 className="country-hint-title">Adjacent countries</h3>
            {hasNeighbors && !allRevealed && (
              <kbd className="map-side-panel-shortcut" aria-hidden="true">
                Space
              </kbd>
            )}
          </div>

          {!hasNeighbors ? (
            <p className="country-hint-empty">No land neighbors for this country.</p>
          ) : (
            <>
              <ul className="country-hint-list">
                {adjacentNames.map((name, index) => {
                  const revealed = index < revealedCount;
                  return (
                    <li
                      key={name}
                      className={`country-hint-item ${revealed ? "country-hint-item--revealed" : ""}`}
                    >
                      {revealed ? name : "???"}
                    </li>
                  );
                })}
              </ul>
              <p className="country-hint-note">
                {allRevealed
                  ? `${adjacentNames.length} ${adjacentNames.length === 1 ? "neighbor" : "neighbors"} revealed.`
                  : "Press Space to reveal the next neighbor."}
              </p>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}
