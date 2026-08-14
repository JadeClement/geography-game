import {
  MAX_ATTEMPTS,
  CORRECT_ROUND_DELAY_MS,
  REVEAL_ROUND_DELAY_MS,
  IDLE_PROMPT_MS,
  IDLE_RETURN_MS,
  GEOJSON_PATH,
  GEOJSON_ISO_OVERRIDES,
  NAME_ALIASES,
} from "@worldly/constants";

export {
  MAX_ATTEMPTS,
  CORRECT_ROUND_DELAY_MS,
  REVEAL_ROUND_DELAY_MS,
  IDLE_PROMPT_MS,
  IDLE_RETURN_MS,
  GEOJSON_PATH,
  GEOJSON_ISO_OVERRIDES,
  NAME_ALIASES,
};

export function resolveIso3(rawName, iso3) {
  if (typeof iso3 === "string" && /^[A-Z]{3}$/.test(iso3)) {
    return iso3;
  }
  return GEOJSON_ISO_OVERRIDES[rawName] ?? null;
}

export function displayName(rawName) {
  return NAME_ALIASES[rawName] ?? rawName;
}

function stripDiacritics(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export { stripDiacritics };

/** Normalized typed shortcuts after diacritic stripping (e.g. "sao tome" → full name). */
const NORMALIZED_ANSWER_ALIASES = {
  "sao tome": "sao tome and principe",
  serbia: "republic of serbia",
  macedonia: "north macedonia",
};

export function normalizeName(name) {
  let normalized = stripDiacritics(displayName(name).trim().toLowerCase());
  return NORMALIZED_ANSWER_ALIASES[normalized] ?? normalized;
}
