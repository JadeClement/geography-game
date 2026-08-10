import { auth } from "@/auth";
import { getCountryStatsForUser } from "@/lib/db";
import { mapStatsToMasteryEntries } from "@/lib/mastery";

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
    return Response.json({ mastery: mapStatsToMasteryEntries(stats) });
  } catch (error) {
    console.error("Mastery fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json({ mastery: [] });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
