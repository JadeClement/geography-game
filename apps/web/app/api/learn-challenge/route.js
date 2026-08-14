import { auth } from "@/auth";
import { getLearnChallenge, upsertLearnChallenge } from "@/lib/db";
import { GAME_MODES, REGIONS } from "@/lib/regions";
import { getMobileSession } from "@/lib/mobile-auth";
import {
  createDefaultChallenge,
  normalizeChallenge,
  updateChallengeLevel,
  challengeOutcomeFromAnswer,
} from "@/lib/learn/challengeLevel";
import { ROUND_OUTCOMES } from "@worldly/constants";

const VALID_MODES = new Set(Object.values(GAME_MODES));
const VALID_REGIONS = new Set(REGIONS.map((region) => region.id));
const VALID_OUTCOMES = new Set(Object.values(ROUND_OUTCOMES));
const VALID_TIERS = new Set(["tier_1", "tier_2", "tier_3", "tier_4"]);

export async function GET(request) {
  const session = (await auth()) || (await getMobileSession(request));
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");
    const region = searchParams.get("region");

    if (!mode || !VALID_MODES.has(mode) || !region || !VALID_REGIONS.has(region)) {
      return Response.json({ error: "Invalid query parameters." }, { status: 400 });
    }

    const challenge = await getLearnChallenge(session.user.id, { mode, region });
    return Response.json({ challenge: normalizeChallenge(challenge) });
  } catch (error) {
    console.error("Learn challenge fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json(
        {
          error:
            "Learn challenge table is not set up yet. Run node --env-file=.env scripts/setup-db.js",
          challenge: createDefaultChallenge(),
        },
        { status: 503 }
      );
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * POST body options:
 * - Full upsert: { mode, region, workingTier, momentum, recentOutcomes }
 * - Apply one outcome: { mode, region, outcome, tier, fast?, predictedSuccess? }
 *   (loads current challenge, updates, persists)
 */
export async function POST(request) {
  const session = (await auth()) || (await getMobileSession(request));
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mode, region } = body ?? {};

    if (!mode || !VALID_MODES.has(mode) || !region || !VALID_REGIONS.has(region)) {
      return Response.json({ error: "Invalid challenge data." }, { status: 400 });
    }

    let next;
    if (body.outcome != null && body.tier != null) {
      if (!VALID_OUTCOMES.has(body.outcome) || !VALID_TIERS.has(body.tier)) {
        return Response.json({ error: "Invalid outcome or tier." }, { status: 400 });
      }
      const current = normalizeChallenge(
        await getLearnChallenge(session.user.id, { mode, region })
      );
      const outcomeRecord = challengeOutcomeFromAnswer({
        tier: body.tier,
        outcome: body.outcome,
        correct: body.correct,
        revealUsed: body.revealUsed,
        fast: Boolean(body.fast),
        predictedSuccess: body.predictedSuccess,
      });
      next = updateChallengeLevel(current, outcomeRecord);
    } else if (body.workingTier != null) {
      next = normalizeChallenge({
        workingTier: body.workingTier,
        momentum: body.momentum,
        recentOutcomes: body.recentOutcomes,
      });
    } else {
      return Response.json({ error: "Invalid challenge data." }, { status: 400 });
    }

    const challenge = await upsertLearnChallenge(session.user.id, {
      mode,
      region,
      workingTier: next.workingTier,
      momentum: next.momentum,
      recentOutcomes: next.recentOutcomes,
    });

    return Response.json({ challenge: normalizeChallenge(challenge) });
  } catch (error) {
    console.error("Learn challenge save error:", error);
    if (error?.code === "42P01") {
      return Response.json(
        {
          error:
            "Learn challenge table is not set up yet. Run node --env-file=.env scripts/setup-db.js",
        },
        { status: 503 }
      );
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
