/**
 * Additively enriches data/countries.json with `area` (km²) and `landlocked`
 * (boolean) fields, sourced from the mledoze/countries dataset (the same source
 * generate-countries.js already uses for languages/neighbors).
 *
 * This is intentionally NON-DESTRUCTIVE: it only ADDS the two new fields and
 * leaves every existing field (name, capital, population, languages, neighbors,
 * region, enabled, facts) exactly as-is. These fields are required by the Learn
 * mode question engine (area/population comparison clusters, landlocked checks).
 *
 * Run once:
 *   node scripts/enrich-country-geodata.js
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const countriesPath = join(root, "data/countries.json");
const mledozeUrl =
  "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";

// mledoze is missing a few partially-recognized states; supply authoritative
// values manually so every enabled country has area + landlocked.
const OVERRIDES = {
  XKX: { area: 10887, landlocked: true }, // Kosovo
};

// Preserve a stable, readable key order (area/landlocked slot in right after
// population; unknown extra keys are appended untouched).
const KEY_ORDER = [
  "iso3",
  "name",
  "capital",
  "population",
  "gdp",
  "area",
  "landlocked",
  "languages",
  "neighbors",
  "enabled",
  "region",
  "facts",
];

function reorderKeys(obj) {
  const ordered = {};
  for (const key of KEY_ORDER) {
    if (key in obj) ordered[key] = obj[key];
  }
  for (const key of Object.keys(obj)) {
    if (!(key in ordered)) ordered[key] = obj[key];
  }
  return ordered;
}

async function main() {
  const manifest = JSON.parse(readFileSync(countriesPath, "utf8"));

  const response = await fetch(mledozeUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch mledoze countries (${response.status})`);
  }
  const mledoze = await response.json();
  const byCca3 = new Map(mledoze.map((row) => [row.cca3, row]));

  let enrichedArea = 0;
  let enrichedLandlocked = 0;
  const missing = [];

  const countries = manifest.countries.map((country) => {
    const override = OVERRIDES[country.iso3];
    const source = byCca3.get(country.iso3);

    const area =
      override?.area ??
      (typeof source?.area === "number" && source.area > 0 ? source.area : null);
    const landlocked =
      override?.landlocked ??
      (typeof source?.landlocked === "boolean" ? source.landlocked : null);

    if (area == null || landlocked == null) {
      if (country.enabled) missing.push(country.iso3);
    }
    if (area != null) enrichedArea += 1;
    if (landlocked != null) enrichedLandlocked += 1;

    return reorderKeys({ ...country, area, landlocked });
  });

  if (missing.length > 0) {
    console.warn(
      `Warning: ${missing.length} enabled countries missing area/landlocked:`,
      missing.join(", ")
    );
  }

  const output = { ...manifest, countries };
  writeFileSync(countriesPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `Enriched ${countries.length} countries (area: ${enrichedArea}, landlocked: ${enrichedLandlocked}).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
