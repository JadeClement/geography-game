/**
 * Domain-weighted Worldly score, mastery tiers, and contribution-rate checks.
 *
 * Run: node --import ./scripts/register-alias.mjs --test scripts/test-worldly-score.js
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  applyWorldlyCurve,
  computeCountryDomainScore,
  computeWorldlyScoreFromMastery,
  WORLDLY_CURVE_BREAKPOINTS,
  WORLDLY_DOMAIN_WEIGHTS,
} from "@/lib/worldlyScore";
import { ALL_MODE, countLocatedForTab, paintScoreForTab, regionScoresForTab } from "@/lib/masteryMap";
import {
  getMasteryTier,
  MASTERY_TIERS,
  domainScoresFromStats,
  getWeakestDomain,
} from "@/lib/masteryTiers";
import {
  DOMAINS_WITH_TEST_MODE,
  getLearnContributionRate,
  inferDomainFromMode,
  resolveSkillDomain,
  SKILL_DOMAINS,
} from "@/lib/learn/questionTypes";
import { GAME_MODES } from "@/lib/regions";
import { LEARN_CONTRIBUTION_RATE } from "@worldly/constants";

test("applyWorldlyCurve(0.75) === 80 exactly", () => {
  assert.equal(applyWorldlyCurve(0.75), 80);
});

test("applyWorldlyCurve stays in 0–100", () => {
  assert.equal(applyWorldlyCurve(-1), 0);
  assert.equal(applyWorldlyCurve(0), 0);
  assert.equal(applyWorldlyCurve(1), 100);
  assert.equal(applyWorldlyCurve(2), 100);
  for (const { raw, display } of WORLDLY_CURVE_BREAKPOINTS) {
    assert.equal(applyWorldlyCurve(raw), display);
  }
});

test("getMasteryTier NONE for a country with no data", () => {
  assert.equal(getMasteryTier({ stats: [] }), MASTERY_TIERS.NONE);
  assert.equal(getMasteryTier({}), MASTERY_TIERS.NONE);
});

test("getMasteryTier SPOTTED for a country with any Learn answers", () => {
  assert.equal(
    getMasteryTier({
      stats: [
        {
          countryId: "FRA",
          mode: "countries",
          skillDomain: "location",
          masteryScore: 0.2,
          graduated: false,
        },
      ],
    }),
    MASTERY_TIERS.SPOTTED
  );
});

test("getMasteryTier LOCATED for a country whose general row has graduated = true", () => {
  assert.equal(
    getMasteryTier({
      stats: [
        {
          countryId: "FRA",
          mode: "countries",
          skillDomain: "general",
          masteryScore: 0.92,
          graduated: true,
        },
      ],
    }),
    MASTERY_TIERS.LOCATED
  );
});

test("getMasteryTier WORLDLY when location, capital, and neighbors are all ≥ 0.75", () => {
  assert.equal(
    getMasteryTier({
      stats: [
        { countryId: "FRA", mode: "countries", skillDomain: "location", masteryScore: 0.8, graduated: false },
        { countryId: "FRA", mode: "capitals", skillDomain: "capital", masteryScore: 0.75, graduated: false },
        { countryId: "FRA", mode: "neighbors", skillDomain: "neighbors", masteryScore: 0.9, graduated: false },
      ],
    }),
    MASTERY_TIERS.WORLDLY
  );
});

test("getMasteryTier WORLDLY waives neighbors for island countries", () => {
  assert.equal(
    getMasteryTier({
      neighborCount: 0,
      stats: [
        { countryId: "ISL", mode: "countries", skillDomain: "location", masteryScore: 0.8, graduated: false },
        { countryId: "ISL", mode: "capitals", skillDomain: "capital", masteryScore: 0.8, graduated: false },
      ],
    }),
    MASTERY_TIERS.WORLDLY
  );
});

test("legacy general rows fill the matching Test domain", () => {
  const scores = domainScoresFromStats([
    { countryId: "DEU", mode: "countries", skillDomain: "general", masteryScore: 0.6 },
    { countryId: "DEU", mode: "capitals", skillDomain: "general", masteryScore: 0.4 },
  ]);
  assert.equal(scores.location, 0.6);
  assert.equal(scores.capital, 0.4);
  assert.equal(scores.flag, 0);
});

test("Learn contribution rate is 0.8 on Test-mode domains and 1.0 on Learn-only", () => {
  assert.deepEqual(
    [...DOMAINS_WITH_TEST_MODE].sort(),
    ["capital", "flag", "location"].sort()
  );
  assert.equal(getLearnContributionRate(SKILL_DOMAINS.LOCATION), 0.8);
  assert.equal(getLearnContributionRate(SKILL_DOMAINS.STATISTICS), 1);
  assert.equal(getLearnContributionRate(SKILL_DOMAINS.FACTS), 1);
  assert.equal(getLearnContributionRate(SKILL_DOMAINS.NEIGHBORS), 1);
  assert.equal(LEARN_CONTRIBUTION_RATE.neighbors, 1);
});

test("resolveSkillDomain infers from mode when questionType is missing", () => {
  assert.equal(inferDomainFromMode(GAME_MODES.COUNTRIES), SKILL_DOMAINS.LOCATION);
  assert.equal(inferDomainFromMode(GAME_MODES.CAPITALS), SKILL_DOMAINS.CAPITAL);
  assert.equal(inferDomainFromMode(GAME_MODES.FLAGS), SKILL_DOMAINS.FLAG);
  assert.equal(inferDomainFromMode("neighbors"), SKILL_DOMAINS.NEIGHBORS);
  assert.equal(resolveSkillDomain({ mode: GAME_MODES.FLAGS }), SKILL_DOMAINS.FLAG);
  assert.equal(
    resolveSkillDomain({ questionType: "capital_free_recall", mode: GAME_MODES.COUNTRIES }),
    SKILL_DOMAINS.CAPITAL
  );
});

test("computeWorldlyScoreFromMastery returns byDomain and a curved percent", () => {
  const countryIds = ["AAA", "BBB"];
  const mastery = {
    countries: [
      {
        countryId: "AAA",
        level: "F1",
        masteryScore: 1,
        graduated: true,
        skillDomain: "location",
        mode: "countries",
      },
    ],
    capitals: [],
    flags: [],
    neighbors: [],
  };
  const result = computeWorldlyScoreFromMastery(mastery, countryIds);
  assert.ok("byDomain" in result);
  assert.ok("location" in result.byDomain);
  assert.ok(result.percent >= 0 && result.percent <= 100);
  assert.ok(Object.keys(WORLDLY_DOMAIN_WEIGHTS).every((key) => key in result.byDomain));
});

test("getWeakestDomain picks the lowest raw domain", () => {
  assert.equal(
    getWeakestDomain({
      location: 0.8,
      neighbors: 0.1,
      capital: 0.5,
      flag: 0.4,
      statistics: 0.3,
      facts: 0.2,
    }),
    "neighbors"
  );
});

test("paintScoreForTab uses location on Countries and the Worldly blend on All", () => {
  const once = domainScoresFromStats([
    { countryId: "FRA", mode: "countries", skillDomain: "location", masteryScore: 0.15 },
  ]);
  const aLot = domainScoresFromStats([
    { countryId: "KEN", mode: "countries", skillDomain: "location", masteryScore: 0.85 },
    { countryId: "KEN", mode: "capitals", skillDomain: "capital", masteryScore: 0.7 },
    { countryId: "KEN", mode: "neighbors", skillDomain: "neighbors", masteryScore: 0.6 },
    { countryId: "KEN", mode: "flags", skillDomain: "flag", masteryScore: 0.4 },
  ]);

  assert.equal(paintScoreForTab(GAME_MODES.COUNTRIES, once), 0.15);
  assert.equal(paintScoreForTab(GAME_MODES.COUNTRIES, aLot), 0.85);
  assert.equal(paintScoreForTab(GAME_MODES.CAPITALS, aLot), 0.7);
  assert.equal(paintScoreForTab(GAME_MODES.FLAGS, aLot), 0.4);

  assert.equal(paintScoreForTab(ALL_MODE, once), computeCountryDomainScore(once));
  assert.equal(paintScoreForTab(ALL_MODE, aLot), computeCountryDomainScore(aLot));
  assert.ok(
    paintScoreForTab(ALL_MODE, aLot) > paintScoreForTab(ALL_MODE, once),
    "a heavily practiced country paints stronger on All than a one-session country"
  );
});

test("countLocatedForTab only counts the active tab's domain", () => {
  const scores = new Map([
    ["FRA", { location: 0.95, capital: 0.2, flag: 0 }],
    ["DEU", { location: 0.1, capital: 0.92, flag: 0.91 }],
  ]);
  const ids = ["FRA", "DEU"];
  assert.equal(countLocatedForTab(GAME_MODES.COUNTRIES, ids, scores), 1);
  assert.equal(countLocatedForTab(GAME_MODES.CAPITALS, ids, scores), 1);
  assert.equal(countLocatedForTab(GAME_MODES.FLAGS, ids, scores), 1);
  assert.equal(countLocatedForTab(ALL_MODE, ids, scores), 0);
});

test("regionScoresForTab omits World and follows the active tab", () => {
  const regions = [
    { id: "world", label: "World" },
    { id: "europe", label: "Europe" },
    { id: "asia", label: "Asia" },
  ];
  const idsByRegion = {
    world: ["FRA", "JPN"],
    europe: ["FRA"],
    asia: ["JPN"],
  };
  const scores = new Map([
    ["FRA", { location: 1, capital: 0, flag: 0, neighbors: 0, statistics: 0, facts: 0 }],
    ["JPN", { location: 0, capital: 1, flag: 0, neighbors: 0, statistics: 0, facts: 0 }],
  ]);
  const getIds = (id) => idsByRegion[id];

  const countries = regionScoresForTab(GAME_MODES.COUNTRIES, regions, getIds, scores);
  assert.deepEqual(
    countries.map((row) => row.id),
    ["europe", "asia"]
  );
  assert.equal(countries.find((row) => row.id === "europe").pct, 100);
  assert.equal(countries.find((row) => row.id === "asia").pct, 0);

  const capitals = regionScoresForTab(GAME_MODES.CAPITALS, regions, getIds, scores);
  assert.equal(capitals.find((row) => row.id === "europe").pct, 0);
  assert.equal(capitals.find((row) => row.id === "asia").pct, 100);

  const all = regionScoresForTab(ALL_MODE, regions, getIds, scores);
  assert.ok(all.find((row) => row.id === "europe").pct < 100);
  assert.ok(all.find((row) => row.id === "europe").pct > 0);
});
