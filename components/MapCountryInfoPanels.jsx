"use client";

import CountryHintsPanel from "@/components/CountryHintsPanel";
import CountryReferencePanel from "@/components/CountryReferencePanel";
import { useMobileViewport } from "@/lib/hooks/useMobileViewport";
import {
  mapInfoMobile,
  mapInfoMobileBackdrop,
  mapInfoMobileSheet,
  mapInfoMobileSheetBody,
  mapInfoMobileSheetClose,
  mapInfoMobileSheetHeader,
  mapInfoMobileSheetTitle,
  mapInfoMobileTab,
  mapInfoMobileTabBar,
  mapInfoMobileTabDivider,
  mapSidePanels,
} from "@/lib/ui";

export default function MapCountryInfoPanels({
  country,
  allCountries,
  mode,
  level,
  revealMode,
  referenceOpen,
  hintsOpen,
  onReferenceToggle,
  onHintsToggle,
  onCloseAll,
  onOpenReference,
  onOpenHints,
}) {
  const isMobile = useMobileViewport();
  const activeTab = referenceOpen ? "reference" : hintsOpen ? "hints" : null;
  const sheetOpen = activeTab !== null;

  const handleReferenceTab = () => {
    if (referenceOpen) {
      onReferenceToggle();
      return;
    }
    onOpenReference();
  };

  const handleHintsTab = () => {
    if (hintsOpen) {
      onHintsToggle();
      return;
    }
    onOpenHints();
  };

  if (!isMobile) {
    return (
      <div className={mapSidePanels}>
        <CountryReferencePanel
          country={country}
          mode={mode}
          level={level}
          revealMode={revealMode}
          open={referenceOpen}
          onToggle={onReferenceToggle}
        />
        <CountryHintsPanel
          country={country}
          allCountries={allCountries}
          open={hintsOpen}
          onToggle={onHintsToggle}
        />
      </div>
    );
  }

  return (
    <>
      {sheetOpen && (
        <button
          type="button"
          className={mapInfoMobileBackdrop}
          onClick={onCloseAll}
          aria-label="Close panel"
        />
      )}

      <div className={mapInfoMobile}>
        {sheetOpen && (
          <div
            className={mapInfoMobileSheet}
            role="dialog"
            aria-modal="true"
            aria-label={activeTab === "reference" ? "Country reference" : "Country hints"}
          >
            <div className={mapInfoMobileSheetHeader}>
              <h2 className={mapInfoMobileSheetTitle}>
                {activeTab === "reference" ? "Reference" : "Hints"}
              </h2>
              <button
                type="button"
                className={mapInfoMobileSheetClose}
                onClick={onCloseAll}
                aria-label="Close panel"
              >
                ×
              </button>
            </div>
            <div className={mapInfoMobileSheetBody}>
              {activeTab === "reference" ? (
                <CountryReferencePanel
                  embedded
                  country={country}
                  mode={mode}
                  level={level}
                  revealMode={revealMode}
                  open
                  onToggle={onReferenceToggle}
                />
              ) : (
                <CountryHintsPanel
                  embedded
                  country={country}
                  allCountries={allCountries}
                  open
                  onToggle={onHintsToggle}
                />
              )}
            </div>
          </div>
        )}

        <div className={mapInfoMobileTabBar} role="tablist" aria-label="Country info">
          <button
            type="button"
            role="tab"
            className={mapInfoMobileTab({ active: referenceOpen })}
            aria-selected={referenceOpen}
            onClick={handleReferenceTab}
          >
            Reference
          </button>
          <div className={mapInfoMobileTabDivider} aria-hidden="true" />
          <button
            type="button"
            role="tab"
            className={mapInfoMobileTab({ active: hintsOpen })}
            aria-selected={hintsOpen}
            onClick={handleHintsTab}
          >
            Hints
          </button>
        </div>
      </div>
    </>
  );
}
