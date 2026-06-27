export const FACT_CATEGORY_LABELS = {
  history: "History",
  politics: "Politics",
  society: "Society",
  geography: "Geography",
  highlight: "Did you know?",
};

export function partitionCountryFacts(facts) {
  const standardFacts = [];
  const highlights = [];

  for (const fact of facts ?? []) {
    if (!fact?.text) continue;
    if (fact.category === "highlight") {
      highlights.push(fact);
    } else {
      standardFacts.push(fact);
    }
  }

  return { standardFacts, highlights };
}

/** Hints carousel: show standout facts first, then the standard profile facts. */
export function getHintsFacts(facts) {
  const { standardFacts, highlights } = partitionCountryFacts(facts);
  return [...highlights, ...standardFacts];
}
