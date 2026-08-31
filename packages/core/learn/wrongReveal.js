/**
 * Post-wrong Learn reveal helpers: continue messaging + neighbor map paint.
 */

const NEIGHBOR_QUESTION_TYPES = new Set([
  "neighbor_free_recall",
  "neighbor_recall_all",
  "neighbor_confirm",
  "neighbor_select_all",
  "neighbor_identification",
]);

export function isNeighborLearnQuestion(question) {
  return Boolean(question?.type && NEIGHBOR_QUESTION_TYPES.has(question.type));
}

const SHAPE_QUESTION_TYPES = new Set([
  "shape_identification",
  "shape_name_entry",
]);

export function isShapeLearnQuestion(question) {
  return Boolean(question?.type && SHAPE_QUESTION_TYPES.has(question.type));
}

function formatNameList(names) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function resolveCorrectLabel(question, allCountriesById) {
  const answer = question?.correctAnswer;
  if (typeof answer === "boolean") {
    return answer ? "Yes" : "No";
  }
  if (typeof answer === "string") {
    const byId = allCountriesById?.get(answer);
    return byId?.name ?? answer;
  }
  if (Array.isArray(answer)) {
    const names = answer
      .map((value) => {
        if (typeof value !== "string") return null;
        return allCountriesById?.get(value)?.name ?? value;
      })
      .filter(Boolean);
    return formatNameList(names);
  }
  return null;
}

const UNLABELED_COUNTRY_CHOICE_TYPES = new Set([
  "flag_identification",
  "shape_identification",
]);

/**
 * Neighbor IDs for the question's primary country (iso3), excluding the primary itself.
 */
export function getNeighborIdsForQuestion(question, allCountriesById) {
  const country = allCountriesById?.get(question?.countryId);
  if (!country) return [];
  return (country.neighbors ?? []).filter(
    (id) => id && id !== question.countryId && allCountriesById.has(id)
  );
}

/**
 * Build the continue-screen copy (and whether to paint borders on the map).
 */
export function buildLearnWrongReveal(question, allCountriesById) {
  if (!question) {
    return {
      message: "Not quite.",
      neighborReveal: null,
      areaCompareReveal: null,
      landlockedReveal: null,
    };
  }

  const country = allCountriesById?.get(question.countryId);
  const countryName = country?.name ?? "this country";

  if (isNeighborLearnQuestion(question)) {
    const neighborIds = getNeighborIdsForQuestion(question, allCountriesById);
    const neighborNames = neighborIds
      .map((id) => allCountriesById.get(id)?.name)
      .filter(Boolean);
    const message =
      neighborNames.length === 0
        ? `${countryName} has no land borders.`
        : neighborNames.length === 1
          ? `${countryName} only borders ${neighborNames[0]}.`
          : `${countryName} borders ${formatNameList(neighborNames)}.`;
    return {
      message,
      neighborReveal:
        neighborIds.length > 0
          ? { mainId: question.countryId, neighborIds }
          : null,
      areaCompareReveal: null,
      landlockedReveal: null,
    };
  }

  // Area compare: paint both countries on the map (larger green, smaller red).
  if (question.type === "area_compare") {
    const largerId =
      typeof question.correctAnswer === "string" ? question.correctAnswer : null;
    const optionIds = (question.options ?? [])
      .map((option) => option.countryId ?? option.value)
      .filter(Boolean);
    const smallerId = optionIds.find((id) => id !== largerId) ?? null;
    if (
      largerId &&
      smallerId &&
      allCountriesById?.has(largerId) &&
      allCountriesById?.has(smallerId)
    ) {
      return {
        message: null,
        neighborReveal: null,
        areaCompareReveal: { largerId, smallerId },
        landlockedReveal: null,
      };
    }
    return {
      message: null,
      neighborReveal: null,
      areaCompareReveal: null,
      landlockedReveal: null,
    };
  }

  // Landlocked: show the country on the map so the learner can see its coasts
  // (or lack of them).
  if (question.type === "landlocked_check" && question.countryId) {
    return {
      message: null,
      neighborReveal: null,
      areaCompareReveal: null,
      landlockedReveal: {
        countryId: question.countryId,
        isLandlocked: question.correctAnswer === true,
      },
    };
  }

  // Population compare cards already reveal the stats — no map paint.
  if (question.type === "population_compare") {
    return {
      message: null,
      neighborReveal: null,
      areaCompareReveal: null,
      landlockedReveal: null,
    };
  }

  // "Which country is highlighted" titles the answer on the map — don't also
  // toast "That's Malta." as a floating banner.
  if (question.mapConfig?.display === "highlight") {
    return {
      message: null,
      neighborReveal: null,
      areaCompareReveal: null,
      landlockedReveal: null,
    };
  }

  // Yes/No buttons already paint the correct answer — "That's No." adds nothing.
  if (typeof question.correctAnswer === "boolean") {
    return {
      message: null,
      neighborReveal: null,
      areaCompareReveal: null,
      landlockedReveal: null,
    };
  }

  // Flags/shapes label every option after the pick — don't also toast
  // "That's Kuwait." above Continue.
  if (UNLABELED_COUNTRY_CHOICE_TYPES.has(question.type)) {
    return {
      message: null,
      neighborReveal: null,
      areaCompareReveal: null,
      landlockedReveal: null,
    };
  }

  const correctLabel = resolveCorrectLabel(question, allCountriesById);
  if (correctLabel != null) {
    return {
      message: `That's ${correctLabel}.`,
      neighborReveal: null,
      areaCompareReveal: null,
      landlockedReveal: null,
    };
  }

  return {
    message: "Not quite.",
    neighborReveal: null,
    areaCompareReveal: null,
    landlockedReveal: null,
  };
}
