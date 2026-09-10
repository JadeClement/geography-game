import { auth } from "@/auth";
import { getCountryStatsForUser } from "@/lib/db";
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
    const mastery = groupMasteryEntriesByMode(stats);
    const worldly = computeWorldlyScoreFromMastery(mastery, WORLD_COUNTRY_IDS);
    return Response.json({
      mastery,
      score: worldly.score,
      percent: worldly.percent,
      rawPercent: worldly.rawPercent,
      categories: worldly.categories,
      byDomain: worldly.byDomain,
      byDomainDisplay: worldly.byDomainDisplay,
    });
  } catch (error) {
    console.error("Mastery fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json({
        mastery: { countries: [], capitals: [], flags: [], neighbors: [] },
        score: 0,
        percent: 0,
        rawPercent: 0,
        categories: { countries: 0, capitals: 0, flags: 0 },
        byDomain: {},
        byDomainDisplay: {},
      });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
