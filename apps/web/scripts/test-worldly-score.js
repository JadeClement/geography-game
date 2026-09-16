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
  computeCountryScore,
  buildLevelScoreMap,
  computeWorldlyScoreFromMastery,
  countryDisplayPercent,
  displayPercent,
  getCrossedWorldlyMilestone,
  WORLDLY_DOMAIN_WEIGHTS,
} from "@/lib/worldlyScore";
import {
  ALL_MODE,
  collectStatsByCountry,
  countLocatedForTab,
  countStartedForTab,
  countryStartedForDomain,
  countryStartedForTab,
  DOMAIN_COLUMNS,
  paintScoreForTab,
  regionDomainDisplayPcts,
  regionScoresForTab,
  tabDisplayPercent,
  tooltipRowsForTab,
} from "@/lib/masteryMap";
import {
  getMasteryTier,
  MASTERY_TIERS,
  domainScoresFromStats,
  getWeakestDomain,
} from "@/lib/masteryTiers";
import { buildDomainMasteryMap, getDomainMastery } from "@/lib/learn/domainMastery";
import {
  DOMAINS_WITH_TEST_MODE,
  getLearnContributionRate,
  inferDomainFromMode,
  resolveSkillDomain,
  SKILL_DOMAINS,
} from "@/lib/learn/questionTypes";
import { GAME_MODES } from "@/lib/regions";
import { LEARN_CONTRIBUTION_RATE } from "@worldly/constants";

test("applyWorldlyCurve is the identity raw × 100", () => {
  assert.equal(applyWorldlyCurve(0.75), 75);
  assert.equal(applyWorldlyCurve(0.125), 12.5);
  assert.equal(applyWorldlyCurve(-1), 0);
  assert.equal(applyWorldlyCurve(0), 0);
  assert.equal(applyWorldlyCurve(1), 100);
  assert.equal(applyWorldlyCurve(2), 100);
});

test("displayPercent is round(raw × 100) at every scope", () => {
  assert.equal(displayPercent(0), 0);
  assert.equal(displayPercent(0.044), 4);
  assert.equal(displayPercent(0.125), 13);
  assert.equal(displayPercent(1), 100);
  assert.equal(displayPercent(-0.2), 0);
  assert.equal(displayPercent(1.4), 100);
});

test("countryDisplayPercent floors started-but-zero to 1%", () => {
  assert.equal(countryDisplayPercent(0, false), 0);
  assert.equal(countryDisplayPercent(0, true), 1);
  assert.equal(countryDisplayPercent(0.004, true), 1);
  assert.equal(countryDisplayPercent(0.2, true), 20);
  assert.equal(countryDisplayPercent(1, true), 100);
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

test("computeWorldlyScoreFromMastery returns byDomain and an uncurved whole percent", () => {
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
  assert.equal(result.percent, Math.round(result.score * 100));
  assert.ok(!("rawPercent" in result));
  assert.ok(!("byDomainDisplay" in result));
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

test("collectStatsByCountry keeps Test general rows and Learn domain rows together", () => {
  const byCountry = collectStatsByCountry({
    countries: [
      { countryId: "FRA", skillDomain: "general", masteryScore: 0.4 },
      { countryId: "FRA", skillDomain: "statistics", masteryScore: 0.8 },
    ],
    capitals: [{ countryId: "FRA", skillDomain: "general", masteryScore: 0.6 }],
    flags: [],
    neighbors: [{ countryId: "FRA", skillDomain: "neighbors", masteryScore: 0.5 }],
  });
  const rows = byCountry.get("FRA");
  assert.equal(rows.length, 4);
  assert.ok(rows.some((row) => row.mode === GAME_MODES.COUNTRIES && row.skillDomain === "general"));
  assert.ok(rows.some((row) => row.mode === "neighbors"));
});

test("regionDomainDisplayPcts averages raw domain scores then rounds raw × 100", () => {
  const statsByCountry = collectStatsByCountry({
    countries: [
      { countryId: "FRA", skillDomain: "location", masteryScore: 0.75 },
      { countryId: "DEU", skillDomain: "location", masteryScore: 0.75 },
    ],
    capitals: [{ countryId: "FRA", skillDomain: "capital", masteryScore: 1 }],
    flags: [],
    neighbors: [],
  });
  const pcts = regionDomainDisplayPcts(["FRA", "DEU"], statsByCountry);
  assert.equal(pcts.location, 75);
  assert.equal(pcts.capital, displayPercent(0.5));
  assert.equal(pcts.flag, 0);
  assert.deepEqual(
    Object.keys(pcts),
    DOMAIN_COLUMNS
  );
});

test("domainScoresFromStats with only a general row still fills the domain", () => {
  const scores = domainScoresFromStats([
    { countryId: "FRA", mode: "countries", skillDomain: "general", masteryScore: 0.42, level: "N2" },
  ]);
  assert.equal(scores.location, 0.42);
  assert.equal(scores.capital, 0);
});

test("buildDomainMasteryMap matches the display path for the same rows", () => {
  const rows = [
    { countryId: "FRA", mode: "countries", skillDomain: "location", masteryScore: 0.55, level: "N2" },
    { countryId: "FRA", mode: "countries", skillDomain: "general", masteryScore: 0.55, level: "N2" },
    { countryId: "FRA", mode: "capitals", skillDomain: "capital", masteryScore: 0.3, level: "F1" },
  ];
  const display = domainScoresFromStats(rows);
  const map = buildDomainMasteryMap(rows);
  assert.equal(getDomainMastery(map, "FRA", SKILL_DOMAINS.LOCATION), display.location);
  assert.equal(getDomainMastery(map, "FRA", SKILL_DOMAINS.CAPITAL), display.capital);
  assert.equal(display.location, 0.55);
  assert.equal(display.capital, 0.3);
});

test("legacy category header projects one score into all four level slots", () => {
  const map = buildLevelScoreMap([
    { countryId: "FRA", level: "F2", masteryScore: 0.4, skillDomain: "general" },
  ]);
  assert.equal(computeCountryScore(map.get("FRA")), 0.4);
});

const EMPTY_DOMAINS = {
  location: 0,
  neighbors: 0,
  capital: 0,
  flag: 0,
  statistics: 0,
  facts: 0,
};

test("uncurved percent equals raw × 100 at world, region, and country scope", () => {
  const countryIds = ["FRA", "DEU"];
  const mastery = {
    countries: [
      { countryId: "FRA", skillDomain: "location", masteryScore: 0.125, mode: "countries" },
    ],
    capitals: [],
    flags: [],
    neighbors: [],
  };
  const worldly = computeWorldlyScoreFromMastery(mastery, countryIds);
  assert.equal(worldly.percent, Math.round(worldly.score * 100));

  const statsByCountry = collectStatsByCountry(mastery);
  const scores = new Map(
    countryIds.map((id) => [id, domainScoresFromStats(statsByCountry.get(id) ?? [])])
  );
  assert.equal(paintScoreForTab(GAME_MODES.COUNTRIES, scores.get("FRA")), 0.125);
  assert.equal(displayPercent(paintScoreForTab(GAME_MODES.COUNTRIES, scores.get("FRA"))), 13);

  const regions = regionScoresForTab(
    GAME_MODES.COUNTRIES,
    [{ id: "europe", label: "Europe" }],
    () => ["FRA"],
    scores
  );
  assert.equal(regions[0].pct, 13);
});

test("ring equals the country-count-weighted average of region rows, not the mean of percents", () => {
  const regions = [
    { id: "world", label: "World" },
    { id: "europe", label: "Europe" },
    { id: "asia", label: "Asia" },
  ];
  const idsByRegion = {
    world: ["FRA", "JPN", "CHN", "IND"],
    europe: ["FRA"],
    asia: ["JPN", "CHN", "IND"],
  };
  const scores = new Map([
    ["FRA", { ...EMPTY_DOMAINS, location: 1 }],
    ["JPN", { ...EMPTY_DOMAINS }],
    ["CHN", { ...EMPTY_DOMAINS }],
    ["IND", { ...EMPTY_DOMAINS }],
  ]);
  const getIds = (id) => idsByRegion[id];
  const ring = tabDisplayPercent(GAME_MODES.COUNTRIES, idsByRegion.world, scores);
  assert.equal(ring, 25);

  const rows = regionScoresForTab(GAME_MODES.COUNTRIES, regions, getIds, scores);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const weighted = rows.reduce((sum, row) => sum + row.pct * row.count, 0) / total;
  assert.equal(Math.round(weighted), ring);

  const meanOfPercents = rows.reduce((sum, row) => sum + row.pct, 0) / rows.length;
  assert.equal(meanOfPercents, 50);
  assert.notEqual(Math.round(meanOfPercents), ring);
});

test("a country with no rows contributes 0 and is not-started", () => {
  assert.equal(paintScoreForTab(GAME_MODES.COUNTRIES, domainScoresFromStats([])), 0);
  assert.equal(paintScoreForTab(ALL_MODE, undefined), 0);
  assert.equal(countryStartedForTab(GAME_MODES.COUNTRIES, []), false);
  assert.equal(countryStartedForTab(ALL_MODE, []), false);
});

test("coverage count matches countries with at least one row for the active domain", () => {
  const statsByCountry = collectStatsByCountry({
    countries: [
      { countryId: "FRA", skillDomain: "location", masteryScore: 0.1 },
      { countryId: "ITA", skillDomain: "general", masteryScore: 0.4 },
    ],
    capitals: [{ countryId: "JPN", skillDomain: "capital", masteryScore: 0.2 }],
    flags: [],
    neighbors: [{ countryId: "KEN", skillDomain: "neighbors", masteryScore: 0.9 }],
  });
  const ids = ["FRA", "ITA", "JPN", "KEN", "DEU"];
  assert.equal(countStartedForTab(GAME_MODES.COUNTRIES, ids, statsByCountry), 2);
  assert.equal(countStartedForTab(GAME_MODES.CAPITALS, ids, statsByCountry), 1);
  assert.equal(countStartedForTab(GAME_MODES.FLAGS, ids, statsByCountry), 0);
  assert.equal(countStartedForTab(ALL_MODE, ids, statsByCountry), 4);
});

test("All-tab tooltip leads with the weighted EMA then Countries / Capitals / Flags", () => {
  const scores = {
    location: 1,
    neighbors: 0,
    capital: 0.5,
    flag: 0.25,
    statistics: 0,
    facts: 0,
  };
  const all = tooltipRowsForTab(ALL_MODE, scores);
  assert.deepEqual(
    all.map((row) => row.key),
    [ALL_MODE, GAME_MODES.COUNTRIES, GAME_MODES.CAPITALS, GAME_MODES.FLAGS]
  );
  assert.equal(all[0].label, "Worldly");
  assert.equal(all[0].pct, displayPercent(computeCountryDomainScore(scores)));
  assert.equal(all[1].label, "Countries");
  assert.equal(all[1].pct, 100);
  assert.equal(all[2].label, "Capitals");
  assert.equal(all[2].pct, 50);
  assert.equal(all[3].label, "Flags");
  assert.equal(all[3].pct, 25);
  assert.ok(all[0].pct < 100, "composite is the domain-weighted mix, not location alone");

  const countries = tooltipRowsForTab(GAME_MODES.COUNTRIES, scores);
  assert.equal(countries.length, 1);
  assert.equal(countries[0].label, "Countries");
  assert.equal(countries[0].pct, 100);
});

test("started-but-never-correct country percents display as 1%, unseen stay 0%", () => {
  const empty = { ...EMPTY_DOMAINS };
  const unseen = tooltipRowsForTab(GAME_MODES.CAPITALS, empty, []);
  assert.equal(unseen[0].pct, 0);

  const seenNeverRight = tooltipRowsForTab(
    GAME_MODES.CAPITALS,
    empty,
    [{ countryId: "UZB", mode: "capitals", skillDomain: "capital", masteryScore: 0 }]
  );
  assert.equal(seenNeverRight[0].pct, 1);

  const all = tooltipRowsForTab(
    ALL_MODE,
    empty,
    [{ countryId: "UZB", mode: "capitals", skillDomain: "capital", masteryScore: 0 }]
  );
  assert.equal(all.find((row) => row.key === ALL_MODE).pct, 1);
  assert.equal(all.find((row) => row.key === GAME_MODES.CAPITALS).pct, 1);
  assert.equal(all.find((row) => row.key === GAME_MODES.COUNTRIES).pct, 0);
  assert.equal(all.find((row) => row.key === GAME_MODES.FLAGS).pct, 0);

  assert.equal(
    countryStartedForDomain("capital", [{ mode: "capitals", skillDomain: "capital" }]),
    true
  );
  assert.equal(
    countryStartedForDomain("location", [{ mode: "capitals", skillDomain: "capital" }]),
    false
  );
});

test("header % Worldly and the All-tab ring return the identical number", () => {
  const countryIds = ["FRA", "DEU", "JPN"];
  const mastery = {
    countries: [
      { countryId: "FRA", skillDomain: "location", masteryScore: 0.4, mode: "countries" },
    ],
    capitals: [
      { countryId: "DEU", skillDomain: "capital", masteryScore: 0.8, mode: "capitals" },
    ],
    flags: [],
    neighbors: [],
  };
  const worldly = computeWorldlyScoreFromMastery(mastery, countryIds);
  const statsByCountry = collectStatsByCountry(mastery);
  const scores = new Map(
    countryIds.map((id) => [id, domainScoresFromStats(statsByCountry.get(id) ?? [])])
  );
  assert.equal(tabDisplayPercent(ALL_MODE, countryIds, scores), worldly.percent);
});

test("milestone crossing fires once, on an upward crossing, against the uncurved percent", () => {
  assert.equal(getCrossedWorldlyMilestone(24, 25), 25);
  assert.equal(getCrossedWorldlyMilestone(25, 26), null);
  assert.equal(getCrossedWorldlyMilestone(26, 24), null);
  assert.equal(getCrossedWorldlyMilestone(24, 24), null);
  assert.equal(getCrossedWorldlyMilestone(49, 76), 75);
  assert.equal(getCrossedWorldlyMilestone(89, 100), 100);
  assert.equal(getCrossedWorldlyMilestone(0, 24), null);
});

