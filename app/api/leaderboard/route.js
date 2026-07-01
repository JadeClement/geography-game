import { auth } from "@/auth";
import {
  getCountryStatsForUsers,
  getFriendsForUser,
  getPracticeSessionCountsForUsers,
  getStreaksForUsers,
  getUserById,
} from "@/lib/db";
import { groupMasteryEntriesByMode } from "@/lib/mastery";
import { computeWorldlyScoreFromMastery } from "@/lib/worldlyScore";
import { getCountryIdsForRegion, getRegionForCountry, getRegionLabel } from "@/lib/regions";

const WORLD_COUNTRY_IDS = getCountryIdsForRegion("world");

function mostActiveRegion(stats) {
  const tally = new Map();
  for (const stat of stats) {
    const region = getRegionForCountry(stat.countryId);
    if (!region || region === "world") continue;
    const activity =
      (stat.firstTryCorrect ?? 0) +
      (stat.secondTryCorrect ?? 0) +
      (stat.neededReveal ?? 0);
    if (activity <= 0) continue;
    tally.set(region, (tally.get(region) ?? 0) + activity);
  }

  let best = null;
  let bestValue = 0;
  for (const [region, value] of tally) {
    if (value > bestValue) {
      best = region;
      bestValue = value;
    }
  }
  return best ? getRegionLabel(best) : null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [self, friends] = await Promise.all([
      getUserById(userId),
      getFriendsForUser(userId),
    ]);

    const people = [
      { id: userId, name: self?.name ?? "You", username: self?.username ?? null, isYou: true },
      ...friends.map((friend) => ({
        id: friend.id,
        name: friend.name,
        username: friend.username,
        isYou: false,
      })),
    ];

    const ids = people.map((person) => person.id);

    const [statRows, sessionRows, streakRows] = await Promise.all([
      getCountryStatsForUsers(ids),
      getPracticeSessionCountsForUsers(ids),
      getStreaksForUsers(ids),
    ]);

    const statsByUser = new Map();
    for (const row of statRows) {
      if (!statsByUser.has(row.userId)) statsByUser.set(row.userId, []);
      statsByUser.get(row.userId).push(row);
    }

    const sessionsByUser = new Map(
      sessionRows.map((row) => [row.userId, row])
    );
    const streaksByUser = new Map(
      streakRows.map((row) => [row.userId, Number(row.currentStreak) || 0])
    );

    const leaderboard = people.map((person) => {
      const stats = statsByUser.get(person.id) ?? [];
      const mastery = groupMasteryEntriesByMode(stats);
      const { percent } = computeWorldlyScoreFromMastery(mastery, WORLD_COUNTRY_IDS);
      const sessions = sessionsByUser.get(person.id) ?? { week: 0, allTime: 0 };

      return {
        id: person.id,
        name: person.name,
        username: person.username,
        isYou: person.isYou,
        worldly: Math.round(percent),
        streak: streaksByUser.get(person.id) ?? 0,
        sessionsWeek: Number(sessions.week) || 0,
        sessionsAll: Number(sessions.allTime) || 0,
        region: mostActiveRegion(stats),
      };
    });

    return Response.json({ leaderboard });
  } catch (error) {
    console.error("Leaderboard fetch error:", error);
    if (error?.code === "42P01") {
      return Response.json({ leaderboard: [] });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
