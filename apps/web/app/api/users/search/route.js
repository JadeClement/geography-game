import { auth } from "@/auth";
import { searchUsersByUsernamePrefix } from "@/lib/db";
import { normalizeUsername } from "@/lib/usernames";

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20;

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const query = normalizeUsername(searchParams.get("q") ?? "");

    if (query.length < MIN_QUERY_LENGTH) {
      return Response.json({ users: [] });
    }

    if (!/^[a-z0-9_]+$/.test(query)) {
      return Response.json({ users: [] });
    }

    const users = await searchUsersByUsernamePrefix(query, {
      excludeUserId: session.user.id,
      limit: MAX_RESULTS,
    });

    return Response.json({ users });
  } catch (error) {
    console.error("User search error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
