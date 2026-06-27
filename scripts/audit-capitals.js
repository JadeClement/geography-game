/**
 * Reports enabled countries with missing capitals or contested-capital coverage.
 * Run: node scripts/audit-capitals.js
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const countries = JSON.parse(readFileSync(join(root, "data/countries.json"), "utf8"));
const alternates = JSON.parse(readFileSync(join(root, "data/capital-alternates.json"), "utf8"));

const enabled = countries.countries.filter((country) => country.enabled);
const missing = enabled.filter((country) => !country.capital?.trim());

console.log(`Enabled countries: ${enabled.length}`);
console.log(`Missing capital: ${missing.length}`);
if (missing.length > 0) {
  for (const country of missing) {
    console.log(`  - ${country.iso3} ${country.name}`);
  }
}

console.log(`\nContested capitals (${Object.keys(alternates.alternates).length}):`);
for (const [iso3, alts] of Object.entries(alternates.alternates)) {
  const country = enabled.find((entry) => entry.iso3 === iso3);
  if (!country) continue;
  console.log(`  - ${iso3} quiz: ${country.capital} · also: ${alts.join(", ")}`);
}

const enabledIso = new Set(enabled.map((country) => country.iso3));
const orphanAlternates = Object.keys(alternates.alternates).filter((iso3) => !enabledIso.has(iso3));
if (orphanAlternates.length > 0) {
  console.warn("\nAlternate entries for disabled/missing countries:", orphanAlternates.join(", "));
}

if (missing.length > 0) {
  process.exitCode = 1;
}
