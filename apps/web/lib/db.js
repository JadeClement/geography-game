/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIT (domain-level mastery) — country_stats shape and I/O
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. country_stats row (scripts/setup-db.js CREATE TABLE)
 *    id                  TEXT PK
 *    user_id             TEXT NOT NULL → users(id) ON DELETE CASCADE
 *    country_id          TEXT NOT NULL  (ISO3)
 *    mode                TEXT NOT NULL  (countries | capitals | flags)
 *    level               TEXT NOT NULL  (F1/F2/N1/N2) — informational last-played
 *    first_try_correct   INT  count of first-try corrects
 *    second_try_correct  INT  count of second-try corrects (got it right after a miss)
 *    needed_reveal       INT  count of reveal / clue outcomes
 *    incorrect           INT  count of complete misses (never got it right, no reveal)
 *    response_time_ms_sum BIGINT
 *    response_time_count INT
 *    mastery_score       REAL 0–1 EMA
 *    fast_streak         INT
 *    speed_baseline_ms   INT nullable
 *    graduated           BOOLEAN (Test-mode graduation only)
 *    last_attempt_at     TIMESTAMPTZ
 *    last_outcome        TEXT (first_try_correct | second_try_correct | needed_reveal | incorrect)
 *    updated_at / created_at TIMESTAMPTZ
 *    skill_domain        TEXT NOT NULL DEFAULT 'general'
 *                        (added this change: location|neighbors|capital|flag|
 *                        statistics|facts|general)
 *
 * 2. Unique key
 *    One cell per (user_id, country_id, mode, skill_domain). `level` is the
 *    most recently played Test/Learn level on that cell, never a lookup
 *    predicate. `general` is just another skill_domain value.
 *
 * 3. Write path after each answer
 *    LearnQuestionRenderer → GeographyGame.handleLearnAnswer
 *      → buildLearnStatPayloads (packages/core/learn/emaIntegration.js)
 *      → POST /api/country-stats
 *      → recordCountryPerformance (this file)
 *      → computeMasteryUpdate (packages/core/mastery.js)
 *    Dual-write: one domain row (from questionType, or inferred from mode)
 *    plus the legacy `general` row. Domain is resolved SERVER-SIDE — never
 *    from a client skillDomain field. Learn applies LEARN_CONTRIBUTION_RATE
 *    (0.8x on Test-mode domains) on top of the question-type multiplier.
 *    Also INSERTs one country_attempts row per answer (question_tier,
 *    predicted_success, question_type_id). Test rows leave question_type_id NULL.
 *
 * 4. Read path for Learn session building
 *    GET /api/mastery?mode= → getCountryStatsForUser → mapStatsToMasteryEntries
 *    Columns used: countryId, level, masteryScore, graduated, lastAttemptAt,
 *    lastOutcome, skillDomain. Sequencer builds a domain map; sampling uses
 *    getOverallMastery; type selection uses getDomainMastery.
 *
 * 5. computeMasteryUpdate inputs
 *    (stat, { outcome, responseTimeMs, gameType, gainMultiplier, penaltyMultiplier })
 *    Test folds LEVEL_GAIN_MULTIPLIERS into gainMultiplier only. Returns
 *    { masteryScore, fastStreak, speedBaselineMs, graduated }.
 *
 * 6. QUESTION_TYPES ids (packages/constants QUESTION_TYPES):
 *    blank_map_click, borderless_map_click, shape_drop, free_name_entry,
 *    capital_free_recall, capital_map_click, flag_free_recall, shape_name_entry, neighbor_recall_all,
 *    neighbor_free_recall, shape_identification, flag_identification,
 *    country_from_flag, capital_matching, country_from_capital, capital_map_choice, neighbor_confirm, neighbor_select_all,
 *    population_compare, area_compare, gdp_compare, population_rank,
 *    area_rank, gdp_rank, neighbor_identification, binary_map_choice,
 *    landlocked_check, language_family, religion_majority, religion_pie,
 *    brazil_non_neighbors.
 */

import { randomUUID } from "crypto";
import pg from "pg";
import {
  deriveUsernameFromEmail,
  validateUsername,
  withUsernameSuffix,
} from "./usernames.js";
import {
  computeMasteryUpdate,
  getDecayAdjustedMastery,
  getLevelGainMultiplier,
  isEffectivelyGraduated,
} from "./mastery.js";
import { resolveSkillDomain, getLearnContributionRate } from "./learn/questionTypes.js";

const { Pool } = pg;

const globalForDb = globalThis;

function createPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  const isLocal =
    process.env.DATABASE_URL.includes("localhost") ||
    process.env.DATABASE_URL.includes("127.0.0.1");

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(isLocal ? { ssl: false } : {}),
  });
}

export const pool = globalForDb.dbPool ?? createPool();

if (process.env.NODE_ENV !== "production" && pool) {
  globalForDb.dbPool = pool;
}

export async function query(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return pool.query(text, params);
}

const USER_PUBLIC_FIELDS = `
  id, name, username, email, email_verified_at AS "emailVerifiedAt",
  avatar_type AS "avatarType", avatar_color AS "avatarColor",
  avatar_flag AS "avatarFlag", avatar_image AS "avatarImage"
`;

export async function getUserById(userId) {
  const result = await query(
    `SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function getUserByEmail(email) {
  const result = await query(
    `SELECT ${USER_PUBLIC_FIELDS}, password FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function getUserByUsername(username) {
  const result = await query(
    `SELECT ${USER_PUBLIC_FIELDS} FROM users WHERE username = $1`,
    [username]
  );
  return result.rows[0] ?? null;
}

export async function isUsernameTaken(username, { excludeUserId } = {}) {
  const params = [username];
  let sql = `SELECT 1 FROM users WHERE username = $1`;
  if (excludeUserId) {
    params.push(excludeUserId);
    sql += ` AND id <> $2`;
  }
  sql += ` LIMIT 1`;
  const result = await query(sql, params);
  return result.rows.length > 0;
}

export async function allocateUniqueUsername(base) {
  for (let suffix = 1; suffix <= 9999; suffix += 1) {
    const candidate = withUsernameSuffix(base, suffix);
    if (validateUsername(candidate)) continue;
    if (!(await isUsernameTaken(candidate))) {
      return candidate;
    }
  }
  throw new Error("Could not allocate a unique username.");
}

export async function backfillMissingUsernames() {
  const rows = await getUsersMissingUsername();
  let updated = 0;

  for (const row of rows) {
    const base = deriveUsernameFromEmail(row.email);
    const username = await allocateUniqueUsername(base);
    await query(`UPDATE users SET username = $1 WHERE id = $2`, [username, row.id]);
    updated += 1;
  }

  return updated;
}

export async function createUser({ id, name, username, email, password }) {
  const result = await query(
    `INSERT INTO users (id, name, username, email, password)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, username, email`,
    [id, name, username, email, password]
  );
  return result.rows[0];
}

export async function updateUserUsername(userId, username) {
  const result = await query(
    `UPDATE users SET username = $1 WHERE id = $2
     RETURNING ${USER_PUBLIC_FIELDS}`,
    [username, userId]
  );
  return result.rows[0] ?? null;
}

export async function updateUserProfile(userId, avatar) {
  const result = await query(
    `UPDATE users
     SET avatar_type = $1, avatar_color = $2, avatar_flag = $3, avatar_image = $4
     WHERE id = $5
     RETURNING ${USER_PUBLIC_FIELDS}`,
    [avatar.type, avatar.color, avatar.flag, avatar.image, userId]
  );
  return result.rows[0] ?? null;
}

export async function getUserGameTourCompleted(userId) {
  const result = await query(
    `SELECT game_tour_completed_at IS NOT NULL AS completed
     FROM users WHERE id = $1`,
    [userId]
  );
  return Boolean(result.rows[0]?.completed);
}

export async function markUserGameTourCompleted(userId) {
  await query(
    `UPDATE users
     SET game_tour_completed_at = COALESCE(game_tour_completed_at, NOW())
     WHERE id = $1`,
    [userId]
  );
}

export async function searchUsersByUsernamePrefix(prefix, { excludeUserId, limit = 20 } = {}) {
  const params = [`${prefix}%`];
  let sql = `
    SELECT id, username, name
    FROM users
    WHERE username LIKE $1`;

  if (excludeUserId) {
    params.push(excludeUserId);
    sql += ` AND id <> $${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY username ASC LIMIT $${params.length}`;

  const result = await query(sql, params);
  return result.rows;
}

export async function getFriendsForUser(userId) {
  const result = await query(
    `SELECT u.id, u.username, u.name, f.created_at AS "friendedAt"
     FROM user_friends f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getFriendIdsForUser(userId) {
  const result = await query(
    `SELECT friend_id AS "friendId" FROM user_friends WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map((row) => row.friendId);
}

export async function areUsersFriends(userId, otherUserId) {
  const result = await query(
    `SELECT id FROM user_friends
     WHERE (user_id = $1 AND friend_id = $2)
        OR (user_id = $2 AND friend_id = $1)
     LIMIT 1`,
    [userId, otherUserId]
  );
  return result.rows.length > 0;
}

async function ensureMutualFriendship(userId, friendId) {
  for (const [ownerId, targetId] of [
    [userId, friendId],
    [friendId, userId],
  ]) {
    const existing = await query(
      `SELECT id FROM user_friends WHERE user_id = $1 AND friend_id = $2 LIMIT 1`,
      [ownerId, targetId]
    );
    if (existing.rows.length === 0) {
      await query(
        `INSERT INTO user_friends (id, user_id, friend_id)
         VALUES ($1, $2, $3)`,
        [randomUUID(), ownerId, targetId]
      );
    }
  }
}

export const FRIEND_REQUEST_DECLINE_COOLDOWN_DAYS = 7;

function getDeclineCooldownDaysRemaining(respondedAt) {
  const cooldownEndsAt =
    new Date(respondedAt).getTime() +
    FRIEND_REQUEST_DECLINE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const msRemaining = cooldownEndsAt - Date.now();
  if (msRemaining <= 0) return 0;
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

export async function createFriendRequest(fromUserId, toUserId) {
  if (fromUserId === toUserId) {
    throw new Error("Cannot send a friend request to yourself.");
  }

  const target = await getUserById(toUserId);
  if (!target) {
    return null;
  }

  if (await areUsersFriends(fromUserId, toUserId)) {
    return { target, created: false, reason: "already_friends" };
  }

  const pending = await query(
    `SELECT id, from_user_id AS "fromUserId", to_user_id AS "toUserId"
     FROM friend_requests
     WHERE status = 'pending'
       AND (
         (from_user_id = $1 AND to_user_id = $2)
         OR (from_user_id = $2 AND to_user_id = $1)
       )
     LIMIT 1`,
    [fromUserId, toUserId]
  );

  if (pending.rows.length > 0) {
    const row = pending.rows[0];
    if (row.fromUserId === fromUserId) {
      return { target, created: false, reason: "already_requested" };
    }
    return { target, created: false, reason: "incoming_request" };
  }

  const recentDecline = await query(
    `SELECT responded_at AS "respondedAt"
     FROM friend_requests
     WHERE from_user_id = $1
       AND to_user_id = $2
       AND status = 'declined'
       AND responded_at > NOW() - ($3::int * INTERVAL '1 day')
     ORDER BY responded_at DESC
     LIMIT 1`,
    [fromUserId, toUserId, FRIEND_REQUEST_DECLINE_COOLDOWN_DAYS]
  );

  if (recentDecline.rows.length > 0) {
    const daysRemaining = getDeclineCooldownDaysRemaining(
      recentDecline.rows[0].respondedAt
    );
    return {
      target,
      created: false,
      reason: "decline_cooldown",
      daysRemaining: Math.max(daysRemaining, 1),
    };
  }

  const reactivated = await query(
    `UPDATE friend_requests
     SET status = 'pending',
         responded_at = NULL,
         created_at = NOW()
     WHERE from_user_id = $1
       AND to_user_id = $2
       AND status = 'declined'
       AND responded_at <= NOW() - ($3::int * INTERVAL '1 day')
     RETURNING id`,
    [fromUserId, toUserId, FRIEND_REQUEST_DECLINE_COOLDOWN_DAYS]
  );

  if (reactivated.rows.length > 0) {
    return { target, created: true, reactivated: true };
  }

  await query(
    `INSERT INTO friend_requests (id, from_user_id, to_user_id)
     VALUES ($1, $2, $3)`,
    [randomUUID(), fromUserId, toUserId]
  );

  return { target, created: true };
}

export async function getPendingFriendRequestsForUser(userId) {
  const result = await query(
    `SELECT r.id,
            r.created_at AS "requestedAt",
            u.id AS "fromUserId",
            u.username,
            u.name
     FROM friend_requests r
     JOIN users u ON u.id = r.from_user_id
     WHERE r.to_user_id = $1
       AND r.status = 'pending'
     ORDER BY r.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getOutgoingFriendRequestsForUser(userId) {
  const result = await query(
    `SELECT r.id,
            r.created_at AS "requestedAt",
            u.id AS "toUserId",
            u.username,
            u.name
     FROM friend_requests r
     JOIN users u ON u.id = r.to_user_id
     WHERE r.from_user_id = $1
       AND r.status = 'pending'
     ORDER BY r.created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getOutgoingFriendRequestUserIds(userId) {
  const requests = await getOutgoingFriendRequestsForUser(userId);
  return requests.map((row) => row.toUserId);
}

export async function acceptFriendRequest(requestId, userId) {
  const requestResult = await query(
    `SELECT id,
            from_user_id AS "fromUserId",
            to_user_id AS "toUserId",
            status
     FROM friend_requests
     WHERE id = $1
     LIMIT 1`,
    [requestId]
  );

  const request = requestResult.rows[0];
  if (!request || request.toUserId !== userId || request.status !== "pending") {
    return null;
  }

  await query(
    `UPDATE friend_requests
     SET status = 'accepted', responded_at = NOW()
     WHERE id = $1`,
    [requestId]
  );

  await ensureMutualFriendship(request.fromUserId, request.toUserId);

  const friend = await getUserById(request.fromUserId);
  return { requestId, friend };
}

export async function declineFriendRequest(requestId, userId) {
  const result = await query(
    `UPDATE friend_requests
     SET status = 'declined',
         responded_at = NOW()
     WHERE id = $1
       AND to_user_id = $2
       AND status = 'pending'
     RETURNING id`,
    [requestId, userId]
  );

  return result.rows[0] ?? null;
}

export async function getUsersMissingUsername() {
  const result = await query(
    `SELECT id, email FROM users WHERE username IS NULL OR username = ''`
  );
  return result.rows;
}

export async function getCountryStatsForUsers(userIds) {
  if (!userIds || userIds.length === 0) return [];
  const result = await query(
    `SELECT user_id AS "userId",
            country_id AS "countryId",
            mode,
            level,
            first_try_correct AS "firstTryCorrect",
            second_try_correct AS "secondTryCorrect",
            needed_reveal AS "neededReveal",
            incorrect,
            mastery_score AS "masteryScore",
            graduated,
            last_attempt_at AS "lastAttemptAt",
            last_outcome AS "lastOutcome",
            last_correct_at AS "lastCorrectAt",
            last_correct_session AS "lastCorrectSession",
            skill_domain AS "skillDomain"
     FROM country_stats
     WHERE user_id = ANY($1)`,
    [userIds]
  );
  return result.rows;
}

export async function getPracticeSessionCountsForUsers(userIds) {
  if (!userIds || userIds.length === 0) return [];
  const result = await query(
    `SELECT user_id AS "userId",
            COUNT(*)::int AS "allTime",
            COUNT(*) FILTER (
              WHERE practiced_at >= date_trunc('week', CURRENT_DATE)
            )::int AS "week"
     FROM practice_sessions
     WHERE user_id = ANY($1)
     GROUP BY user_id`,
    [userIds]
  );
  return result.rows;
}

export async function getStreaksForUsers(userIds) {
  if (!userIds || userIds.length === 0) return [];
  // Gaps-and-islands, partitioned per user (see getStreakForUser).
  const result = await query(
    `WITH days AS (
       SELECT DISTINCT user_id, practiced_at
       FROM practice_sessions
       WHERE user_id = ANY($1)
     ),
     grouped AS (
       SELECT
         user_id,
         practiced_at,
         practiced_at - (
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY practiced_at)
         )::int AS grp
       FROM days
     ),
     runs AS (
       SELECT user_id, COUNT(*)::int AS length, MAX(practiced_at) AS end_date
       FROM grouped
       GROUP BY user_id, grp
     )
     SELECT
       user_id AS "userId",
       COALESCE(
         MAX(length) FILTER (WHERE end_date >= CURRENT_DATE - 1),
         0
       ) AS "currentStreak"
     FROM runs
     GROUP BY user_id`,
    [userIds]
  );
  return result.rows;
}

export async function getScoresForUser(userId) {
  const result = await query(
    `SELECT id, mode, region, level, score, updated_at AS "updatedAt", created_at AS "createdAt"
     FROM game_scores
     WHERE user_id = $1
     ORDER BY mode, region, level`,
    [userId]
  );
  return result.rows;
}

export async function getScoreForGame(userId, mode, region, level) {
  const result = await query(
    `SELECT id, score FROM game_scores
     WHERE user_id = $1 AND mode = $2 AND region = $3 AND level = $4`,
    [userId, mode, region, level]
  );
  return result.rows[0] ?? null;
}

export async function upsertScore({ id, userId, mode, region, level, score }) {
  const result = await query(
    `INSERT INTO game_scores (id, user_id, mode, region, level, score)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, mode, region, level)
     DO UPDATE SET score = EXCLUDED.score, updated_at = NOW()
     RETURNING id, mode, region, level, score, updated_at AS "updatedAt"`,
    [id, userId, mode, region, level, score]
  );
  return result.rows[0];
}


export async function recordPracticeSession(userId) {
  const result = await query(
    `INSERT INTO practice_sessions (id, user_id, practiced_at)
     VALUES ($1, $2, CURRENT_DATE)
     ON CONFLICT (user_id, practiced_at) DO NOTHING`,
    [randomUUID(), userId]
  );
  return { recorded: result.rowCount > 0 };
}

export async function getUserTotalSessions(userId) {
  const result = await query(
    `SELECT COALESCE(total_sessions, 0) AS "totalSessions"
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return Number(result.rows[0]?.totalSessions) || 0;
}

// incrementSessionCount(userId)
// Increments users.total_sessions by 1
// atomically and returns the new value.
// Returns: number (the new total_sessions)
export async function incrementSessionCount(userId) {
  const result = await query(
    `UPDATE users
     SET total_sessions = total_sessions + 1
     WHERE id = $1
     RETURNING total_sessions`,
    [userId]
  );
  return result.rows[0]?.total_sessions ?? 1;
}

export async function getStreakForUser(userId) {
  // Gaps-and-islands: each consecutive run of days collapses to a single
  // group because (practiced_at - row_number) stays constant within a run.
  const result = await query(
    `WITH days AS (
       SELECT DISTINCT practiced_at
       FROM practice_sessions
       WHERE user_id = $1
     ),
     grouped AS (
       SELECT
         practiced_at,
         practiced_at - (ROW_NUMBER() OVER (ORDER BY practiced_at))::int AS grp
       FROM days
     ),
     runs AS (
       SELECT
         COUNT(*)::int AS length,
         MAX(practiced_at) AS end_date
       FROM grouped
       GROUP BY grp
     )
     SELECT
       COALESCE(MAX(length), 0) AS "longestStreak",
       COALESCE(
         MAX(length) FILTER (WHERE end_date >= CURRENT_DATE - 1),
         0
       ) AS "currentStreak"
     FROM runs`,
    [userId]
  );

  const row = result.rows[0] ?? { currentStreak: 0, longestStreak: 0 };
  return {
    currentStreak: Number(row.currentStreak) || 0,
    longestStreak: Number(row.longestStreak) || 0,
  };
}

const OUTCOME_COLUMNS = new Set([
  "first_try_correct",
  "second_try_correct",
  "needed_reveal",
  "incorrect",
]);

const STAT_RETURNING = `
  country_id AS "countryId",
  mode,
  level,
  first_try_correct AS "firstTryCorrect",
  second_try_correct AS "secondTryCorrect",
  needed_reveal AS "neededReveal",
  incorrect,
  response_time_ms_sum AS "responseTimeMsSum",
  response_time_count AS "responseTimeCount",
  mastery_score AS "masteryScore",
  fast_streak AS "fastStreak",
  speed_baseline_ms AS "speedBaselineMs",
  graduated,
  last_attempt_at AS "lastAttemptAt",
  last_outcome AS "lastOutcome",
  last_correct_at AS "lastCorrectAt",
  last_correct_session AS "lastCorrectSession",
  skill_domain AS "skillDomain"
`;

export async function getCountryStatsForUser(userId, { mode } = {}) {
  const conditions = ["user_id = $1"];
  const params = [userId];

  if (mode) {
    params.push(mode);
    conditions.push(`mode = $${params.length}`);
  }

  const result = await query(
    `SELECT ${STAT_RETURNING}
     FROM country_stats
     WHERE ${conditions.join(" AND ")}`,
    params
  );
  return result.rows;
}

export async function recordCountryPerformance({
  statId,
  attemptId,
  userId,
  countryId,
  mode,
  level,
  gameType,
  outcome,
  responseTimeMs = null,
  learnModeMultiplier = 1,
  questionTier = null,
  predictedSuccess = null,
  questionType = null,
  currentSessionNumber = null,
}) {
  // Whitelist the outcome before using it as a column name, since it is
  // interpolated into the SQL below rather than passed as a bound parameter.
  if (!OUTCOME_COLUMNS.has(outcome)) {
    throw new Error(`Invalid outcome: ${outcome}`);
  }
  const column = outcome;
  const questionTypeId =
    typeof questionType === "string" && questionType.trim()
      ? questionType.trim()
      : null;
  const skillDomain = resolveSkillDomain({ questionType: questionTypeId, mode });
  const isLearn = gameType === "learning";
  const contributionRate = isLearn ? getLearnContributionRate(skillDomain) : 1;
  const learnFactor =
    Number.isFinite(learnModeMultiplier) && learnModeMultiplier >= 0
      ? learnModeMultiplier * contributionRate
      : contributionRate;
  const levelGain = getLevelGainMultiplier(level, gameType);
  const gainMultiplier = learnFactor * levelGain;
  const penaltyMultiplier = learnFactor;

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = await pool.connect();
  const trackResponseTime = responseTimeMs != null && outcome !== "needed_reveal";

  async function upsertStatRow(rowId, domain) {
    const existingResult = await client.query(
      `SELECT country_id AS "countryId",
              first_try_correct AS "firstTryCorrect",
              second_try_correct AS "secondTryCorrect",
              needed_reveal AS "neededReveal",
              incorrect,
              response_time_ms_sum AS "responseTimeMsSum",
              response_time_count AS "responseTimeCount",
              mastery_score AS "masteryScore",
              fast_streak AS "fastStreak",
              speed_baseline_ms AS "speedBaselineMs",
              graduated,
              skill_domain AS "skillDomain"
       FROM country_stats
       WHERE user_id = $1 AND country_id = $2 AND mode = $3
         AND skill_domain = $4
       FOR UPDATE`,
      [userId, countryId, mode, domain]
    );

    const existing = existingResult.rows[0] ?? null;
    const previousMasteryScore = existing ? getDecayAdjustedMastery(existing) : 0;
    const previousGraduated = existing ? isEffectivelyGraduated(existing) : false;
    const masteryFields = computeMasteryUpdate(existing, {
      outcome,
      responseTimeMs: trackResponseTime ? responseTimeMs : null,
      gameType,
      gainMultiplier,
      penaltyMultiplier,
    });

    const sessionNumber =
      Number.isInteger(currentSessionNumber) && currentSessionNumber >= 0
        ? currentSessionNumber
        : null;

    const params = [
      rowId,
      userId,
      countryId,
      mode,
      level,
      masteryFields.masteryScore,
      masteryFields.fastStreak,
      masteryFields.speedBaselineMs,
      masteryFields.graduated,
      outcome,
      domain,
      sessionNumber,
    ];

    let responseTimeSumValue = "0";
    let responseTimeCountValue = "0";
    let responseTimeUpdate = "";

    if (trackResponseTime) {
      params.push(responseTimeMs);
      responseTimeSumValue = `$${params.length}`;
      responseTimeCountValue = "1";
      responseTimeUpdate = `,
        response_time_ms_sum = country_stats.response_time_ms_sum + $${params.length},
        response_time_count = country_stats.response_time_count + 1`;
    }

    const result = await client.query(
      `INSERT INTO country_stats (
         id, user_id, country_id, mode, level,
         ${column},
         response_time_ms_sum,
         response_time_count,
         mastery_score,
         fast_streak,
         speed_baseline_ms,
         graduated,
         last_attempt_at,
         last_outcome,
         skill_domain,
         last_correct_at,
         last_correct_session
       )
       VALUES (
         $1, $2, $3, $4, $5,
         1,
         ${responseTimeSumValue},
         ${responseTimeCountValue},
         $6, $7, $8, $9, NOW(), $10, $11,
         CASE WHEN $10 IN ('first_try_correct', 'second_try_correct') THEN NOW() ELSE NULL END,
         CASE WHEN $10 IN ('first_try_correct', 'second_try_correct') THEN $12::integer ELSE NULL::integer END
       )
       ON CONFLICT (user_id, country_id, mode, skill_domain)
       DO UPDATE SET
         ${column} = country_stats.${column} + 1
         ${responseTimeUpdate},
         level = $5,
         mastery_score = $6,
         fast_streak = $7,
         speed_baseline_ms = $8,
         graduated = $9,
         last_attempt_at = NOW(),
         last_outcome = $10,
         last_correct_at = CASE
           WHEN $10 IN ('first_try_correct', 'second_try_correct') THEN NOW()
           ELSE country_stats.last_correct_at
         END,
         last_correct_session = CASE
           WHEN $10 IN ('first_try_correct', 'second_try_correct') THEN $12::integer
           ELSE country_stats.last_correct_session
         END,
         updated_at = NOW()
       RETURNING ${STAT_RETURNING}`,
      params
    );

    return {
      ...result.rows[0],
      previousMasteryScore,
      previousGraduated,
    };
  }

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO country_attempts (
         id, user_id, country_id, mode, level, game_type, outcome, response_time_ms,
         question_tier, predicted_success, question_type_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        attemptId,
        userId,
        countryId,
        mode,
        level,
        gameType,
        outcome,
        trackResponseTime ? responseTimeMs : null,
        questionTier,
        predictedSuccess != null && Number.isFinite(predictedSuccess)
          ? predictedSuccess
          : null,
        questionTypeId,
      ]
    );

    const domainStat = await upsertStatRow(statId, skillDomain);
    const generalStat =
      skillDomain === "general"
        ? domainStat
        : await upsertStatRow(randomUUID(), "general");

    await client.query("COMMIT");
    return {
      ...generalStat,
      domainStat,
      skillDomain,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ── Learn mode: seen-fact tracking ───────────────────────────────────────────

/**
 * Returns a Map of countryId -> number[] (seen fact indices) for the given user,
 * limited to `countryIds` when provided (otherwise all of the user's rows).
 */
export async function getSeenFactIndices(userId, countryIds = null) {
  const hasFilter = Array.isArray(countryIds) && countryIds.length > 0;
  const result = await query(
    `SELECT country_id AS "countryId", fact_index AS "factIndex"
     FROM facts_seen
     WHERE user_id = $1 ${hasFilter ? "AND country_id = ANY($2)" : ""}`,
    hasFilter ? [userId, countryIds] : [userId]
  );

  const byCountry = new Map();
  for (const row of result.rows) {
    if (!byCountry.has(row.countryId)) byCountry.set(row.countryId, []);
    byCountry.get(row.countryId).push(row.factIndex);
  }
  return byCountry;
}

/** Records that a user has seen a country's fact (idempotent per fact). */
export async function recordFactSeen(userId, countryId, factIndex) {
  await query(
    `INSERT INTO facts_seen (id, user_id, country_id, fact_index)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, country_id, fact_index) DO NOTHING`,
    [randomUUID(), userId, countryId, factIndex]
  );
}

/**
 * Wipe all practice / mastery / score history for a user.
 * Keeps the account itself (profile, friends, auth).
 */
export async function deleteUserPracticeData(userId) {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM country_attempts WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM country_stats WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM game_scores WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM facts_seen WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM practice_sessions WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM learn_challenge WHERE user_id = $1`, [userId]);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * deprecated — superseded by per-country EMA tier selection.
 * @returns {{ workingTier: number, momentum: number, recentOutcomes: object[] }}
 */
export async function getLearnChallenge(userId, { mode, region }) {
  const result = await query(
    `SELECT working_tier AS "workingTier",
            momentum,
            recent_outcomes AS "recentOutcomes",
            updated_at AS "updatedAt"
     FROM learn_challenge
     WHERE user_id = $1 AND mode = $2 AND region = $3`,
    [userId, mode, region]
  );
  const row = result.rows[0];
  if (!row) {
    return {
      workingTier: 4,
      momentum: 0,
      recentOutcomes: [],
      updatedAt: null,
    };
  }
  return {
    workingTier: Number(row.workingTier) || 4,
    momentum: Number(row.momentum) || 0,
    recentOutcomes: Array.isArray(row.recentOutcomes) ? row.recentOutcomes : [],
    updatedAt: row.updatedAt ?? null,
  };
}

/**
 * deprecated — superseded by per-country EMA tier selection.
 * Upsert adaptive Learn challenge for a user × mode × region.
 */
export async function upsertLearnChallenge(
  userId,
  { mode, region, workingTier, momentum, recentOutcomes }
) {
  const outcomesJson = JSON.stringify(
    Array.isArray(recentOutcomes) ? recentOutcomes : []
  );
  const result = await query(
    `INSERT INTO learn_challenge (
       user_id, mode, region, working_tier, momentum, recent_outcomes, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
     ON CONFLICT (user_id, mode, region) DO UPDATE SET
       working_tier = EXCLUDED.working_tier,
       momentum = EXCLUDED.momentum,
       recent_outcomes = EXCLUDED.recent_outcomes,
       updated_at = NOW()
     RETURNING working_tier AS "workingTier",
               momentum,
               recent_outcomes AS "recentOutcomes",
               updated_at AS "updatedAt"`,
    [
      userId,
      mode,
      region,
      workingTier,
      momentum,
      outcomesJson,
    ]
  );
  const row = result.rows[0];
  return {
    workingTier: Number(row.workingTier) || 4,
    momentum: Number(row.momentum) || 0,
    recentOutcomes: Array.isArray(row.recentOutcomes) ? row.recentOutcomes : [],
    updatedAt: row.updatedAt ?? null,
  };
}

// ── Subscription / free Learn quota ─────────────────────────────────────────

const USER_BILLING_FIELDS = `
  id, email, timezone,
  stripe_customer_id AS "stripeCustomerId",
  stripe_subscription_id AS "stripeSubscriptionId",
  subscription_status AS "subscriptionStatus",
  subscription_current_period_end AS "subscriptionCurrentPeriodEnd"
`;

export async function getUserBillingState(userId) {
  const result = await query(
    `SELECT ${USER_BILLING_FIELDS} FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

// Caller must validate `timeZone` (isValidTimeZone) — it is client-reported.
export async function setUserTimezone(userId, timeZone) {
  await query(
    `UPDATE users SET timezone = $2 WHERE id = $1 AND timezone IS DISTINCT FROM $2`,
    [userId, timeZone]
  );
}

/**
 * Stores `customerId` only if the user has none yet, then returns whichever id
 * is stored (so a concurrent checkout can't leave two customers attached).
 */
export async function claimStripeCustomerId(userId, customerId) {
  await query(
    `UPDATE users SET stripe_customer_id = $2
     WHERE id = $1 AND stripe_customer_id IS NULL`,
    [userId, customerId]
  );
  const result = await query(`SELECT stripe_customer_id FROM users WHERE id = $1`, [userId]);
  return result.rows[0]?.stripe_customer_id ?? null;
}

/**
 * Idempotent sync of one subscription's state onto its customer's user row.
 * Safe to replay: the same subscription always writes the same values. A stale
 * event for an older subscription can't clobber a newer one — it only applies
 * when the row has no subscription yet, already points at this one, or this
 * one is the live (active/trialing) subscription.
 * @returns {Promise<boolean>} whether a user row was updated
 */
export async function syncUserSubscription({
  customerId,
  userId = null,
  subscriptionId,
  status,
  currentPeriodEnd,
}) {
  const result = await query(
    `UPDATE users SET
       stripe_customer_id = COALESCE(stripe_customer_id, $1),
       stripe_subscription_id = $3,
       subscription_status = $4,
       subscription_current_period_end = $5
     WHERE (stripe_customer_id = $1 OR (stripe_customer_id IS NULL AND id = $2))
       AND (
         stripe_subscription_id IS NULL
         OR stripe_subscription_id = $3
         OR $4 IN ('active', 'trialing')
       )`,
    [customerId, userId, subscriptionId, status ?? null, currentPeriodEnd ?? null]
  );
  return result.rowCount > 0;
}

function mapDailyUsage(row, localDate) {
  return {
    usageDate: localDate,
    sessionCount: Number(row?.session_count ?? 0),
  };
}

/** Today's usage row for `localDate` (YYYY-MM-DD), created at 0 if missing. */
export async function getOrCreateDailyUsage(userId, localDate) {
  const result = await query(
    `INSERT INTO daily_learn_usage (user_id, usage_date, session_count)
     VALUES ($1, $2, 0)
     ON CONFLICT (user_id, usage_date)
       DO UPDATE SET session_count = daily_learn_usage.session_count
     RETURNING session_count`,
    [userId, localDate]
  );
  return mapDailyUsage(result.rows[0], localDate);
}

/**
 * Atomically adds one session to `localDate`. With `maxCount`, the increment
 * only happens while the stored count is below it, so two concurrent starts
 * can't both slip past the free cap; returns `null` when the cap blocked it.
 */
export async function incrementDailyUsage(userId, localDate, { maxCount = null } = {}) {
  const result = await query(
    `INSERT INTO daily_learn_usage (user_id, usage_date, session_count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, usage_date)
       DO UPDATE SET session_count = daily_learn_usage.session_count + 1,
                     updated_at = NOW()
       WHERE $3::int IS NULL OR daily_learn_usage.session_count < $3::int
     RETURNING session_count`,
    [userId, localDate, maxCount]
  );
  if (result.rows.length === 0) return null;
  return mapDailyUsage(result.rows[0], localDate);
}
