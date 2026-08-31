/**
 * Curated post-answer teaching notes for Learn questions.
 * Attached as `continueNote` and shown above Continue on correct and incorrect.
 */

const NEIGHBOR_QUESTION_TYPES = new Set([
  "neighbor_free_recall",
  "neighbor_recall_all",
  "neighbor_confirm",
  "neighbor_select_all",
  "neighbor_identification",
]);

const CAPITAL_QUESTION_TYPES = new Set([
  "capital_free_recall",
  "capital_matching",
]);

const CASPIAN_LANDLOCKED_NOTE =
  "It does border the Caspian Sea, but that body of water is actually classified as a lake.";

const ENCLAVE_NOTE =
  "This is an enclave — a country completely surrounded by another country (here, Italy).";

const SOUTH_AFRICA_CAPITALS_NOTE =
  "South Africa has three capitals: Pretoria (executive), Cape Town (legislative), and Bloemfontein (judicial). This game uses Pretoria.";

const CHINA_NEIGHBORS_NOTE =
  "China has more land neighbors than any other country.";

/**
 * @param {{ type?: string, countryId?: string, continueNote?: string } | null} question
 * @returns {string | null}
 */
export function resolveContinueNote(question) {
  if (!question) return null;
  if (typeof question.continueNote === "string" && question.continueNote.trim()) {
    return question.continueNote.trim();
  }

  const countryId = question.countryId;
  const type = question.type;

  if (
    type === "landlocked_check" &&
    (countryId === "KAZ" || countryId === "AZE" || countryId === "TKM")
  ) {
    return CASPIAN_LANDLOCKED_NOTE;
  }

  if (CAPITAL_QUESTION_TYPES.has(type) && countryId === "ZAF") {
    return SOUTH_AFRICA_CAPITALS_NOTE;
  }

  if (
    type === "landlocked_check" &&
    (countryId === "VAT" || countryId === "SMR")
  ) {
    return ENCLAVE_NOTE;
  }

  if (NEIGHBOR_QUESTION_TYPES.has(type) && countryId === "CHN") {
    return CHINA_NEIGHBORS_NOTE;
  }

  return null;
}

/**
 * Mutates/returns the question with continueNote filled when applicable.
 */
export function applyContinueNote(question) {
  if (!question) return null;
  const note = resolveContinueNote(question);
  if (note) {
    return { ...question, continueNote: note };
  }
  return question;
}
