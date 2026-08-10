import { auth } from "@/auth";
import { getStreakForUser, recordPracticeSession } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const streak = await getStreakForUser(session.user.id);
    return Response.json(streak);
  } catch (error) {
    console.error("Streak fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json({ currentStreak: 0, longestStreak: 0 });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { recorded } = await recordPracticeSession(session.user.id);
    const streak = await getStreakForUser(session.user.id);
    return Response.json({ recorded, ...streak });
  } catch (error) {
    console.error("Streak record error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
