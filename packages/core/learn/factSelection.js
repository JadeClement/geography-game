/**
 * Step 7 — post-answer fact selection.
 *
 * Chooses which country fact to surface after a Learn answer, by this priority:
 *  1. Wrong answer → the fact most relevant to what was just missed:
 *       - capitals mode: a synthetic "The capital of X is Y." fact (the missed info)
 *       - countries mode: a geographic anchor fact (category === 'geography')
 *  2. Correct answer → a fact the user has NOT seen before (by index).
 *  3. Fallback → the first available fact.
 *
 * Returns { index, fact: { category, text }, synthetic } or null when the country
 * has no facts and no synthetic fact applies. `index === null` marks a synthetic
 * fact that must NOT be recorded in facts_seen.
 */

function realFact(facts, index) {
  return { index, fact: facts[index], synthetic: false };
}

export function selectLearnFact(country, { wasCorrect, category, seenIndices = [] } = {}) {
  if (!country) return null;
  const facts = Array.isArray(country.facts) ? country.facts : [];
  const seen = new Set(seenIndices);

  if (!wasCorrect) {
    if (category === "capitals" && country.capital) {
      return {
        index: null,
        synthetic: true,
        fact: {
          category: "capital",
          text: `The capital of ${country.name} is ${country.capital}.`,
        },
      };
    }
    if (category === "countries") {
      const geoIndex = facts.findIndex((fact) => fact?.category === "geography");
      if (geoIndex >= 0) return realFact(facts, geoIndex);
    }
    // flags mode (or no geography fact) falls through to the first fact below.
  } else {
    for (let i = 0; i < facts.length; i += 1) {
      if (!seen.has(i)) return realFact(facts, i);
    }
    // All seen → fall through to first fact as a gentle repeat.
  }

  if (facts.length > 0) return realFact(facts, 0);
  return null;
}
