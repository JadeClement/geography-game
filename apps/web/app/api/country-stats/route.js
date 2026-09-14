import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { getCountryStatsForUser, recordCountryPerformance, recordPracticeSession, getStreakForUser } from "@/lib/db";
import { GAME_TYPE_FOR_STATS, ROUND_OUTCOMES } from "@worldly/constants";
import { buildCascadedStat, hasEverStruggled } from "@/lib/mastery";
import { isValidLevel } from "@/lib/levels";
import { GAME_MODES } from "@/lib/regions";
import { getMobileSession } from "@/lib/mobile-auth";
import {
  checkAndNotifyFriendOvertake,
  computeWorldlyScoreForUser,
} from "@/lib/push-notifications";
import countriesManifest from "@/data/countries.json";

const VALID_OUTCOMES = new Set(Object.values(ROUND_OUTCOMES));

const VALID_GAME_TYPES = new Set(Object.values(GAME_TYPE_FOR_STATS));
const VALID_MODES = new Set(Object.values(GAME_MODES));
const ENABLED_COUNTRY_IDS = new Set(
  countriesManifest.countries.filter((country) => country.enabled).map((country) => country.iso3)
);

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
  const session = (await auth()) || (await getMobileSession(request));
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
      if ((stat.skillDomain ?? "general") !== "general") continue;
      if (!statsByCountry.has(stat.countryId)) {
        statsByCountry.set(stat.countryId, []);
      }
      statsByCountry.get(stat.countryId).push(stat);
    }

    const eligibleStats = [];
    for (const [countryId, countryStats] of statsByCountry) {
      const ownStat = countryStats[0] ?? null;
      const effectiveStat = buildCascadedStat(countryId, ownStat, []);
      const struggled = countryStats.some((stat) => hasEverStruggled(stat));

      if (struggled && !effectiveStat.graduated) {
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
  const session = (await auth()) || (await getMobileSession(request));
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { countryId, mode, level, outcome, responseTimeMs, gameType, learnModeMultiplier, questionTier, predictedSuccess, questionType, currentSessionNumber } = body;

    if (
      !countryId ||
      !mode ||
      !VALID_MODES.has(mode) ||
      !ENABLED_COUNTRY_IDS.has(countryId) ||
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

    // Learn-mode EMA weight. Optional; only Learn mode sends it. Test mode never
    // does, so its updates are unaffected. Clamp to a sane range and require it to
    // be a Learn-mode game type — Test/Review always use the neutral 1.0.
    let resolvedMultiplier = 1;
    if (learnModeMultiplier != null) {
      if (
        typeof learnModeMultiplier !== "number" ||
        !Number.isFinite(learnModeMultiplier) ||
        learnModeMultiplier < 0 ||
        learnModeMultiplier > 1
      ) {
        return Response.json({ error: "Invalid EMA multiplier." }, { status: 400 });
      }
      if (gameType === "learning") {
        resolvedMultiplier = learnModeMultiplier;
      }
    }

    const userId = session.user.id;

    const stat = await recordCountryPerformance({
      statId: randomUUID(),
      attemptId: randomUUID(),
      userId,
      countryId,
      mode,
      level,
      gameType,
      outcome,
      responseTimeMs: outcome === "needed_reveal" ? null : responseTimeMs,
      learnModeMultiplier: resolvedMultiplier,
      questionTier:
        typeof questionTier === "string" && questionTier.startsWith("tier_")
          ? questionTier
          : null,
      predictedSuccess:
        typeof predictedSuccess === "number" && Number.isFinite(predictedSuccess)
          ? Math.min(1, Math.max(0, predictedSuccess))
          : null,
      questionType:
        typeof questionType === "string" && questionType.trim()
          ? questionType.trim()
          : null,
      currentSessionNumber:
        Number.isInteger(currentSessionNumber) && currentSessionNumber >= 0
          ? currentSessionNumber
          : null,
    });

    // Idempotent per day (upsert), so recording on every round is safe and
    // keeps the user's daily practice streak up to date.
    await recordPracticeSession(userId);

    // Fire-and-forget friend overtake push — never delay the API response.
    setTimeout(() => {
      (async () => {
        try {
          const { currentStreak } = await getStreakForUser(userId);
          const worldlyScore = await computeWorldlyScoreForUser(userId);
          await checkAndNotifyFriendOvertake(userId, currentStreak, worldlyScore);
        } catch (err) {
          console.error("[push] overtake check failed:", err);
        }
      })();
    }, 0);

    return Response.json({ stat });
  } catch (error) {
    console.error("Country stat save error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
