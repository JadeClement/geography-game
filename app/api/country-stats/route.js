import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { getCountryStatsForUser, incrementCountryStat } from "@/lib/db";
import { isWeakCountryStat } from "@/lib/learning";
import countriesManifest from "@/data/countries.json";

const VALID_OUTCOMES = new Set([
  "first_try_correct",
  "second_try_correct",
  "needed_reveal",
]);

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
    const level = Number(searchParams.get("level"));
    const region = searchParams.get("region");

    if (!mode || !region || !Number.isInteger(level) || level < 1) {
      return Response.json({ error: "Invalid query parameters." }, { status: 400 });
    }

    const regionIds = getRegionCountryIds(region);
    const stats = await getCountryStatsForUser(session.user.id, { mode, level });
    const regionStats = stats.filter((stat) => regionIds.has(stat.countryId));
    const weakStats = regionStats.filter(isWeakCountryStat);

    return Response.json({
      weakCount: weakStats.length,
      stats: weakStats,
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
    const { countryId, mode, level, outcome, responseTimeMs } = body;

    if (!countryId || !mode || !Number.isInteger(level) || !VALID_OUTCOMES.has(outcome)) {
      return Response.json({ error: "Invalid stat data." }, { status: 400 });
    }

    if (
      responseTimeMs != null &&
      (typeof responseTimeMs !== "number" || responseTimeMs < 0)
    ) {
      return Response.json({ error: "Invalid response time." }, { status: 400 });
    }

    const stat = await incrementCountryStat({
      id: randomUUID(),
      userId: session.user.id,
      countryId,
      mode,
      level,
      outcome,
      responseTimeMs: outcome === "needed_reveal" ? null : responseTimeMs,
    });

    return Response.json({ stat });
  } catch (error) {
    console.error("Country stat save error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
