import { normalizeName } from "./constants";
import { getQuizCapital, isCorrectCapitalAnswer, normalizeCapital } from "./capitals";
import { GAME_MODES } from "./regions";

export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function normalizeAnswerInput(input, mode) {
  const trimmed = input.trim();
  if (!trimmed) return "";

  if (mode === GAME_MODES.CAPITALS) {
    return normalizeCapital(trimmed);
  }

  return normalizeName(trimmed);
}

function getExpectedAnswer(target, mode) {
  if (mode === GAME_MODES.CAPITALS) {
    return normalizeCapital(getQuizCapital(target));
  }

  return normalizeName(target.name);
}

function getDisplayAnswer(target, mode) {
  if (mode === GAME_MODES.CAPITALS) {
    return getQuizCapital(target);
  }

  return target.name;
}

export function getSpellingSuggestion(input, target, mode) {
  if (!input?.trim() || !target) return null;

  if (mode === GAME_MODES.CAPITALS && isCorrectCapitalAnswer(input, target)) {
    return null;
  }

  const normalizedInput = normalizeAnswerInput(input, mode);
  const expected = getExpectedAnswer(target, mode);

  if (!normalizedInput || !expected) return null;
  if (normalizedInput === expected) return null;

  const distance = levenshteinDistance(normalizedInput, expected);
  if (distance < 1 || distance > 2) return null;

  return getDisplayAnswer(target, mode);
}
