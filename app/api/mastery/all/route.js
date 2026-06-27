import { auth } from "@/auth";
import { getCountryStatsForUser } from "@/lib/db";
import { groupMasteryEntriesByMode } from "@/lib/mastery";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getCountryStatsForUser(session.user.id);
    return Response.json({ mastery: groupMasteryEntriesByMode(stats) });
  } catch (error) {
    console.error("Mastery fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json({
        mastery: { countries: [], capitals: [], flags: [] },
      });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
