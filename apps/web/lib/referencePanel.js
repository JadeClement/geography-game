import { formatCapitalReference, getQuizCapital } from "./capitals";
import { isFindLevel, isNameLevel } from "./levels";
import { GAME_MODES, REGIONS } from "./regions";

export const REFERENCE_FIELD_IDS = {
  COUNTRY: "country",
  CAPITAL: "capital",
  FLAG: "flag",
  REGION: "region",
  POPULATION: "population",
  LANGUAGES: "languages",
};

const FIELD_LABELS = {
  [REFERENCE_FIELD_IDS.COUNTRY]: "Country",
  [REFERENCE_FIELD_IDS.CAPITAL]: "Capital",
  [REFERENCE_FIELD_IDS.FLAG]: "Flag",
  [REFERENCE_FIELD_IDS.REGION]: "Region",
  [REFERENCE_FIELD_IDS.POPULATION]: "Population",
  [REFERENCE_FIELD_IDS.LANGUAGES]: "Languages",
};

function isFieldHidden(fieldId, mode, level) {
  const find = isFindLevel(level);
  const name = isNameLevel(level);

  if (
    fieldId === REFERENCE_FIELD_IDS.REGION ||
    fieldId === REFERENCE_FIELD_IDS.POPULATION ||
    fieldId === REFERENCE_FIELD_IDS.LANGUAGES
  ) {
    return false;
  }

  if (mode === GAME_MODES.COUNTRIES) {
    if (fieldId === REFERENCE_FIELD_IDS.COUNTRY) return find || name;
  }

  if (mode === GAME_MODES.CAPITALS) {
    if (fieldId === REFERENCE_FIELD_IDS.CAPITAL) return find || name;
    if (fieldId === REFERENCE_FIELD_IDS.COUNTRY) return find;
  }

  if (mode === GAME_MODES.FLAGS) {
    if (fieldId === REFERENCE_FIELD_IDS.FLAG) return find || name;
    if (fieldId === REFERENCE_FIELD_IDS.COUNTRY) return find || name;
  }

  return false;
}

export function getReferenceVisibility({ mode, level, revealMode }) {
  if (revealMode) {
    return Object.fromEntries(
      Object.values(REFERENCE_FIELD_IDS).map((fieldId) => [fieldId, "visible"])
    );
  }

  const visibility = {};
  for (const fieldId of Object.values(REFERENCE_FIELD_IDS)) {
    visibility[fieldId] = isFieldHidden(fieldId, mode, level) ? "hidden" : "visible";
  }
  return visibility;
}

export function hasHiddenReferenceFields(visibility) {
  return Object.values(visibility).some((state) => state === "hidden");
}

export function formatPopulation(value) {
  if (value == null || Number.isNaN(value) || value <= 0) return null;

  if (value >= 1_000_000_000) {
    const scaled = value / 1_000_000_000;
    return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (value >= 1_000_000) {
    const scaled = value / 1_000_000;
    return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    const scaled = value / 1_000;
    return `${scaled >= 100 ? Math.round(scaled) : scaled.toFixed(1).replace(/\.0$/, "")}K`;
  }

  return String(Math.round(value));
}

export function formatLanguages(languages) {
  if (!Array.isArray(languages) || languages.length === 0) return null;
  return languages.slice(0, 2).join(", ");
}

function getRegionLabel(regionId) {
  return REGIONS.find((region) => region.id === regionId)?.label ?? null;
}

export function buildReferenceRows(country, visibility) {
  if (!country) return [];

  const rows = [];

  if (visibility[REFERENCE_FIELD_IDS.COUNTRY] === "visible" && country.name) {
    rows.push({
      id: REFERENCE_FIELD_IDS.COUNTRY,
      label: FIELD_LABELS[REFERENCE_FIELD_IDS.COUNTRY],
      type: "text",
      value: country.name,
    });
  }

  if (visibility[REFERENCE_FIELD_IDS.CAPITAL] === "visible" && getQuizCapital(country)) {
    rows.push({
      id: REFERENCE_FIELD_IDS.CAPITAL,
      label: FIELD_LABELS[REFERENCE_FIELD_IDS.CAPITAL],
      type: "text",
      value: formatCapitalReference(country),
    });
  }

  if (visibility[REFERENCE_FIELD_IDS.FLAG] === "visible" && country.iso2) {
    rows.push({
      id: REFERENCE_FIELD_IDS.FLAG,
      label: FIELD_LABELS[REFERENCE_FIELD_IDS.FLAG],
      type: "flag",
      value: country.iso2,
    });
  }

  const regionLabel = getRegionLabel(country.region);
  if (visibility[REFERENCE_FIELD_IDS.REGION] === "visible" && regionLabel) {
    rows.push({
      id: REFERENCE_FIELD_IDS.REGION,
      label: FIELD_LABELS[REFERENCE_FIELD_IDS.REGION],
      type: "text",
      value: regionLabel,
    });
  }

  const population = formatPopulation(country.population);
  if (visibility[REFERENCE_FIELD_IDS.POPULATION] === "visible" && population) {
    rows.push({
      id: REFERENCE_FIELD_IDS.POPULATION,
      label: FIELD_LABELS[REFERENCE_FIELD_IDS.POPULATION],
      type: "text",
      value: population,
    });
  }

  const languages = formatLanguages(country.languages);
  if (visibility[REFERENCE_FIELD_IDS.LANGUAGES] === "visible" && languages) {
    rows.push({
      id: REFERENCE_FIELD_IDS.LANGUAGES,
      label: FIELD_LABELS[REFERENCE_FIELD_IDS.LANGUAGES],
      type: "text",
      value: languages,
    });
  }

  return rows;
}
