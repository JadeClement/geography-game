import { auth } from "@/auth";
import { getOrCreateDailyUsage, incrementDailyUsage } from "@/lib/db";
import { loadLearnQuotaContext } from "@/lib/learnQuota";
import { getMobileSession } from "@/lib/mobile-auth";
import { getSessionsRemaining, hasReachedDailyLimit } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Single source of truth for whether a fresh Learn session may start. The
// client only renders the answer; it never decides allowed/not-allowed itself.
export async function POST(request) {
  const session = (await auth()) || (await getMobileSession(request));
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  try {
    const userId = session.user.id;
    const { isPremium, localDate, cap } = await loadLearnQuotaContext(userId, body?.timezone);

    if (isPremium) {
      // Unlimited — still counted, for telemetry only.
      const usage = await incrementDailyUsage(userId, localDate);
      return Response.json({
        allowed: true,
        isPremium: true,
        sessionsUsedToday: usage?.sessionCount ?? null,
        cap: null,
        sessionsRemaining: null,
      });
    }

    const today = await getOrCreateDailyUsage(userId, localDate);
    const blocked = (sessionsUsedToday) =>
      Response.json({
        allowed: false,
        isPremium: false,
        cap,
        sessionsUsedToday,
        sessionsRemaining: 0,
      });

    if (hasReachedDailyLimit(today.sessionCount, cap)) return blocked(today.sessionCount);

    // Conditional increment: null means a concurrent start took the last slot.
    const usage = await incrementDailyUsage(userId, localDate, { maxCount: cap });
    if (!usage) return blocked(Math.max(today.sessionCount, cap));

    return Response.json({
      allowed: true,
      isPremium: false,
      cap,
      sessionsUsedToday: usage.sessionCount,
      sessionsRemaining: getSessionsRemaining(usage.sessionCount, cap),
    });
  } catch (error) {
    console.error("Learn session start error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
