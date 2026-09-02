/**
 * Learn mode question generator.
 *
 * ── Audit notes / contract ────────────────────────────────────────────────────
 * - One generator per question type (Step 2b). Each takes
 *   (country, allCountries, masteryStats) and returns a fully-specified question
 *   object (shape below) or `null` when it can't be built for this country
 *   (e.g. a landlocked check for an island, or a shape question for a speck).
 *   The sequencer treats null as "try a different type" and never drops the country.
 * - Country records are read from data/countries.json shape (iso3/name/capital/
 *   population/gdp/area/landlocked/languages (most common first)/neighbors[iso3]/region). `id` is
 *   accepted as an alias for `iso3` so runtime map-country objects also work.
 *   Fields that only exist in the manifest (area, landlocked, gdp) simply make the
 *   dependent generators return null if absent.
 * - Question objects carry only IDs + config for the map; geometry/flag URLs are
 *   resolved by the UI from the runtime country by `countryId`. This keeps
 *   generation pure and testable.
 * - Multiple-choice distractors are drawn from the correct answer's region
 *   (plausible regional alternatives), never random global picks.
 *   neighbor_select_all pads a 9-option grid with the nearest same-region
 *   non-borders by land-border hop distance.
 * - Comparative (Tier 3) opponents come from getPopulationPeers/getAreaPeers/getGdpPeers,
 *   which return countries within a "distinguishable but fair" ratio band; the
 *   generator shuffles them so pairings vary. Blocked pairs are skipped.
 * - clueEligible is true only for Tier 1 / Tier 2 (Tier 3/4 are already
 *   simplified formats with no clue ladder).
 *
 * Question object shape:
 * {
 *   id, type, tier, countryId, prompt, promptSubtext, answerType,
 *   correctAnswer, options, comparisonCountryId, mapConfig, clueEligible,
 *   emaMultiplierKey
 * }
 * answerType ∈ 'map_click' | 'text_entry' | 'multiple_choice' | 'multi_select'
 *              | 'yes_no' | 'binary_choice' | 'multi_text_entry' | 'shape_drop'
 *              | 'drag_to_rank'
 * emaMultiplierKey is the question tier; resolve to a number at answer time via
 * resolveLearnEmaMultiplier(tier, outcome, { fast }).
 */

import { QUESTION_TIERS, QUESTION_TYPES } from "./questionTypes.js";
import { applyContinueNote } from "./continueNotes.js";
import {
  getAreaPeers,
  getGdpPeers,
  getPopulationPeers,
  isBlockedPair,
  metricRatio,
} from "../comparison-clusters.js";
const MAX_CHOICE_OPTIONS = 4; // 1 correct + up to 3 distractors
// Full neighbor set, padded to a 3×3 grid with nearby non-borders.
const SELECT_ALL_MIN_CORRECT = 2;
const SELECT_ALL_OPTION_COUNT = 9;
const SELECT_ALL_MIN_DISTRACTORS = 1;
const CLUE_ELIGIBLE_TIERS = new Set([QUESTION_TIERS.TIER_1, QUESTION_TIERS.TIER_2]);
// Specks and city-states don't make a readable isolated silhouette.
const MIN_SHAPE_AREA_KM2 = 1000;
const RANK_SIZE = 5;
const RANK_MIN = 4;

// ── low-level helpers ──────────────────────────────────────────────────────────

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `q_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function cid(country) {
  return country?.id ?? country?.iso3 ?? null;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// allCountries may be an array, a Map, or a plain object keyed by id. Index once
// per distinct reference so repeated generator calls stay cheap.
const indexCache = new WeakMap();

function toCountryIndex(allCountries) {
  if (!allCountries) return new Map();
  if (allCountries instanceof Map) return allCountries;
  if (typeof allCountries === "object" && indexCache.has(allCountries)) {
    return indexCache.get(allCountries);
  }

  const map = new Map();
  const records = Array.isArray(allCountries)
    ? allCountries
    : Object.values(allCountries);
  for (const record of records) {
    const id = cid(record);
    if (id) map.set(id, record);
  }
  indexCache.set(allCountries, map);
  return map;
}

/** Public helper: normalize allCountries (array | Map | object) into a Map by id. */
export function indexCountries(allCountries) {
  return toCountryIndex(allCountries);
}

function sameRegionPool(country, index, { exclude = [] } = {}) {
  const region = country.region;
  const excludeSet = new Set([cid(country), ...exclude]);
  const pool = [];
  for (const record of index.values()) {
    const id = cid(record);
    if (excludeSet.has(id)) continue;
    if (record.region !== region) continue;
    if (record.enabled === false) continue;
    pool.push(record);
  }
  return pool;
}

function otherRegionPool(country, index) {
  const region = country.region;
  const pool = [];
  for (const record of index.values()) {
    if (cid(record) === cid(country)) continue;
    if (record.enabled === false) continue;
    if (record.region !== region) pool.push(record);
  }
  return pool;
}

/** Land-border hop counts from `originId` (0 at origin, 1 at its neighbors, …). */
function hopDistancesFrom(originId, index) {
  const dist = new Map();
  if (!originId || !index.has(originId)) return dist;
  dist.set(originId, 0);
  const queue = [originId];
  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i];
    const hops = dist.get(current);
    for (const neighborId of index.get(current)?.neighbors ?? []) {
      if (dist.has(neighborId) || !index.has(neighborId)) continue;
      dist.set(neighborId, hops + 1);
      queue.push(neighborId);
    }
  }
  return dist;
}

/**
 * Same-region non-neighbors nearest to `country` by land-border hops. Closer
 * hops are always preferred; the bucket that fills the last slots is shuffled
 * so questions vary. Unreachable (no land path) same-region countries fill last.
 */
function pickNearbyNonNeighbors(country, index, { excludeIds, count }) {
  if (count <= 0) return [];
  const originId = cid(country);
  const region = country.region;
  const exclude = new Set([originId, ...excludeIds]);
  const hops = hopDistancesFrom(originId, index);

  const byHop = new Map();
  const unreachableSame = [];
  for (const record of index.values()) {
    const id = cid(record);
    if (!id || exclude.has(id) || record.enabled === false) continue;
    if (record.region !== region) continue;
    const distance = hops.get(id);
    if (distance == null) {
      unreachableSame.push(record);
      continue;
    }
    if (!byHop.has(distance)) byHop.set(distance, []);
    byHop.get(distance).push(record);
  }

  const picked = [];
  for (const distance of [...byHop.keys()].sort((a, b) => a - b)) {
    if (picked.length >= count) break;
    const bucket = shuffle(byHop.get(distance));
    picked.push(...bucket.slice(0, count - picked.length));
  }
  if (picked.length < count) {
    picked.push(...shuffle(unreachableSame).slice(0, count - picked.length));
  }
  return picked.slice(0, count);
}

function countryOption(record) {
  return { value: cid(record), label: record.name, countryId: cid(record) };
}

function isClueEligible(tier) {
  return CLUE_ELIGIBLE_TIERS.has(tier);
}

function isShapeEligible(country) {
  const area = country?.area;
  if (typeof area === "number" && area < MIN_SHAPE_AREA_KM2) return false;
  return Boolean(cid(country));
}

function baseQuestion(type, country, extra) {
  return {
    id: makeId(),
    type: type.id,
    tier: type.tier,
    countryId: cid(country),
    prompt: "",
    promptSubtext: "",
    answerType: null,
    correctAnswer: null,
    options: null,
    comparisonCountryId: null,
    mapConfig: null,
    clueEligible: isClueEligible(type.tier),
    emaMultiplierKey: type.tier,
    ...extra,
  };
}

// Walks a peer id list (population/area cluster) and returns the first peer
// record that is not a blocked pair, exists, and passes the optional predicate.
function pickComparisonPeer(country, peerIds, index, predicate) {
  const selfId = cid(country);
  for (const peerId of peerIds) {
    if (isBlockedPair(selfId, peerId)) continue;
    const record = index.get(peerId);
    if (!record) continue;
    if (predicate && !predicate(record)) continue;
    return record;
  }
  return null;
}

// ── Tier 1 · free recall ─────────────────────────────────────────────────────

export function generateBlankMapClick(country) {
  return baseQuestion(QUESTION_TYPES.BLANK_MAP_CLICK, country, {
    prompt: `Find ${country.name} on the map.`,
    answerType: "map_click",
    correctAnswer: cid(country),
    mapConfig: { display: "blank", targetId: cid(country) },
  });
}

export function generateBorderlessMapClick(country) {
  return baseQuestion(QUESTION_TYPES.BORDERLESS_MAP_CLICK, country, {
    prompt: `Where is ${country.name}?`,
    promptSubtext: "No borders — click where you think it is.",
    answerType: "map_click",
    correctAnswer: cid(country),
    mapConfig: { display: "borderless", targetId: cid(country), hideBorders: true },
  });
}

export function generateShapeDrop(country) {
  if (!isShapeEligible(country)) return null;
  return baseQuestion(QUESTION_TYPES.SHAPE_DROP, country, {
    prompt: "Place this country on the map.",
    promptSubtext: "Drag the outline to where it belongs.",
    answerType: "shape_drop",
    correctAnswer: cid(country),
    mapConfig: { display: "borderless", targetId: cid(country), hideBorders: true },
  });
}

export function generateFreeNameEntry(country) {
  return baseQuestion(QUESTION_TYPES.FREE_NAME_ENTRY, country, {
    prompt: "What country is highlighted?",
    answerType: "text_entry",
    correctAnswer: country.name,
    mapConfig: {
      display: "highlight",
      highlightIds: [cid(country)],
      // Keep the question card after submit so the typed answer can turn
      // green/red and Submit can become the continue arrow in place.
      keepOverlay: true,
    },
  });
}

export function generateCapitalFreeRecall(country) {
  const capital = country.capital?.trim();
  if (!capital) return null;
  return baseQuestion(QUESTION_TYPES.CAPITAL_FREE_RECALL, country, {
    prompt: `What is the capital of ${country.name}?`,
    answerType: "text_entry",
    correctAnswer: capital,
  });
}

export function generateNeighborFreeRecall(country, allCountries) {
  const index = toCountryIndex(allCountries);
  const neighborNames = (country.neighbors ?? [])
    .map((neighborId) => index.get(neighborId)?.name)
    .filter(Boolean);
  if (neighborNames.length === 0) return null;

  return baseQuestion(QUESTION_TYPES.NEIGHBOR_FREE_RECALL, country, {
    prompt: `Name a country that borders ${country.name}.`,
    answerType: "text_entry",
    // Any one of the neighbors is acceptable.
    correctAnswer: neighborNames,
    // No map — seeing the country would reveal its borders.
  });
}

export function generateNeighborRecallAll(country, allCountries) {
  const index = toCountryIndex(allCountries);
  const neighbors = (country.neighbors ?? [])
    .map((id) => index.get(id))
    .filter(Boolean);
  // With a single neighbor this collapses into neighbor_free_recall, so it is not
  // a meaningfully harder question — require at least two.
  if (neighbors.length < 2) return null;

  return baseQuestion(QUESTION_TYPES.NEIGHBOR_RECALL_ALL, country, {
    prompt: `Name every country that borders ${country.name}.`,
    promptSubtext: `${neighbors.length} bordering countries.`,
    answerType: "multi_text_entry",
    // The full set the learner must recall; the UI accepts them in any order.
    correctAnswer: neighbors.map((record) => cid(record)),
    options: neighbors.map(countryOption),
    // No map — seeing the country would reveal its borders.
  });
}

// ── Tier 2 · recognition with context ─────────────────────────────────────────

export function generateBinaryMapChoice(country, allCountries) {
  const index = toCountryIndex(allCountries);
  const pool = sameRegionPool(country, index);
  if (pool.length === 0) return null;

  const distractor = shuffle(pool)[0];
  const options = shuffle([countryOption(country), countryOption(distractor)]);

  // Recognition question: the target country is highlighted on the map and the
  // player picks which of the two options it is. The prompt must NOT name the
  // country (that would be the answer), and only the target is highlighted so
  // the option labels stay ambiguous until you read the map.
  return baseQuestion(QUESTION_TYPES.BINARY_MAP_CHOICE, country, {
    prompt: "Which country is highlighted on the map?",
    answerType: "binary_choice",
    correctAnswer: cid(country),
    options,
    mapConfig: {
      display: "highlight",
      highlightIds: [cid(country)],
      choiceIds: options.map((option) => option.value),
    },
  });
}

export function generateShapeNameEntry(country) {
  if (!isShapeEligible(country)) return null;
  return baseQuestion(QUESTION_TYPES.SHAPE_NAME_ENTRY, country, {
    prompt: "What country is this shape?",
    answerType: "text_entry",
    correctAnswer: country.name,
    // Don't highlight the country — neighbors / relative size would give the
    // shape away. The region map still sits behind the card, lightly blurred.
  });
}

export function generateShapeIdentification(country, allCountries) {
  if (!isShapeEligible(country)) return null;

  const index = toCountryIndex(allCountries);
  const pool = shuffle(
    sameRegionPool(country, index).filter(isShapeEligible)
  ).slice(0, MAX_CHOICE_OPTIONS - 1);
  if (pool.length === 0) return null;

  const options = shuffle([
    countryOption(country),
    ...pool.map(countryOption),
  ]);

  return baseQuestion(QUESTION_TYPES.SHAPE_IDENTIFICATION, country, {
    prompt: `Which shape is ${country.name}?`,
    promptSubtext: "Pick the matching outline.",
    answerType: "multiple_choice",
    correctAnswer: cid(country),
    options,
  });
}

export function generateFlagIdentification(country, allCountries) {
  const index = toCountryIndex(allCountries);
  const pool = shuffle(sameRegionPool(country, index)).slice(0, MAX_CHOICE_OPTIONS - 1);
  if (pool.length === 0) return null;

  const options = shuffle([
    countryOption(country),
    ...pool.map(countryOption),
  ]);

  return baseQuestion(QUESTION_TYPES.FLAG_IDENTIFICATION, country, {
    prompt: `Which flag belongs to ${country.name}?`,
    promptSubtext: "Pick the matching flag.",
    answerType: "multiple_choice",
    correctAnswer: cid(country),
    // options carry countryId so the UI can render each as a flag.
    options,
  });
}

export function generateCapitalMatching(country, allCountries) {
  const capital = country.capital?.trim();
  if (!capital) return null;

  const index = toCountryIndex(allCountries);
  const pool = shuffle(
    sameRegionPool(country, index).filter((record) => record.capital?.trim())
  ).slice(0, MAX_CHOICE_OPTIONS - 1);
  if (pool.length === 0) return null;

  const options = shuffle([
    { value: capital, label: capital, countryId: cid(country) },
    ...pool.map((record) => ({
      value: record.capital.trim(),
      label: record.capital.trim(),
      countryId: cid(record),
    })),
  ]);

  return baseQuestion(QUESTION_TYPES.CAPITAL_MATCHING, country, {
    prompt: `What is the capital of ${country.name}?`,
    answerType: "multiple_choice",
    correctAnswer: capital,
    options,
  });
}

export function generateNeighborConfirm(country, allCountries) {
  const index = toCountryIndex(allCountries);
  const neighborIds = country.neighbors ?? [];
  if (neighborIds.length === 0) return null; // island — trivial "no"

  // Coin flip: confirm a real neighbor (yes) or deny a same-region non-neighbor (no).
  const askTrue = Math.random() < 0.5;
  const neighborSet = new Set(neighborIds);

  let other = null;
  let answer = null;
  if (askTrue) {
    other = shuffle(neighborIds.map((id) => index.get(id)).filter(Boolean))[0];
    answer = true;
  } else {
    const nonNeighbors = sameRegionPool(country, index).filter(
      (record) => !neighborSet.has(cid(record))
    );
    other = shuffle(nonNeighbors)[0];
    answer = false;
  }
  if (!other) return null;

  return baseQuestion(QUESTION_TYPES.NEIGHBOR_CONFIRM, country, {
    prompt: `Does ${country.name} share a border with ${other.name}?`,
    answerType: "yes_no",
    correctAnswer: answer,
    comparisonCountryId: cid(other),
    // No map — highlighting both countries would make the answer obvious.
  });
}

export function generateNeighborSelectAll(country, allCountries) {
  const index = toCountryIndex(allCountries);
  const neighborIds = country.neighbors ?? [];
  const neighborSet = new Set(neighborIds);
  const neighbors = neighborIds.map((id) => index.get(id)).filter(Boolean);
  // Need at least two real borders so this is meaningfully harder than single-select.
  if (neighbors.length < SELECT_ALL_MIN_CORRECT) return null;

  // Every land neighbor must appear (prompt is "select every bordering country").
  // Pad to a 9-option grid with the nearest same-region non-borders by hop
  // distance; countries with 8+ neighbors still get at least one distractor so
  // "check all" isn't free.
  const correctIds = neighbors.map((record) => cid(record));
  const distractorsNeeded = Math.max(
    SELECT_ALL_MIN_DISTRACTORS,
    SELECT_ALL_OPTION_COUNT - neighbors.length
  );
  const distractors = pickNearbyNonNeighbors(country, index, {
    excludeIds: neighborSet,
    count: distractorsNeeded,
  });
  // At least one distractor so "select all" isn't trivially every option.
  if (distractors.length === 0) return null;

  const options = shuffle([...neighbors, ...distractors].map(countryOption));

  return baseQuestion(QUESTION_TYPES.NEIGHBOR_SELECT_ALL, country, {
    prompt: `Which countries border ${country.name}?`,
    promptSubtext: "Select every bordering country.",
    answerType: "multi_select",
    // Full neighbor set — every correct option must be selected.
    correctAnswer: correctIds,
    options,
    // No map — seeing the country would reveal its borders.
  });
}

// ── Tier 3 · comparative ─────────────────────────────────────────────────────

function generateNumericCompare(type, country, allCountries, { peers, field, prompt }) {
  const index = toCountryIndex(allCountries);
  const value = country[field];
  if (typeof value !== "number") return null;

  // Peers are all within the difficulty ratio band; shuffle so the same country
  // yields varied opponents rather than always the same (first) pairing.
  const opponent = pickComparisonPeer(
    country,
    shuffle(peers),
    index,
    (record) => typeof record[field] === "number" && record[field] !== value
  );
  if (!opponent) return null;

  const winnerId = value > opponent[field] ? cid(country) : cid(opponent);
  const options = shuffle([countryOption(country), countryOption(opponent)]);
  const compareRatio = metricRatio(value, opponent[field]);

  return baseQuestion(type, country, {
    prompt,
    answerType: "binary_choice",
    correctAnswer: winnerId,
    options,
    comparisonCountryId: cid(opponent),
    compareRatio,
  });
}

export function generatePopulationCompare(country, allCountries) {
  return generateNumericCompare(QUESTION_TYPES.POPULATION_COMPARE, country, allCountries, {
    peers: getPopulationPeers(cid(country)),
    field: "population",
    prompt: "Which country has the larger population?",
  });
}

export function generateAreaCompare(country, allCountries) {
  return generateNumericCompare(QUESTION_TYPES.AREA_COMPARE, country, allCountries, {
    peers: getAreaPeers(cid(country)),
    field: "area",
    prompt: "Which country is larger in land area?",
  });
}

export function generateGdpCompare(country, allCountries) {
  return generateNumericCompare(QUESTION_TYPES.GDP_COMPARE, country, allCountries, {
    peers: getGdpPeers(cid(country)),
    field: "gdp",
    prompt: "Which country has the larger GDP?",
  });
}

function pickSpacedRankSet(sortedDesc, subjectId, n) {
  if (!Array.isArray(sortedDesc) || sortedDesc.length < n) return null;
  const subjectIndex = sortedDesc.findIndex((record) => cid(record) === subjectId);
  if (subjectIndex < 0) return null;

  const chosen = new Set();
  const step = n === 1 ? 0 : (sortedDesc.length - 1) / (n - 1);
  for (let i = 0; i < n; i += 1) {
    let idx = Math.round(i * step);
    while (chosen.has(idx) && idx < sortedDesc.length - 1) idx += 1;
    while (chosen.has(idx) && idx > 0) idx -= 1;
    chosen.add(idx);
  }

  if (![...chosen].some((idx) => cid(sortedDesc[idx]) === subjectId)) {
    let replace = null;
    let bestDist = Infinity;
    for (const idx of chosen) {
      const dist = Math.abs(idx - subjectIndex);
      if (dist < bestDist) {
        bestDist = dist;
        replace = idx;
      }
    }
    chosen.delete(replace);
    chosen.add(subjectIndex);
  }

  return [...chosen]
    .sort((a, b) => a - b)
    .map((idx) => sortedDesc[idx])
    .filter(Boolean);
}

function generateNumericRank(type, country, allCountries, { field, prompt }) {
  const index = toCountryIndex(allCountries);
  const value = country[field];
  if (typeof value !== "number" || value <= 0) return null;

  const seen = new Set();
  const pool = [];
  for (const record of [country, ...sameRegionPool(country, index)]) {
    const id = cid(record);
    if (!id || seen.has(id)) continue;
    if (typeof record[field] !== "number" || record[field] <= 0) continue;
    seen.add(id);
    pool.push(record);
  }
  if (pool.length < RANK_MIN) return null;

  const sorted = [...pool].sort((a, b) => {
    const diff = b[field] - a[field];
    if (diff !== 0) return diff;
    return String(cid(a)).localeCompare(String(cid(b)));
  });

  const size = Math.min(RANK_SIZE, sorted.length);
  let set = pickSpacedRankSet(sorted, cid(country), size);
  if (!set || set.length < RANK_MIN) return null;

  // Ties make ranking ambiguous — drop extras with duplicate values.
  const unique = [];
  const usedValues = new Set();
  for (const record of set) {
    if (usedValues.has(record[field])) continue;
    usedValues.add(record[field]);
    unique.push(record);
  }
  if (unique.length < RANK_MIN) return null;
  if (!unique.some((record) => cid(record) === cid(country))) {
    // Subject was a duplicate value and got dropped.
    return null;
  }

  // Blocked pairs inside the set — skip rather than teach a forbidden comparison.
  for (let i = 0; i < unique.length; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      if (isBlockedPair(cid(unique[i]), cid(unique[j]))) return null;
    }
  }

  const ordered = [...unique].sort((a, b) => b[field] - a[field]);
  const correctAnswer = ordered.map((record) => cid(record));
  const options = shuffle(unique.map(countryOption));
  const compareRatio = metricRatio(ordered[0][field], ordered[ordered.length - 1][field]);

  return baseQuestion(type, country, {
    prompt,
    promptSubtext: "Largest at the top. Drag to reorder.",
    answerType: "drag_to_rank",
    correctAnswer,
    options,
    rankField: field,
    compareRatio,
  });
}

export function generatePopulationRank(country, allCountries) {
  return generateNumericRank(QUESTION_TYPES.POPULATION_RANK, country, allCountries, {
    field: "population",
    prompt: "Rank these countries from most to least populous.",
  });
}

export function generateAreaRank(country, allCountries) {
  return generateNumericRank(QUESTION_TYPES.AREA_RANK, country, allCountries, {
    field: "area",
    prompt: "Rank these countries from largest to smallest in land area.",
  });
}

export function generateGdpRank(country, allCountries) {
  return generateNumericRank(QUESTION_TYPES.GDP_RANK, country, allCountries, {
    field: "gdp",
    prompt: "Rank these countries from largest to smallest GDP.",
  });
}

export function generateLandlockedCheck(country) {
  if (typeof country.landlocked !== "boolean") return null;
  // Contested coastline status — skip this yes/no rather than force a label.
  if (cid(country) === "PSE") return null;
  // An island nation (no land neighbors and not landlocked) is a trivial "no".
  const neighborCount = (country.neighbors ?? []).length;
  if (neighborCount === 0 && country.landlocked === false) return null;

  return baseQuestion(QUESTION_TYPES.LANDLOCKED_CHECK, country, {
    prompt: `Is ${country.name} landlocked?`,
    promptSubtext: "No coastline on any ocean or sea.",
    answerType: "yes_no",
    correctAnswer: country.landlocked,
  });
}

/**
 * Special multi-select: which South American countries do NOT border Brazil?
 * Only generates when the subject country is Brazil.
 */
export function generateBrazilNonNeighbors(country, allCountries) {
  if (cid(country) !== "BRA") return null;

  const index = toCountryIndex(allCountries);
  const neighborSet = new Set(country.neighbors ?? []);
  const southAmerica = [...index.values()].filter(
    (record) => record.region === "southAmerica" && cid(record) !== "BRA"
  );
  if (southAmerica.length < 2) return null;

  const nonNeighbors = southAmerica.filter(
    (record) => !neighborSet.has(cid(record))
  );
  if (nonNeighbors.length === 0) return null;

  const options = shuffle(southAmerica.map(countryOption));
  const correctAnswer = nonNeighbors.map((record) => cid(record));

  return baseQuestion(QUESTION_TYPES.BRAZIL_NON_NEIGHBORS, country, {
    prompt: "Which South American countries do NOT border Brazil?",
    promptSubtext: "Select every country that applies.",
    answerType: "multi_select",
    correctAnswer,
    options,
    continueNote:
      "Brazil borders every other mainland South American country except Chile and Ecuador.",
  });
}

export function generateNeighborIdentification(country, allCountries) {
  const index = toCountryIndex(allCountries);
  const neighborIds = country.neighbors ?? [];
  const neighborSet = new Set(neighborIds);

  // Correct answer: a real neighbor that exists in the dataset.
  const neighbor = shuffle(
    neighborIds.map((id) => index.get(id)).filter(Boolean)
  )[0];
  if (!neighbor) return null;

  // Distractors: same-region non-neighbors (plausible), topped up from other
  // regions only if the region can't supply enough options.
  const sameRegionNonNeighbors = sameRegionPool(country, index).filter(
    (record) => !neighborSet.has(cid(record)) && cid(record) !== cid(neighbor)
  );
  let distractors = shuffle(sameRegionNonNeighbors).slice(0, MAX_CHOICE_OPTIONS - 1);
  if (distractors.length < MAX_CHOICE_OPTIONS - 1) {
    const filler = otherRegionPool(country, index).filter(
      (record) => !neighborSet.has(cid(record)) && cid(record) !== cid(neighbor)
    );
    distractors = distractors.concat(
      shuffle(filler).slice(0, MAX_CHOICE_OPTIONS - 1 - distractors.length)
    );
  }
  if (distractors.length === 0) return null;

  const options = shuffle([neighbor, ...distractors].map(countryOption));

  return baseQuestion(QUESTION_TYPES.NEIGHBOR_IDENTIFICATION, country, {
    prompt: `Which country borders ${country.name}?`,
    answerType: "multiple_choice",
    correctAnswer: cid(neighbor),
    options,
  });
}

// ── Tier 4 · association ─────────────────────────────────────────────────────

export function generateLanguageFamily(country, allCountries) {
  const languages = Array.isArray(country.languages) ? country.languages : [];
  if (languages.length === 0) return null;

  // East Timor: several languages are widely used; accept any of the main ones.
  if (cid(country) === "TLS") {
    const eastTimorLanguages = [
      "Tetum",
      "Mambai",
      "Makasae",
      "Indonesian",
      "Portuguese",
    ];
    return baseQuestion(QUESTION_TYPES.LANGUAGE_FAMILY, country, {
      prompt: `Which language is the most commonly spoken in ${country.name}?`,
      promptSubtext: "East Timor's language landscape is complex — any of these counts.",
      answerType: "multiple_choice",
      correctAnswer: eastTimorLanguages,
      options: shuffle(
        eastTimorLanguages.map((language) => ({
          value: language,
          label: language,
        }))
      ),
      continueNote:
        "Tetum (especially Dili Tetum) is the everyday lingua franca and most widely spoken language. Portuguese is co-official; Mambai, Makasae, and Indonesian are also widely used.",
      mapConfig: {
        display: "highlight",
        highlightIds: [cid(country)],
        keepOverlay: true,
      },
    });
  }

  const index = toCountryIndex(allCountries);
  const ownLanguages = new Set(languages);
  const distractorLanguages = [];
  const seen = new Set(ownLanguages);
  for (const record of shuffle(sameRegionPool(country, index))) {
    for (const language of record.languages ?? []) {
      if (!seen.has(language)) {
        seen.add(language);
        distractorLanguages.push(language);
      }
    }
    if (distractorLanguages.length >= MAX_CHOICE_OPTIONS - 1) break;
  }
  if (distractorLanguages.length === 0) return null;

  const correct = languages[0];
  const options = shuffle([
    { value: correct, label: correct },
    ...distractorLanguages
      .slice(0, MAX_CHOICE_OPTIONS - 1)
      .map((language) => ({ value: language, label: language })),
  ]);

  return baseQuestion(QUESTION_TYPES.LANGUAGE_FAMILY, country, {
    prompt: `Which language is the most commonly spoken in ${country.name}?`,
    answerType: "multiple_choice",
    correctAnswer: correct,
    options,
    // Highlight the country in yellow behind the question card.
    mapConfig: {
      display: "highlight",
      highlightIds: [cid(country)],
      keepOverlay: true,
    },
  });
}

// ── dispatch ──────────────────────────────────────────────────────────────────

export const QUESTION_GENERATORS = {
  [QUESTION_TYPES.BLANK_MAP_CLICK.id]: generateBlankMapClick,
  [QUESTION_TYPES.BORDERLESS_MAP_CLICK.id]: generateBorderlessMapClick,
  [QUESTION_TYPES.SHAPE_DROP.id]: generateShapeDrop,
  [QUESTION_TYPES.FREE_NAME_ENTRY.id]: generateFreeNameEntry,
  [QUESTION_TYPES.SHAPE_NAME_ENTRY.id]: generateShapeNameEntry,
  [QUESTION_TYPES.CAPITAL_FREE_RECALL.id]: generateCapitalFreeRecall,
  [QUESTION_TYPES.NEIGHBOR_FREE_RECALL.id]: generateNeighborFreeRecall,
  [QUESTION_TYPES.NEIGHBOR_RECALL_ALL.id]: generateNeighborRecallAll,
  [QUESTION_TYPES.BINARY_MAP_CHOICE.id]: generateBinaryMapChoice,
  [QUESTION_TYPES.SHAPE_IDENTIFICATION.id]: generateShapeIdentification,
  [QUESTION_TYPES.FLAG_IDENTIFICATION.id]: generateFlagIdentification,
  [QUESTION_TYPES.CAPITAL_MATCHING.id]: generateCapitalMatching,
  [QUESTION_TYPES.NEIGHBOR_CONFIRM.id]: generateNeighborConfirm,
  [QUESTION_TYPES.NEIGHBOR_SELECT_ALL.id]: generateNeighborSelectAll,
  [QUESTION_TYPES.POPULATION_COMPARE.id]: generatePopulationCompare,
  [QUESTION_TYPES.AREA_COMPARE.id]: generateAreaCompare,
  [QUESTION_TYPES.GDP_COMPARE.id]: generateGdpCompare,
  [QUESTION_TYPES.POPULATION_RANK.id]: generatePopulationRank,
  [QUESTION_TYPES.AREA_RANK.id]: generateAreaRank,
  [QUESTION_TYPES.GDP_RANK.id]: generateGdpRank,
  [QUESTION_TYPES.LANDLOCKED_CHECK.id]: generateLandlockedCheck,
  [QUESTION_TYPES.NEIGHBOR_IDENTIFICATION.id]: generateNeighborIdentification,
  [QUESTION_TYPES.LANGUAGE_FAMILY.id]: generateLanguageFamily,
  [QUESTION_TYPES.BRAZIL_NON_NEIGHBORS.id]: generateBrazilNonNeighbors,
};

/**
 * Dispatches to the generator for `typeId`. Returns a question object or null.
 * @param {string} typeId - a QUESTION_TYPES id
 */
export function generateQuestion(typeId, country, allCountries, masteryStats) {
  const generator = QUESTION_GENERATORS[typeId];
  if (!generator) return null;
  return applyContinueNote(generator(country, allCountries, masteryStats) ?? null);
}
