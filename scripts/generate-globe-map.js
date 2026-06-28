/**
 * Builds public/globe-map.svg from local country GeoJSON.
 * Run after updating public/data/countries.geojson:
 *   node scripts/generate-globe-map.js
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { GEOJSON_ISO_OVERRIDES } from "../lib/constants.js";
import { getCountryColor } from "../lib/countryColors.js";
import {
  GLOBE_MAP_HEIGHT,
  GLOBE_MAP_WIDTH,
  geometryToPathData,
} from "../lib/globeProjection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const geojsonPath = join(root, "public/data/countries.geojson");
const outputPath = join(root, "public/globe-map.svg");

const EXCLUDED = new Set(["ATA", "Antarctica"]);
const SIMPLIFY_TOLERANCE = 0.25;

function resolveIso3(rawName, iso3) {
  if (typeof iso3 === "string" && /^[A-Z]{3}$/.test(iso3)) {
    return iso3;
  }
  return GEOJSON_ISO_OVERRIDES[rawName] ?? null;
}

const geojson = JSON.parse(readFileSync(geojsonPath, "utf8"));
const paths = [];

for (const feature of geojson.features) {
  const rawName = feature.properties?.name ?? "Unknown";
  const iso3 = resolveIso3(
    rawName,
    feature.properties?.["ISO3166-1-Alpha-3"] ??
      feature.properties?.iso_a3 ??
      feature.properties?.ISO_A3
  );

  if (!iso3 || EXCLUDED.has(iso3) || EXCLUDED.has(rawName)) continue;
  if (!feature.geometry) continue;

  const pathData = geometryToPathData(
    feature.geometry,
    SIMPLIFY_TOLERANCE,
    GLOBE_MAP_WIDTH,
    GLOBE_MAP_HEIGHT
  );

  if (!pathData) continue;

  paths.push(
    `    <path fill-rule="evenodd" fill="${getCountryColor(iso3)}" d="${pathData}" data-iso3="${iso3}" />`
  );
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GLOBE_MAP_WIDTH} ${GLOBE_MAP_HEIGHT}" preserveAspectRatio="none">
  <rect width="${GLOBE_MAP_WIDTH}" height="${GLOBE_MAP_HEIGHT}" fill="#0284c7"/>
  <g stroke="rgba(15, 23, 42, 0.35)" stroke-width="0.35" stroke-linejoin="round">
${paths.join("\n")}
  </g>
</svg>
`;

writeFileSync(outputPath, svg);
console.log(`Wrote ${outputPath} (${paths.length} countries)`);
