export const MAX_ATTEMPTS = 2;
/** Pause so "Correct!" is readable before the next prompt appears. */
export const CORRECT_ROUND_DELAY_MS = 750;
/** Slightly longer after recovering from a reveal round. */
export const REVEAL_ROUND_DELAY_MS = 500;
/** Inactivity before pausing the game timer and showing the idle prompt. */
export const IDLE_PROMPT_MS = 2 * 60 * 1000;
/** Time after the idle prompt before returning to the main menu. */
export const IDLE_RETURN_MS = 60 * 60 * 1000;
export const GEOJSON_PATH = "/data/countries.geojson";

/** GeoJSON uses -99 for some countries (e.g. France, Norway, Kosovo). */
export const GEOJSON_ISO_OVERRIDES = {
  France: "FRA",
  Norway: "NOR",
  Kosovo: "XKX",
};

export function resolveIso3(rawName, iso3) {
  if (typeof iso3 === "string" && /^[A-Z]{3}$/.test(iso3)) {
    return iso3;
  }
  return GEOJSON_ISO_OVERRIDES[rawName] ?? null;
}

export const NAME_ALIASES = {
  "United States of America": "United States",
  "Russian Federation": "Russia",
  "Republic of Korea": "South Korea",
  "Korea, Republic of": "South Korea",
  "Dem. Rep. Korea": "North Korea",
  "Democratic People's Republic of Korea": "North Korea",
  "Iran (Islamic Republic of)": "Iran",
  "Lao People's Democratic Republic": "Laos",
  "Syrian Arab Republic": "Syria",
  "Viet Nam": "Vietnam",
  "Czechia": "Czech Republic",
  "Türkiye": "Turkey",
  "Cabo Verde": "Cape Verde",
  "Eswatini": "Swaziland",
  "Brunei Darussalam": "Brunei",
  "Timor-Leste": "East Timor",
  "Micronesia (Federated States of)": "Micronesia",
  "Saint Vincent and the Grenadines": "St. Vincent and the Grenadines",
  "Saint Kitts and Nevis": "St. Kitts and Nevis",
  "Saint Lucia": "St. Lucia",
  "São Tomé and Príncipe": "Sao Tome and Principe",
  "Côte d'Ivoire": "Ivory Coast",
};

export function displayName(rawName) {
  return NAME_ALIASES[rawName] ?? rawName;
}

export function normalizeName(name) {
  return displayName(name).trim().toLowerCase();
}
