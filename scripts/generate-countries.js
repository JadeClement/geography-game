/**
 * Builds data/countries.json from local GeoJSON + capitals reference data.
 * Run after updating public/data/countries.geojson:
 *   node scripts/generate-countries.js
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { GEOJSON_ISO_OVERRIDES } from "../lib/constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const geojsonPath = join(root, "public/data/countries.geojson");
const outputPath = join(root, "data/countries.json");
const capitalsUrl =
  "https://raw.githubusercontent.com/dr5hn/countries-states-cities-database/master/json/countries.json";

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

async function main() {
  const geojson = JSON.parse(readFileSync(geojsonPath, "utf8"));
  const capitalsResponse = await fetch(capitalsUrl);
  if (!capitalsResponse.ok) {
    throw new Error(`Failed to fetch capitals (${capitalsResponse.status})`);
  }
  const capitalsData = await capitalsResponse.json();
  const capitalsByIso3 = new Map(
    capitalsData.map((row) => [row.iso3, row.capital ?? ""])
  );

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

      return {
        iso3,
        name: displayName(rawName),
        capital: capitalsByIso3.get(iso3) ?? "",
        enabled: true,
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

  const output = {
    version: 1,
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
