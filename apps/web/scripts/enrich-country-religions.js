/**
 * Additively enriches data/countries.json with `religions`: major religious
 * groups and their share of the population, largest first.
 *
 *   [{ "name": "Islam", "percent": 92.7 }, { "name": "Christianity", "percent": 4.4 }]
 *
 * Primary source: Pew Research Center 2020 Global Religious Composition
 * estimates, via Our World in Data. Covers places with ≥100k people.
 * Manual OVERRIDES cover microstates Pew does not publish.
 *
 * Non-destructive: only adds/updates `religions`. Required by Learn religion
 * questions. Run with:
 *   npm run enrich-religions
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

const OWID_BASE =
  "https://ourworldindata.org/grapher/religious-composition.csv?indicator=share&religion=";

const PREFERRED_YEAR = 2020;

const RELIGION_SERIES = [
  { slug: "christians", name: "Christianity" },
  { slug: "muslims", name: "Islam" },
  { slug: "hindus", name: "Hinduism" },
  { slug: "buddhists", name: "Buddhism" },
  { slug: "jews", name: "Judaism" },
  { slug: "other_religions", name: "Other" },
];

const ISO_ALIASES = {
  KOS: "XKX",
  OWID_KOS: "XKX",
};

const MIN_PERCENT = 1;
const MAX_ENTRIES = 5;

// Pew skips territories under ~100k people. Shares are CIA World Factbook /
// national census rounded estimates so every enabled country can be quizzed.
const OVERRIDES = {
  VAT: [{ name: "Christianity", percent: 100 }],
  SMR: [{ name: "Christianity", percent: 97 }],
  MCO: [{ name: "Christianity", percent: 90 }],
  AND: [{ name: "Christianity", percent: 90 }],
  LIE: [
    { name: "Christianity", percent: 83 },
    { name: "No religion", percent: 7 },
  ],
  NRU: [{ name: "Christianity", percent: 93 }],
  TUV: [{ name: "Christianity", percent: 97 }],
  PLW: [{ name: "Christianity", percent: 93 }],
  COK: [{ name: "Christianity", percent: 96 }],
  NIU: [{ name: "Christianity", percent: 96 }],
  MHL: [{ name: "Christianity", percent: 97 }],
  KIR: [{ name: "Christianity", percent: 96 }],
  TON: [{ name: "Christianity", percent: 98 }],
  DMA: [{ name: "Christianity", percent: 94 }],
  GRD: [{ name: "Christianity", percent: 96 }],
  KNA: [{ name: "Christianity", percent: 92 }],
  VCT: [{ name: "Christianity", percent: 88 }],
  ATG: [{ name: "Christianity", percent: 92 }],
  FSM: [{ name: "Christianity", percent: 97 }],
  BMU: [{ name: "Christianity", percent: 75 }],
  SYC: [{ name: "Christianity", percent: 89 }],
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
  "religions",
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

function roundPercent(value) {
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10) / 10;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const rows = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const code = parts[1]?.trim();
    const year = Number(parts[2]);
    const percent = Number(parts[3]);
    if (!code || !Number.isInteger(year) || !Number.isFinite(percent)) continue;
    rows.push({ code, year, percent });
  }
  return rows;
}

async function fetchSeries(slug) {
  const response = await fetch(`${OWID_BASE}${encodeURIComponent(slug)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Pew/OWID ${slug} (${response.status})`);
  }
  return parseCsv(await response.text());
}

function pickLatestByIso3(rows) {
  const byIso3 = new Map();
  for (const row of rows) {
    const iso3 = ISO_ALIASES[row.code] ?? row.code;
    if (!/^[A-Z]{3}$/.test(iso3)) continue;
    const current = byIso3.get(iso3);
    const prefer =
      !current ||
      (row.year === PREFERRED_YEAR && current.year !== PREFERRED_YEAR) ||
      (row.year !== PREFERRED_YEAR &&
        current.year !== PREFERRED_YEAR &&
        row.year > current.year);
    if (prefer) byIso3.set(iso3, row);
  }
  return byIso3;
}

function buildBreakdown(groups, unaffiliatedPercent) {
  const entries = [...groups];
  const unaffiliated = roundPercent(unaffiliatedPercent);
  if (unaffiliated != null && unaffiliated >= MIN_PERCENT) {
    entries.push({ name: "No religion", percent: unaffiliated });
  }
  entries.sort((a, b) => b.percent - a.percent);
  const kept = entries.filter((entry) => entry.percent >= MIN_PERCENT).slice(0, MAX_ENTRIES);
  if (kept.length > 0) return kept;
  return entries.slice(0, 1);
}

async function main() {
  const manifest = JSON.parse(readFileSync(countriesPath, "utf8"));

  const [anyRows, ...groupRows] = await Promise.all([
    fetchSeries("any_religion"),
    ...RELIGION_SERIES.map((series) => fetchSeries(series.slug)),
  ]);

  const anyByIso3 = pickLatestByIso3(anyRows);
  const groupByIso3 = RELIGION_SERIES.map((series, index) => ({
    name: series.name,
    byIso3: pickLatestByIso3(groupRows[index]),
  }));

  let fromPew = 0;
  let fromOverride = 0;
  const missing = [];

  const countries = manifest.countries.map((country) => {
    const groups = [];
    for (const series of groupByIso3) {
      const row = series.byIso3.get(country.iso3);
      const percent = roundPercent(row?.percent);
      if (percent != null && percent > 0) {
        groups.push({ name: series.name, percent });
      }
    }

    const anyRow = anyByIso3.get(country.iso3);
    const religions =
      groups.length > 0 || anyRow
        ? buildBreakdown(groups, anyRow ? 100 - anyRow.percent : null)
        : OVERRIDES[country.iso3] ?? [];

    if (religions.length === 0) {
      if (country.enabled) missing.push(`${country.iso3} (${country.name})`);
    } else if (groups.length > 0 || anyRow) {
      fromPew += 1;
    } else {
      fromOverride += 1;
    }

    return reorderKeys({ ...country, religions });
  });

  if (missing.length > 0) {
    console.warn(
      `Warning: ${missing.length} enabled countries missing religions:`,
      missing.join(", ")
    );
  }

  const output = { ...manifest, countries };
  const serialized = `${JSON.stringify(output, null, 2)}\n`;
  writeFileSync(countriesPath, serialized);
  for (const copyPath of COPY_PATHS) {
    copyFileSync(countriesPath, copyPath);
  }

  const withReligions = countries.filter((c) => c.religions?.length > 0).length;
  console.log(
    `Enriched ${countries.length} countries with religions (${withReligions} values: Pew/OWID ${fromPew}, override ${fromOverride}).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
