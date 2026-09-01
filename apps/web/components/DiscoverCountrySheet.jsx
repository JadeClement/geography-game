"use client";

import { formatCapitalReference, getQuizCapital } from "@/lib/capitals";
import { getDidYouKnowFact } from "@/lib/countryFacts";
import { useMobileViewport } from "@/lib/hooks/useMobileViewport";
import { formatGdp, formatPopulation } from "@/lib/referencePanel";
import {
  discoverCountrySheet,
  discoverCountrySheetBody,
  discoverCountrySheetEmpty,
  discoverCountrySheetFact,
  discoverCountrySheetFactLabel,
  discoverCountrySheetFactText,
  discoverCountrySheetHeader,
  discoverCountrySheetLabel,
  discoverCountrySheetMeta,
  discoverCountrySheetRoot,
  discoverCountrySheetRow,
  discoverCountrySheetTitle,
  discoverCountrySheetValue,
  mapInfoMobileSheetClose,
} from "@/lib/ui";

export default function DiscoverCountrySheet({ country, open, onClose }) {
  const isMobile = useMobileViewport();

  if (!isMobile || !open || !country) return null;

  const capital = getQuizCapital(country) ? formatCapitalReference(country) : null;
  const population = formatPopulation(country.population);
  const gdp = formatGdp(country.gdp);
  const didYouKnow = getDidYouKnowFact(country.facts);

  return (
    <div className={discoverCountrySheetRoot}>
      <div
        className={discoverCountrySheet}
        role="dialog"
        aria-modal="false"
        aria-label={`${country.name} details`}
      >
        <div className={discoverCountrySheetHeader}>
          <h2 className={discoverCountrySheetTitle}>{country.name}</h2>
          <button
            type="button"
            className={mapInfoMobileSheetClose}
            onClick={onClose}
            aria-label="Close country details"
          >
            ×
          </button>
        </div>

        <div className={discoverCountrySheetBody}>
          <dl className={discoverCountrySheetMeta}>
            {capital && (
              <div className={discoverCountrySheetRow}>
                <dt className={discoverCountrySheetLabel}>Capital</dt>
                <dd className={discoverCountrySheetValue}>{capital}</dd>
              </div>
            )}
            {population && (
              <div className={discoverCountrySheetRow}>
                <dt className={discoverCountrySheetLabel}>Population</dt>
                <dd className={discoverCountrySheetValue}>{population}</dd>
              </div>
            )}
            {gdp && (
              <div className={discoverCountrySheetRow}>
                <dt className={discoverCountrySheetLabel}>GDP</dt>
                <dd className={discoverCountrySheetValue}>{gdp}</dd>
              </div>
            )}
          </dl>

          {didYouKnow ? (
            <section className={discoverCountrySheetFact}>
              <h3 className={discoverCountrySheetFactLabel}>Did you know?</h3>
              <p className={discoverCountrySheetFactText}>{didYouKnow}</p>
            </section>
          ) : (
            <p className={discoverCountrySheetEmpty}>No fun fact available yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
