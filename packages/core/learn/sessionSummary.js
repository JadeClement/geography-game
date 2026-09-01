/**
 * Step 8 — Learn session summary builder + display labels.
 *
 * Pure helpers that turn a completed Learn session (the per-question answers plus
 * before/after mastery) into the data the results screen renders:
 *  - typeBreakdown: friendly, grouped counts of question types attempted
 *  - masteryDeltas: signed mastery change per country this session
 *  - biggestDropFact: a "did you know" fact for the country that dropped the most
 */

import { selectLearnFact } from "./factSelection.js";

// Display label (singular / plural) per question type id. Several comparative
// types collapse to a single "comparison" label so the breakdown reads naturally
// (e.g. "3 comparisons") as in the spec example.
export const LEARN_TYPE_LABELS = {
  blank_map_click: ["map click", "map clicks"],
  free_name_entry: ["name entry", "name entries"],
  shape_name_entry: ["shape name", "shape names"],
  capital_free_recall: ["capital recall", "capital recalls"],
  neighbor_free_recall: ["neighbor recall", "neighbor recalls"],
  neighbor_recall_all: ["all-borders recall", "all-borders recalls"],
  binary_map_choice: ["map choice", "map choices"],
  shape_identification: ["shape ID", "shape IDs"],
  flag_identification: ["flag ID", "flag IDs"],
  capital_matching: ["capital match", "capital matches"],
  neighbor_confirm: ["border check", "border checks"],
  neighbor_select_all: ["border multi-select", "border multi-selects"],
  neighbor_identification: ["border ID", "border IDs"],
  population_compare: ["comparison", "comparisons"],
  area_compare: ["comparison", "comparisons"],
  gdp_compare: ["comparison", "comparisons"],
  landlocked_check: ["landlocked check", "landlocked checks"],
  language_family: ["language", "languages"],
  brazil_non_neighbors: ["Brazil borders quiz", "Brazil borders quizzes"],
};

function labelFor(typeId, count) {
  const pair = LEARN_TYPE_LABELS[typeId];
  if (!pair) return `${count} ${typeId}`;
  return `${count} ${count === 1 ? pair[0] : pair[1]}`;
}

/**
 * Groups a raw { typeId: count } map into merged display chips, e.g.
 * { text: "3 comparisons" }. Grouped by display label so merged types combine.
 * @returns {Array<{ label: string, count: number, text: string }>}
 */
export function formatTypeBreakdown(typeBreakdown = {}) {
  const byLabel = new Map(); // pluralLabel -> { singular, plural, count }
  for (const [typeId, count] of Object.entries(typeBreakdown)) {
    if (!count) continue;
    const pair = LEARN_TYPE_LABELS[typeId] ?? [typeId, typeId];
    const key = pair[1];
    const existing = byLabel.get(key) ?? { singular: pair[0], plural: pair[1], count: 0 };
    existing.count += count;
    byLabel.set(key, existing);
  }
  return [...byLabel.values()]
    .sort((a, b) => b.count - a.count)
    .map((entry) => ({
      label: entry.plural,
      count: entry.count,
      text: `${entry.count} ${entry.count === 1 ? entry.singular : entry.plural}`,
    }));
}

/**
 * Builds the full session summary object.
 *
 * @param {object} args
 * @param {Array<{ countryId, questionType }>} args.answers - one per answered question
 * @param {Map<string,number>|Record<string,number>} args.masteryBefore - countryId -> mastery (0–1)
 * @param {Map<string,number>|Record<string,number>} args.masteryAfter
 * @param {(id:string) => ({ name, iso2, facts?, capital? })} args.resolveCountry
 * @param {"countries"|"capitals"|"flags"} args.category
 * @param {Record<string, number[]>} [args.seenByCountry] - seen fact indices per country
 */
export function buildLearnSessionSummary({
  answers = [],
  masteryBefore,
  masteryAfter,
  resolveCountry,
  category,
  seenByCountry = {},
}) {
  const getBefore = (id) =>
    masteryBefore instanceof Map ? masteryBefore.get(id) : masteryBefore?.[id];
  const getAfter = (id) =>
    masteryAfter instanceof Map ? masteryAfter.get(id) : masteryAfter?.[id];

  const typeBreakdown = {};
  const countryIds = new Set();
  for (const answer of answers) {
    if (answer?.questionType) {
      typeBreakdown[answer.questionType] = (typeBreakdown[answer.questionType] ?? 0) + 1;
    }
    if (answer?.countryId) countryIds.add(answer.countryId);
  }

  const masteryDeltas = [];
  for (const countryId of countryIds) {
    const before = getBefore(countryId) ?? 0;
    const after = getAfter(countryId) ?? before;
    const delta = after - before;
    if (Math.abs(delta) < 1e-6) continue;
    const country = resolveCountry?.(countryId) ?? {};
    masteryDeltas.push({ countryId, name: country.name ?? countryId, delta });
  }
  masteryDeltas.sort((a, b) => b.delta - a.delta);

  // Fact for the biggest drop (most-negative delta).
  let biggestDropFact = null;
  const worst = masteryDeltas[masteryDeltas.length - 1];
  if (worst && worst.delta < 0) {
    const country = resolveCountry?.(worst.countryId);
    if (country) {
      const selected = selectLearnFact(country, {
        wasCorrect: false,
        category,
        seenIndices: seenByCountry[worst.countryId] ?? [],
      });
      if (selected) {
        biggestDropFact = {
          countryId: worst.countryId,
          country: { name: country.name, iso2: country.iso2 },
          fact: selected.fact,
        };
      }
    }
  }

  return { typeBreakdown, masteryDeltas, biggestDropFact };
}
