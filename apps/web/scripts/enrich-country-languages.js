/**
 * Re-ranks `languages` in data/countries.json by how commonly they are spoken,
 * using Unicode CLDR territory language populations (official languages preferred).
 *
 * Non-destructive to other fields. Run with:
 *   node scripts/enrich-country-languages.js
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  loadCldrLanguageSources,
  rankLanguagesFromCldr,
  resolveAlpha2,
} from "./lib/rankedLanguages.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const countriesPath = join(root, "data/countries.json");
const mledozeUrl =
  "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";

const KEY_ORDER = [
  "iso3",
  "name",
  "capital",
  "population",
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
  const [{ territoryInfo, languageNames }, mledozeResponse] = await Promise.all(
    [loadCldrLanguageSources(), fetch(mledozeUrl)]
  );

  if (!mledozeResponse.ok) {
    throw new Error(`Failed to fetch mledoze countries (${mledozeResponse.status})`);
  }
  const mledoze = await mledozeResponse.json();
  const byCca3 = new Map(mledoze.map((row) => [row.cca3, row]));

  let updated = 0;
  let unchanged = 0;
  const missing = [];

  const countries = manifest.countries.map((country) => {
    const source = byCca3.get(country.iso3);
    const alpha2 = resolveAlpha2(country.iso3, source?.cca2);
    const languagePopulation = alpha2
      ? territoryInfo[alpha2]?.languagePopulation
      : null;
    const ranked = rankLanguagesFromCldr(
      languagePopulation,
      country.iso3,
      languageNames
    );

    if (ranked.length === 0) {
      if (country.enabled) missing.push(country.iso3);
      unchanged += 1;
      return reorderKeys(country);
    }

    const prev = Array.isArray(country.languages) ? country.languages : [];
    const same =
      prev.length === ranked.length &&
      prev.every((name, index) => name === ranked[index]);
    if (same) {
      unchanged += 1;
      return reorderKeys(country);
    }

    updated += 1;
    return reorderKeys({ ...country, languages: ranked });
  });

  const output = { ...manifest, countries };
  writeFileSync(countriesPath, `${JSON.stringify(output, null, 2)}\n`);

  console.log(
    `Updated languages for ${updated} countries (${unchanged} unchanged).`
  );
  if (missing.length > 0) {
    console.warn(
      `Warning: no CLDR languages for ${missing.length} enabled countries:`,
      missing.join(", ")
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
