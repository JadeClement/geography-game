import { query } from "@/lib/db";
import {
  getUserTokens,
  sendPushNotification,
} from "@/lib/push-notifications";

/**
 * GET — Railway cron daily at 21:00 UTC.
 * Authorization: Bearer {CRON_SECRET}
 *
 * Safety net for users who practiced yesterday (active streak) but not today
 * and may have missed the local 8pm reminder.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await query(
      `SELECT DISTINCT pt.user_id AS "userId"
       FROM push_tokens pt
       WHERE EXISTS (
         SELECT 1 FROM practice_sessions ps
         WHERE ps.user_id = pt.user_id
           AND ps.practiced_at = CURRENT_DATE - 1
       )
       AND NOT EXISTS (
         SELECT 1 FROM practice_sessions ps2
         WHERE ps2.user_id = pt.user_id
           AND ps2.practiced_at = CURRENT_DATE
       )
       AND (
         pt.streak_reminder_sent_at IS NULL
         OR pt.streak_reminder_sent_at < NOW() - INTERVAL '20 hours'
       )`
    );

    let sent = 0;
    for (const row of result.rows) {
      const tokens = await getUserTokens(row.userId);
      if (!tokens.length) continue;

      await sendPushNotification(tokens, {
        title: "Keep your streak alive 🌍",
        body: "You haven't done your review yet today.",
        data: { type: "streak_reminder" },
      });

      await query(
        `UPDATE push_tokens
         SET streak_reminder_sent_at = NOW()
         WHERE user_id = $1`,
        [row.userId]
      );
      sent += 1;
    }

    return Response.json({ sent });
  } catch (error) {
    console.error("[cron] streak-reminders failed:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
