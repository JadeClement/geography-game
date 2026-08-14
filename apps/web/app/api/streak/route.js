import { auth } from "@/auth";
import { getStreakForUser, recordPracticeSession } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";
import { checkAndNotifyStreakMilestone } from "@/lib/push-notifications";

export async function GET(request) {
  const session = (await auth()) || (await getMobileSession(request));
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

export async function POST(request) {
  const session = (await auth()) || (await getMobileSession(request));
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const before = await getStreakForUser(userId);
    const { recorded } = await recordPracticeSession(userId);
    const streak = await getStreakForUser(userId);

    setTimeout(() => {
      (async () => {
        try {
          await checkAndNotifyStreakMilestone(
            userId,
            streak.currentStreak,
            before.currentStreak
          );
        } catch (err) {
          console.error("[push] streak milestone failed:", err);
        }
      })();
    }, 0);

    return Response.json({ recorded, ...streak });
  } catch (error) {
    console.error("Streak record error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
