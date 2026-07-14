"use client";

import CountryLearnMorePanel from "@/components/CountryLearnMorePanel";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
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
  mapSidePanels,
} from "@/lib/ui";

export default function MapCountryInfoPanels({
  country,
  allCountries,
  mode,
  level,
  revealMode,
  isDiscover = false,
  open,
  onToggle,
  onClose,
}) {
  const isMobile = useMobileViewport();
  const sheetDialogRef = useFocusTrap(isMobile && open);

  if (!isMobile) {
    return (
      <div className={mapSidePanels}>
        <CountryLearnMorePanel
          country={country}
          allCountries={allCountries}
          mode={mode}
          level={level}
          revealMode={revealMode}
          isDiscover={isDiscover}
          open={open}
          onToggle={onToggle}
        />
      </div>
    );
  }

  return (
    <>
      {open && (
        <button
          type="button"
          className={mapInfoMobileBackdrop}
          onClick={onClose}
          aria-label="Close Learn More"
        />
      )}

      <div className={mapInfoMobile}>
        {open && (
          <div
            ref={sheetDialogRef}
            className={mapInfoMobileSheet}
            role="dialog"
            aria-modal="true"
            aria-label="Learn more about this country"
          >
            <div className={mapInfoMobileSheetHeader}>
              <h2 className={mapInfoMobileSheetTitle}>Learn More</h2>
              <button
                type="button"
                className={mapInfoMobileSheetClose}
                onClick={onClose}
                aria-label="Close Learn More"
              >
                ×
              </button>
            </div>
            <div className={mapInfoMobileSheetBody}>
              <CountryLearnMorePanel
                embedded
                country={country}
                allCountries={allCountries}
                mode={mode}
                level={level}
                revealMode={revealMode}
                isDiscover={isDiscover}
                open
                onToggle={onToggle}
              />
            </div>
          </div>
        )}

        <div className={mapInfoMobileTabBar}>
          <button
            type="button"
            className={mapInfoMobileTab({ active: open })}
            aria-expanded={open}
            onClick={onToggle}
          >
            Learn More
          </button>
        </div>
      </div>
    </>
  );
}
