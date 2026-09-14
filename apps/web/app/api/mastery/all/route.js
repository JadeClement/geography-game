import { auth } from "@/auth";
import { getCountryStatsForUser, getUserTotalSessions } from "@/lib/db";
import { groupMasteryEntriesByMode } from "@/lib/mastery";
import { computeWorldlyScoreFromMastery } from "@/lib/worldlyScore";
import { getCountryIdsForRegion } from "@/lib/regions";

const WORLD_COUNTRY_IDS = getCountryIdsForRegion("world");

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getCountryStatsForUser(session.user.id);
    const totalSessions = await getUserTotalSessions(session.user.id);
    const mastery = groupMasteryEntriesByMode(stats);
    const worldly = computeWorldlyScoreFromMastery(mastery, WORLD_COUNTRY_IDS);
    return Response.json({
      mastery,
      totalSessions,
      score: worldly.score,
      percent: worldly.percent,
      categories: worldly.categories,
      byDomain: worldly.byDomain,
    });
  } catch (error) {
    console.error("Mastery fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json({
        mastery: { countries: [], capitals: [], flags: [], neighbors: [] },
        score: 0,
        percent: 0,
        categories: { countries: 0, capitals: 0, flags: 0 },
        byDomain: {},
        totalSessions: 0,
      });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
