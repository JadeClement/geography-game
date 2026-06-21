/**
 * Builds data/countries.json from local GeoJSON + reference data.
 * Preserves enabled/region from the existing manifest when present.
 * Run after updating public/data/countries.geojson:
 *   node scripts/generate-countries.js
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { GEOJSON_ISO_OVERRIDES } from "../lib/constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const geojsonPath = join(root, "public/data/countries.geojson");
const outputPath = join(root, "data/countries.json");
const dr5hnUrl =
  "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json";
const mledozeUrl =
  "https://raw.githubusercontent.com/mledoze/countries/master/countries.json";

const EXCLUDED = new Set(["ATA", "Antarctica"]);

function resolveIso3(rawName, iso3) {
  if (typeof iso3 === "string" && /^[A-Z]{3}$/.test(iso3)) {
    return iso3;
  }
  return GEOJSON_ISO_OVERRIDES[rawName] ?? null;
}

const NAME_ALIASES = {
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

function displayName(rawName) {
  return NAME_ALIASES[rawName] ?? rawName;
}

function loadExistingByIso3() {
  if (!existsSync(outputPath)) return new Map();

  try {
    const existing = JSON.parse(readFileSync(outputPath, "utf8"));
    return new Map((existing.countries ?? []).map((country) => [country.iso3, country]));
  } catch {
    return new Map();
  }
}

function topLanguages(languageMap) {
  if (!languageMap || typeof languageMap !== "object") return [];
  return Object.values(languageMap)
    .filter(Boolean)
    .slice(0, 2);
}

async function main() {
  const geojson = JSON.parse(readFileSync(geojsonPath, "utf8"));
  const existingByIso3 = loadExistingByIso3();

  const [dr5hnResponse, mledozeResponse] = await Promise.all([
    fetch(dr5hnUrl),
    fetch(mledozeUrl),
  ]);

  if (!dr5hnResponse.ok) {
    throw new Error(`Failed to fetch dr5hn countries (${dr5hnResponse.status})`);
  }
  if (!mledozeResponse.ok) {
    throw new Error(`Failed to fetch mledoze countries (${mledozeResponse.status})`);
  }

  const dr5hnData = await dr5hnResponse.json();
  const mledozeData = await mledozeResponse.json();

  const dr5hnByIso3 = new Map(dr5hnData.map((row) => [row.iso3, row]));
  const mledozeByIso3 = new Map(mledozeData.map((row) => [row.cca3, row]));

  const countries = geojson.features
    .map((feature) => {
      const rawName = feature.properties?.name ?? "Unknown";
      const iso3 = resolveIso3(
        rawName,
        feature.properties?.["ISO3166-1-Alpha-3"] ??
          feature.properties?.iso_a3 ??
          feature.properties?.ISO_A3
      );

      if (!iso3 || EXCLUDED.has(iso3) || EXCLUDED.has(rawName)) {
        return null;
      }

      const existing = existingByIso3.get(iso3);
      const dr5hn = dr5hnByIso3.get(iso3);
      const mledoze = mledozeByIso3.get(iso3);
      const population =
        typeof dr5hn?.population === "number" && dr5hn.population > 0
          ? dr5hn.population
          : null;
      const languages = topLanguages(mledoze?.languages);
      const neighbors = Array.isArray(mledoze?.borders)
        ? mledoze.borders.filter((borderIso3) => borderIso3 && borderIso3 !== iso3)
        : existing?.neighbors ?? [];

      return {
        iso3,
        name: existing?.name ?? displayName(rawName),
        capital: dr5hn?.capital ?? existing?.capital ?? "",
        population,
        languages,
        neighbors,
        enabled: existing?.enabled ?? true,
        region: existing?.region ?? "world",
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const missingCapitals = countries.filter((c) => !c.capital);
  if (missingCapitals.length > 0) {
    console.warn(
      `Warning: ${missingCapitals.length} countries missing capitals:`,
      missingCapitals.map((c) => c.iso3).join(", ")
    );
  }

  const missingPopulation = countries.filter((c) => c.enabled && c.population == null);
  if (missingPopulation.length > 0) {
    console.warn(
      `Warning: ${missingPopulation.length} enabled countries missing population`
    );
  }

  const output = {
    version: 2,
    description:
      "Editable country list for the geography game. Set enabled: false to remove a country from play.",
    countries,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote ${countries.length} countries to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
