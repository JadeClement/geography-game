/**
 * Rank spoken languages per country from Unicode CLDR territoryInfo.
 *
 * CLDR `_populationPercent` includes L2 speakers, so English often ranks
 * artificially high. When any official / de-facto / regional-official language
 * is listed, we rank only those. Display names come from CLDR English locale
 * data, with a few geography-quiz overrides.
 */

export const CLDR_TERRITORY_INFO_URL =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-core/supplemental/territoryInfo.json";

export const CLDR_LANGUAGE_NAMES_URL =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-localenames-full/main/en/languages.json";

const OFFICIAL_STATUSES = new Set([
  "official",
  "de_facto_official",
  "official_regional",
]);

/** Skip regional/dialect codes when the parent language is also listed. */
const DIALECT_OF = {
  gsw: "de", // Swiss German → German
  vls: "nl", // West Flemish → Dutch
  aln: "sq", // Gheg Albanian → Albanian
  pcm: "en", // Nigerian Pidgin — keep only if English absent; still useful otherwise
};

/** ISO3 → ISO2 when mledoze cca2 is missing / wrong. */
export const ISO3_TO_ALPHA2 = {
  XKX: "XK",
};

/**
 * Force the #1 language when CLDR L2 inflation clearly misleads for a quiz.
 * Values are display names (must match CLDR English names or nameOverrides).
 */
export const PRIMARY_LANGUAGE_OVERRIDES = {
  ZAF: "Zulu",
  LUX: "Luxembourgish",
  PHL: "Filipino",
};

/**
 * Territory-specific display-name overrides (CLDR code → label).
 * Keyed by ISO3 so Afghanistan can show "Dari" instead of "Persian".
 */
export const LANGUAGE_NAME_OVERRIDES = {
  AFG: { fa: "Dari" },
};

const MAX_LANGUAGES = 2;

export function languageDisplayName(code, territoryIso3, languageNames) {
  const territoryOverrides = LANGUAGE_NAME_OVERRIDES[territoryIso3];
  if (territoryOverrides?.[code]) return territoryOverrides[code];

  const names = languageNames ?? {};
  if (names[code]) return names[code];

  const base = code.split("_")[0];
  if (names[base]) return names[base];

  return null;
}

/**
 * @param {object} languagePopulation - CLDR territory languagePopulation map
 * @param {string} territoryIso3
 * @param {Record<string, string>} languageNames - CLDR en language display names
 * @returns {string[]} up to 2 language names, most common first
 */
export function rankLanguagesFromCldr(
  languagePopulation,
  territoryIso3,
  languageNames
) {
  if (!languagePopulation || typeof languagePopulation !== "object") {
    return [];
  }

  let entries = Object.entries(languagePopulation).map(([code, info]) => ({
    code,
    percent: Number(info?._populationPercent ?? 0),
    official: info?._officialStatus ?? null,
  }));

  const official = entries.filter((entry) =>
    OFFICIAL_STATUSES.has(entry.official)
  );
  if (official.length > 0) {
    entries = official;
  }

  const presentCodes = new Set(entries.map((entry) => entry.code.split("_")[0]));
  entries = entries.filter((entry) => {
    const parent = DIALECT_OF[entry.code] ?? DIALECT_OF[entry.code.split("_")[0]];
    if (!parent) return true;
    return !presentCodes.has(parent);
  });

  entries.sort((a, b) => b.percent - a.percent || a.code.localeCompare(b.code));

  const ranked = [];
  const seen = new Set();
  for (const entry of entries) {
    const name = languageDisplayName(entry.code, territoryIso3, languageNames);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push(name);
    if (ranked.length >= MAX_LANGUAGES) break;
  }

  const forced = PRIMARY_LANGUAGE_OVERRIDES[territoryIso3];
  if (forced) {
    const withoutForced = ranked.filter(
      (name) => name.toLowerCase() !== forced.toLowerCase()
    );
    return [forced, ...withoutForced].slice(0, MAX_LANGUAGES);
  }

  return ranked;
}

export async function loadCldrLanguageSources() {
  const [territoryResponse, namesResponse] = await Promise.all([
    fetch(CLDR_TERRITORY_INFO_URL),
    fetch(CLDR_LANGUAGE_NAMES_URL),
  ]);

  if (!territoryResponse.ok) {
    throw new Error(
      `Failed to fetch CLDR territoryInfo (${territoryResponse.status})`
    );
  }
  if (!namesResponse.ok) {
    throw new Error(
      `Failed to fetch CLDR language names (${namesResponse.status})`
    );
  }

  const territoryJson = await territoryResponse.json();
  const namesJson = await namesResponse.json();

  return {
    territoryInfo: territoryJson?.supplemental?.territoryInfo ?? {},
    languageNames:
      namesJson?.main?.en?.localeDisplayNames?.languages ?? {},
  };
}

export function resolveAlpha2(iso3, cca2) {
  return ISO3_TO_ALPHA2[iso3] ?? cca2 ?? null;
}
