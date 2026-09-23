import { auth } from "@/auth";
import { getOrCreateDailyUsage } from "@/lib/db";
import { loadLearnQuotaContext } from "@/lib/learnQuota";
import { getMobileSession } from "@/lib/mobile-auth";
import { getSessionsRemaining } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Read-only view of today's Learn quota for the "N sessions left today" badge.
// Never increments usage — POST /api/learn-sessions/start is the only writer.
export async function GET(request) {
  const session = (await auth()) || (await getMobileSession(request));
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;
    const timeZone = new URL(request.url).searchParams.get("timezone");
    const { isPremium, localDate, cap } = await loadLearnQuotaContext(userId, timeZone);
    const usage = await getOrCreateDailyUsage(userId, localDate);

    return Response.json({
      sessionsUsedToday: usage.sessionCount,
      cap: isPremium ? null : cap,
      isPremium,
      sessionsRemaining: isPremium ? null : getSessionsRemaining(usage.sessionCount, cap),
    });
  } catch (error) {
    console.error("Learn quota error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
