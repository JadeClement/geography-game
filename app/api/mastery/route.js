import { auth } from "@/auth";
import { getCountryStatsForUser } from "@/lib/db";
import { getEffectiveMastery } from "@/lib/mastery";

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    if (!mode) {
      return Response.json({ error: "Invalid query parameters." }, { status: 400 });
    }

    const stats = await getCountryStatsForUser(session.user.id, { mode });

    const mastery = stats.map((stat) => ({
      countryId: stat.countryId,
      level: stat.level,
      masteryScore: getEffectiveMastery(stat),
      graduated: stat.graduated,
    }));

    return Response.json({ mastery });
  } catch (error) {
    console.error("Mastery fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json({ mastery: [] });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
