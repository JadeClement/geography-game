import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { getCountryStatsForUser, recordCountryPerformance } from "@/lib/db";
import { isEligibleForLearning } from "@/lib/learning";
import { buildCascadedStat, GAME_TYPE_FOR_STATS } from "@/lib/mastery";
import { getMasteryProvingLevels, isValidLevel } from "@/lib/levels";
import countriesManifest from "@/data/countries.json";

const VALID_OUTCOMES = new Set([
  "first_try_correct",
  "second_try_correct",
  "needed_reveal",
]);

const VALID_GAME_TYPES = new Set(Object.values(GAME_TYPE_FOR_STATS));

function getRegionCountryIds(regionId) {
  const ids = new Set();
  for (const country of countriesManifest.countries) {
    if (!country.enabled) continue;
    if (regionId === "world" || country.region === regionId) {
      ids.add(country.iso3);
    }
  }
  return ids;
}

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");
    const level = searchParams.get("level");
    const region = searchParams.get("region");

    if (!mode || !region || !isValidLevel(level)) {
      return Response.json({ error: "Invalid query parameters." }, { status: 400 });
    }

    const regionIds = getRegionCountryIds(region);
    const stats = await getCountryStatsForUser(session.user.id, { mode });

    const statsByCountry = new Map();
    for (const stat of stats) {
      if (!regionIds.has(stat.countryId)) continue;
      if (!statsByCountry.has(stat.countryId)) {
        statsByCountry.set(stat.countryId, []);
      }
      statsByCountry.get(stat.countryId).push(stat);
    }

    const provingLevels = getMasteryProvingLevels(level);
    const eligibleStats = [];
    for (const [countryId, countryStats] of statsByCountry) {
      const ownStat = countryStats.find((s) => s.level === level) ?? null;
      const provingStats = countryStats.filter((s) => provingLevels.includes(s.level));
      const effectiveStat = buildCascadedStat(countryId, ownStat, provingStats);

      if (isEligibleForLearning(effectiveStat)) {
        eligibleStats.push(effectiveStat);
      }
    }

    return Response.json({
      weakCount: eligibleStats.length,
      stats: eligibleStats,
    });
  } catch (error) {
    console.error("Country stats fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json(
        {
          error:
            "Learning data is not set up yet. Run node scripts/setup-db.js and try again.",
        },
        { status: 503 }
      );
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { countryId, mode, level, outcome, responseTimeMs, gameType } = body;

    if (
      !countryId ||
      !mode ||
      !isValidLevel(level) ||
      !VALID_OUTCOMES.has(outcome) ||
      !VALID_GAME_TYPES.has(gameType)
    ) {
      return Response.json({ error: "Invalid stat data." }, { status: 400 });
    }

    if (
      responseTimeMs != null &&
      (typeof responseTimeMs !== "number" || responseTimeMs < 0)
    ) {
      return Response.json({ error: "Invalid response time." }, { status: 400 });
    }

    const stat = await recordCountryPerformance({
      statId: randomUUID(),
      attemptId: randomUUID(),
      userId: session.user.id,
      countryId,
      mode,
      level,
      gameType,
      outcome,
      responseTimeMs: outcome === "needed_reveal" ? null : responseTimeMs,
    });

    return Response.json({ stat });
  } catch (error) {
    console.error("Country stat save error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
