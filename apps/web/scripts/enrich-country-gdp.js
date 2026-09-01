/**
 * Additively enriches data/countries.json with `gdp` (nominal GDP, current US$).
 *
 * Primary source: World Bank NY.GDP.MKTP.CD, most recent non-empty year.
 * Fallback: IMF World Economic Outlook NGDPD (billions of current USD).
 * Manual OVERRIDES cover countries neither dataset publishes.
 *
 * Non-destructive: only adds/updates `gdp`. Required by Learn mode GDP
 * comparison questions. Run with:
 *   node scripts/enrich-country-gdp.js
 */

import { copyFileSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const countriesPath = join(root, "data/countries.json");
const COPY_PATHS = [
  join(root, "../../packages/constants/data/countries.json"),
  join(root, "../../apps/mobile/assets/data/countries.json"),
];

const WORLD_BANK_URL =
  "https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&mrnev=1&per_page=400";
const IMF_GDP_URL = "https://www.imf.org/external/datamapper/api/v1/NGDPD";
const IMF_COUNTRIES_URL =
  "https://www.imf.org/external/datamapper/api/v1/countries";

// IMF NGDPD is in billions of current USD. Skip far-future WEO projections.
const IMF_BILLIONS_TO_USD = 1_000_000_000;
const IMF_MAX_YEAR = new Date().getFullYear();

// World Bank / IMF miss a few states. Values are CIA World Factbook
// official-exchange-rate estimates (current US$), rounded to millions.
const OVERRIDES = {
  TWN: 775_000_000_000, // IMF WEO 2024; used only if the live IMF fetch fails
  PRK: 28_000_000_000, // CIA estimate; figures are sparse and dated
  COK: 360_000_000, // ADB / Stats NZ, ~US$ equivalent
  NIU: 20_000_000, // Statistics Niue / UN, ~US$ equivalent
};

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

function asPositiveNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value);
}

async function fetchJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label} (${response.status})`);
  }
  return response.json();
}

function latestImfValue(series) {
  if (!series || typeof series !== "object") return null;
  const years = Object.keys(series)
    .map(Number)
    .filter((year) => Number.isInteger(year) && year <= IMF_MAX_YEAR)
    .sort((a, b) => b - a);
  for (const year of years) {
    const value = asPositiveNumber(Number(series[year]) * IMF_BILLIONS_TO_USD);
    if (value != null) return value;
  }
  return null;
}

async function loadWorldBankGdp() {
  const payload = await fetchJson(WORLD_BANK_URL, "World Bank GDP");
  const rows = Array.isArray(payload?.[1]) ? payload[1] : [];
  const byIso3 = new Map();
  for (const row of rows) {
    const iso3 = row?.countryiso3code;
    const value = asPositiveNumber(row?.value);
    if (typeof iso3 !== "string" || iso3.length !== 3 || value == null) continue;
    if (!byIso3.has(iso3)) byIso3.set(iso3, value);
  }
  return byIso3;
}

async function loadImfGdp() {
  const [gdpPayload, countryPayload] = await Promise.all([
    fetchJson(IMF_GDP_URL, "IMF NGDPD"),
    fetchJson(IMF_COUNTRIES_URL, "IMF countries"),
  ]);

  const seriesByImfId = gdpPayload?.values?.NGDPD ?? {};
  const imfCountries = countryPayload?.countries ?? {};
  const byIso3 = new Map();

  for (const [imfId, meta] of Object.entries(imfCountries)) {
    const iso3 =
      typeof meta?.iso3 === "string" && meta.iso3.length === 3
        ? meta.iso3
        : imfId.length === 3
          ? imfId
          : null;
    if (!iso3) continue;
    const value = latestImfValue(seriesByImfId[imfId]);
    if (value != null) byIso3.set(iso3, value);
  }

  return byIso3;
}

async function main() {
  const manifest = JSON.parse(readFileSync(countriesPath, "utf8"));

  const [worldBank, imf] = await Promise.all([
    loadWorldBankGdp(),
    loadImfGdp().catch((error) => {
      console.warn(`IMF fallback unavailable: ${error.message}`);
      return new Map();
    }),
  ]);

  let fromWorldBank = 0;
  let fromImf = 0;
  let fromOverride = 0;
  const missing = [];

  const countries = manifest.countries.map((country) => {
    const gdp =
      worldBank.get(country.iso3) ??
      imf.get(country.iso3) ??
      OVERRIDES[country.iso3] ??
      null;

    if (gdp == null) {
      if (country.enabled) missing.push(country.iso3);
    } else if (worldBank.has(country.iso3)) {
      fromWorldBank += 1;
    } else if (imf.has(country.iso3)) {
      fromImf += 1;
    } else {
      fromOverride += 1;
    }

    return reorderKeys({ ...country, gdp });
  });

  if (missing.length > 0) {
    console.warn(
      `Warning: ${missing.length} enabled countries missing gdp:`,
      missing.join(", ")
    );
  }

  const output = { ...manifest, countries };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  writeFileSync(countriesPath, serialized);
  for (const copyPath of COPY_PATHS) {
    copyFileSync(countriesPath, copyPath);
  }

  const withGdp = countries.filter((c) => c.gdp != null).length;
  console.log(
    `Enriched ${countries.length} countries with gdp (${withGdp} values: World Bank ${fromWorldBank}, IMF ${fromImf}, override ${fromOverride}).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
