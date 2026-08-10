import { auth } from "@/auth";
import { getSeenFactIndices, recordFactSeen } from "@/lib/db";
import countriesManifest from "@/data/countries.json";

const ENABLED_COUNTRY_IDS = new Set(
  countriesManifest.countries.filter((country) => country.enabled).map((country) => country.iso3)
);

const FACT_COUNTS = new Map(
  countriesManifest.countries.map((country) => [
    country.iso3,
    Array.isArray(country.facts) ? country.facts.length : 0,
  ])
);

/**
 * GET /api/learn-facts?countryIds=FRA,DEU
 * Returns { seen: { FRA: [0,2], DEU: [] } } — fact indices already shown to the
 * signed-in user. Unauthenticated users get an empty map (facts still show, just
 * un-personalized), so the fact modal degrades gracefully for guests.
 */
export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ seen: {} });
  }

  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("countryIds");
    const requested = raw
      ? raw.split(",").map((id) => id.trim()).filter((id) => ENABLED_COUNTRY_IDS.has(id))
      : null;

    const byCountry = await getSeenFactIndices(session.user.id, requested);
    const seen = {};
    for (const [countryId, indices] of byCountry) {
      seen[countryId] = indices;
    }
    return Response.json({ seen });
  } catch (error) {
    console.error("Seen facts fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json({ seen: {} });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * POST /api/learn-facts  { countryId, factIndex }
 * Marks a real (non-synthetic) fact as seen for the signed-in user.
 */
export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { countryId, factIndex } = await request.json();
    const factCount = FACT_COUNTS.get(countryId) ?? 0;

    if (
      !ENABLED_COUNTRY_IDS.has(countryId) ||
      typeof factIndex !== "number" ||
      !Number.isInteger(factIndex) ||
      factIndex < 0 ||
      factIndex >= factCount
    ) {
      return Response.json({ error: "Invalid fact reference." }, { status: 400 });
    }

    await recordFactSeen(session.user.id, countryId, factIndex);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Seen fact save error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
