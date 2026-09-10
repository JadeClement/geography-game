const STORAGE_KEY = "worldly:savedLearnSessions";
const VERSION = 1;
export const LEARN_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mapToEntries(value) {
  if (value instanceof Map) return [...value.entries()];
  if (Array.isArray(value)) return value;
  return [];
}

export function learnSessionSlotKey(mode, region) {
  return `${mode}:${region}`;
}

function readStore(storage = getLocalStorage()) {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store, storage = getLocalStorage()) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota or private-mode failures should not interrupt gameplay.
  }
}

export function parseSavedLearnSession(raw, { now = Date.now() } = {}) {
  if (!isPlainObject(raw) || raw.version !== VERSION) return null;
  if (typeof raw.mode !== "string" || typeof raw.region !== "string") return null;
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) return null;
  if (!raw.questions.every((question) => isPlainObject(question) && question.countryId)) {
    return null;
  }

  const index = Number(raw.index);
  if (!Number.isFinite(index) || index < 0) return null;

  const savedAt = Number(raw.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > LEARN_SESSION_MAX_AGE_MS) {
    return null;
  }

  const total = Array.isArray(raw.questions) ? raw.questions.length : 0;
  return {
    version: VERSION,
    savedAt,
    mode: raw.mode,
    region: raw.region,
    level: raw.level ?? null,
    learningSessionSize: raw.learningSessionSize ?? null,
    questions: raw.questions,
    index: Math.min(Math.floor(index), total),
    answers: Array.isArray(raw.answers) ? raw.answers : [],
    rightCount: Math.max(0, Number(raw.rightCount) || 0),
    wrongCount: Math.max(0, Number(raw.wrongCount) || 0),
    elapsedMs: Math.max(0, Number(raw.elapsedMs) || 0),
    challenge: isPlainObject(raw.challenge) ? raw.challenge : null,
    sampled: Array.isArray(raw.sampled) ? raw.sampled : [],
    masteryBefore: Array.isArray(raw.masteryBefore) ? raw.masteryBefore : [],
    masteryAfter: Array.isArray(raw.masteryAfter) ? raw.masteryAfter : [],
    queueIds: Array.isArray(raw.queueIds) ? raw.queueIds : [],
    seenFacts: isPlainObject(raw.seenFacts) ? raw.seenFacts : {},
    totalRounds: total,
  };
}

export function buildSavedLearnSession({
  mode,
  region,
  level,
  learningSessionSize = null,
  questions,
  index = 0,
  answers = [],
  rightCount = 0,
  wrongCount = 0,
  elapsedMs = 0,
  challenge = null,
  sampled = [],
  masteryBefore,
  masteryAfter,
  queueIds = [],
  seenFacts = {},
  savedAt = Date.now(),
} = {}) {
  const clonedQuestions = cloneJson(questions);
  if (!Array.isArray(clonedQuestions) || clonedQuestions.length === 0) return null;

  return parseSavedLearnSession({
    version: VERSION,
    savedAt,
    mode,
    region,
    level,
    learningSessionSize,
    questions: clonedQuestions,
    index,
    answers: cloneJson(answers) ?? [],
    rightCount,
    wrongCount,
    elapsedMs,
    challenge: cloneJson(challenge),
    sampled: cloneJson(sampled) ?? [],
    masteryBefore: cloneJson(mapToEntries(masteryBefore)) ?? [],
    masteryAfter: cloneJson(mapToEntries(masteryAfter)) ?? [],
    queueIds: cloneJson(queueIds) ?? [],
    seenFacts: cloneJson(seenFacts) ?? {},
  });
}

export function formatSavedLearnResumeLabel(snapshot) {
  if (!snapshot) return null;
  const total = snapshot.totalRounds || snapshot.questions?.length || 0;
  if (total <= 0) return null;
  if (snapshot.index >= total) return "See your results";
  return `Resume ${snapshot.index + 1} of ${total}`;
}

export function getSavedLearnSession({
  userId,
  mode,
  region,
  storage = getLocalStorage(),
  now = Date.now(),
} = {}) {
  if (!userId || !mode || !region) return null;
  const store = readStore(storage);
  const userSessions = isPlainObject(store[userId]) ? store[userId] : {};
  const snapshot = parseSavedLearnSession(userSessions[learnSessionSlotKey(mode, region)], {
    now,
  });
  if (!snapshot) return null;
  if (snapshot.mode !== mode || snapshot.region !== region) return null;
  return snapshot;
}

export function saveLearnSession({
  userId,
  snapshot,
  storage = getLocalStorage(),
} = {}) {
  const parsed = parseSavedLearnSession(snapshot);
  if (!userId || !parsed) return false;
  const store = readStore(storage);
  const userSessions = isPlainObject(store[userId]) ? store[userId] : {};
  userSessions[learnSessionSlotKey(parsed.mode, parsed.region)] = parsed;
  store[userId] = userSessions;
  writeStore(store, storage);
  return true;
}

export function clearSavedLearnSession({
  userId,
  mode,
  region,
  storage = getLocalStorage(),
} = {}) {
  if (!userId || !mode || !region) return;
  const store = readStore(storage);
  const userSessions = isPlainObject(store[userId]) ? store[userId] : {};
  delete userSessions[learnSessionSlotKey(mode, region)];
  if (Object.keys(userSessions).length === 0) {
    delete store[userId];
  } else {
    store[userId] = userSessions;
  }
  writeStore(store, storage);
}
