/**
 * Expo push notification helpers.
 * Uses Expo's HTTP API — no SDK required.
 * Failures are logged and never thrown to callers.
 */

import {
  getCountryStatsForUser,
  getFriendsForUser,
  getStreaksForUsers,
  query,
} from "@/lib/db";
import { groupMasteryEntriesByMode } from "@/lib/mastery";
import { computeWorldlyScoreFromMastery } from "@/lib/worldlyScore";
import { getCountryIdsForRegion } from "@/lib/regions";

const EXPO_PUSH_URL = "https://api.expo.dev/v2/push/send";
const STREAK_MILESTONES = [7, 14, 30, 60, 100, 365];
const WORLD_COUNTRY_IDS = getCountryIdsForRegion("world");

export async function sendPushNotification(tokens, message) {
  if (!tokens?.length) return [];

  const chunks = [];
  for (let i = 0; i < tokens.length; i += 100) {
    chunks.push(tokens.slice(i, i + 100));
  }

  const results = [];
  for (const chunk of chunks) {
    const messages = chunk.map((token) => ({
      to: token,
      title: message.title,
      body: message.body,
      data: message.data || {},
      badge: message.badge,
      sound: "default",
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    }).catch((err) => {
      console.error("[push] fetch failed:", err.message);
      return null;
    });

    if (!res?.ok) {
      console.error("[push] Expo API error:", res?.status);
      continue;
    }

    const { data: tickets } = await res.json();
    results.push(...(tickets || []));
  }

  return results;
}

export async function getUserTokens(userId) {
  const result = await query(
    `SELECT token FROM push_tokens WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map((r) => r.token);
}

async function computeWorldlyScoreForUser(userId) {
  const stats = await getCountryStatsForUser(userId);
  const mastery = groupMasteryEntriesByMode(stats);
  const { percent } = computeWorldlyScoreFromMastery(mastery, WORLD_COUNTRY_IDS);
  return Math.round(percent);
}

async function canNotifyOvertake(friendId) {
  const result = await query(
    `SELECT 1 FROM push_tokens
     WHERE user_id = $1
       AND (
         last_overtake_notified_at IS NULL
         OR last_overtake_notified_at < NOW() - INTERVAL '24 hours'
       )
     LIMIT 1`,
    [friendId]
  );
  return result.rows.length > 0;
}

async function markOvertakeNotified(friendId) {
  await query(
    `UPDATE push_tokens
     SET last_overtake_notified_at = NOW()
     WHERE user_id = $1`,
    [friendId]
  );
}

/**
 * After a session, notify friends who were just overtaken on streak or % Worldly.
 */
export async function checkAndNotifyFriendOvertake(
  userId,
  newStreak,
  newWorldlyScore
) {
  try {
    const userResult = await query(
      `SELECT username, name FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return;

    const prevStreakResult = await query(
      `SELECT COALESCE(MAX(last_notified_streak), 0)::int AS prev
       FROM push_tokens WHERE user_id = $1`,
      [userId]
    );
    const prevStreak = Number(prevStreakResult.rows[0]?.prev) || 0;

    const prevWorldlyResult = await query(
      `SELECT COALESCE(MAX(last_notified_worldly), 0)::real AS prev
       FROM push_tokens WHERE user_id = $1`,
      [userId]
    );
    const prevWorldly = Number(prevWorldlyResult.rows[0]?.prev) || 0;

    const friends = await getFriendsForUser(userId);
    if (!friends.length) {
      await query(
        `UPDATE push_tokens
         SET last_notified_streak = $2, last_notified_worldly = $3
         WHERE user_id = $1`,
        [userId, newStreak, newWorldlyScore]
      );
      return;
    }

    const friendIds = friends.map((f) => f.id);
    const streakRows = await getStreaksForUsers(friendIds);
    const streakByFriend = new Map(
      streakRows.map((r) => [r.userId, Number(r.currentStreak) || 0])
    );

    const displayName = user.username || user.name || "A friend";

    for (const friend of friends) {
      const friendStreak = streakByFriend.get(friend.id) ?? 0;
      const friendWorldly = await computeWorldlyScoreForUser(friend.id);

      const overtookStreak =
        newStreak > friendStreak && prevStreak <= friendStreak && friendStreak > 0;
      const overtookWorldly =
        newWorldlyScore > friendWorldly &&
        prevWorldly <= friendWorldly &&
        friendWorldly > 0;

      if (!overtookStreak && !overtookWorldly) continue;
      if (!(await canNotifyOvertake(friend.id))) continue;

      const tokens = await getUserTokens(friend.id);
      if (!tokens.length) continue;

      const body = overtookStreak
        ? `${displayName} just overtook your streak!`
        : `${displayName} just overtook your % Worldly!`;

      await sendPushNotification(tokens, {
        title: "Your streak is under attack 🔥",
        body,
        data: { type: "friend_overtake" },
      });
      await markOvertakeNotified(friend.id);
    }

    await query(
      `UPDATE push_tokens
       SET last_notified_streak = $2, last_notified_worldly = $3
       WHERE user_id = $1`,
      [userId, newStreak, newWorldlyScore]
    );
  } catch (err) {
    console.error("[push] overtake check failed:", err);
  }
}

export async function checkAndNotifyStreakMilestone(
  userId,
  newStreak,
  prevStreak
) {
  try {
    if (!STREAK_MILESTONES.includes(newStreak)) return;
    if (prevStreak >= newStreak) return;

    const tokens = await getUserTokens(userId);
    if (!tokens.length) return;

    await sendPushNotification(tokens, {
      title: `🔥 ${newStreak}-day streak!`,
      body: `You've practiced Worldly for ${newStreak} days in a row. Impressive.`,
      data: { type: "streak_milestone" },
    });
  } catch (err) {
    console.error("[push] streak milestone failed:", err);
  }
}

export { computeWorldlyScoreForUser, STREAK_MILESTONES };
