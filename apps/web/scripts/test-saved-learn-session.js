import test from "node:test";
import assert from "node:assert/strict";

import {
  LEARN_SESSION_MAX_AGE_MS,
  buildSavedLearnSession,
  clearSavedLearnSession,
  formatSavedLearnResumeLabel,
  getSavedLearnSession,
  parseSavedLearnSession,
  saveLearnSession,
} from "@/lib/savedLearnSession";

function memoryStorage(initial = {}) {
  const data = new Map(
    Object.entries(initial).map(([key, value]) => [key, String(value)])
  );
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function sampleSnapshot(overrides = {}) {
  return buildSavedLearnSession({
    mode: "countries",
    region: "europe",
    level: "F1",
    questions: [
      { id: "q1", type: "find_country", countryId: "FRA", prompt: "Find France" },
      { id: "q2", type: "find_country", countryId: "DEU", prompt: "Find Germany" },
    ],
    index: 1,
    answers: [{ countryId: "FRA", questionType: "find_country", relatedCountryIds: [] }],
    rightCount: 1,
    wrongCount: 0,
    elapsedMs: 12_000,
    challenge: { workingTier: 3, momentum: 1, recentOutcomes: [] },
    sampled: [
      { countryId: "FRA", mastery: 0.2 },
      { countryId: "DEU", mastery: 0.4 },
    ],
    masteryBefore: [
      ["FRA", 0.2],
      ["DEU", 0.4],
    ],
    masteryAfter: [["FRA", 0.35]],
    queueIds: ["FRA", "DEU"],
    seenFacts: { FRA: [0] },
    escalation: { easeCap: 3, streak: 1 },
    ...overrides,
  });
}

test("saved Learn sessions round-trip by user, mode, and region", () => {
  const storage = memoryStorage();
  const europe = sampleSnapshot();
  const africa = sampleSnapshot({ region: "africa", index: 0, answers: [] });

  assert.equal(saveLearnSession({ userId: "user-a", snapshot: europe, storage }), true);
  assert.equal(saveLearnSession({ userId: "user-a", snapshot: africa, storage }), true);
  assert.equal(
    saveLearnSession({
      userId: "user-b",
      snapshot: sampleSnapshot({ index: 0, answers: [] }),
      storage,
    }),
    true
  );

  const restored = getSavedLearnSession({
    userId: "user-a",
    mode: "countries",
    region: "europe",
    storage,
  });
  assert.equal(restored.index, 1);
  assert.equal(restored.questions[0].countryId, "FRA");
  assert.deepEqual(restored.masteryAfter, [["FRA", 0.35]]);
  assert.deepEqual(restored.escalation, { easeCap: 3, streak: 1 });
  assert.equal(
    getSavedLearnSession({
      userId: "user-a",
      mode: "countries",
      region: "africa",
      storage,
    }).index,
    0
  );
  assert.equal(
    getSavedLearnSession({
      userId: "user-b",
      mode: "countries",
      region: "europe",
      storage,
    }).index,
    0
  );

  clearSavedLearnSession({
    userId: "user-a",
    mode: "countries",
    region: "europe",
    storage,
  });
  assert.equal(
    getSavedLearnSession({
      userId: "user-a",
      mode: "countries",
      region: "europe",
      storage,
    }),
    null
  );
  assert.ok(
    getSavedLearnSession({
      userId: "user-a",
      mode: "countries",
      region: "africa",
      storage,
    })
  );
});

test("expired or invalid Learn snapshots are ignored", () => {
  const stale = parseSavedLearnSession(
    sampleSnapshot({ savedAt: Date.now() - LEARN_SESSION_MAX_AGE_MS - 1000 })
  );
  assert.equal(stale, null);

  assert.equal(parseSavedLearnSession({ version: 1, mode: "countries" }), null);
  assert.equal(
    parseSavedLearnSession({
      version: 1,
      mode: "countries",
      region: "europe",
      questions: [{ prompt: "missing country" }],
      index: 0,
      savedAt: Date.now(),
    }),
    null
  );
});

test("saved Learn snapshots default missing escalation", () => {
  const snapshot = parseSavedLearnSession({
    version: 1,
    savedAt: Date.now(),
    mode: "countries",
    region: "europe",
    questions: [{ id: "q1", type: "find_country", countryId: "FRA" }],
    index: 0,
  });
  assert.deepEqual(snapshot.escalation, { easeCap: 4, streak: 0 });
});

test("resume labels describe the next unanswered question", () => {
  assert.equal(formatSavedLearnResumeLabel(sampleSnapshot({ index: 0 })), "Resume 1 of 2");
  assert.equal(formatSavedLearnResumeLabel(sampleSnapshot({ index: 1 })), "Resume 2 of 2");
  assert.equal(formatSavedLearnResumeLabel(sampleSnapshot({ index: 2 })), "See your results");
  assert.equal(formatSavedLearnResumeLabel(null), null);
});
