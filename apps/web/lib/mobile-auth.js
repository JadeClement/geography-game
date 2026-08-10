import { randomUUID } from "crypto";
import { query } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/auth-tokens";

const MOBILE_TOKEN_TTL_DAYS = 90;

const MOBILE_USER_FIELDS = `
  id, name, username, email, email_verified_at AS "emailVerifiedAt",
  avatar_type AS "avatarType", avatar_color AS "avatarColor",
  avatar_flag AS "avatarFlag"
`;

/**
 * Serialize a DB user row into the mobile auth response shape (never includes password).
 */
export function serializeMobileUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    avatarType: user.avatarType ?? "color",
    avatarColor: user.avatarColor ?? null,
    avatarFlag: user.avatarFlag ?? null,
  };
}

/**
 * Issue a new mobile Bearer token for a user. Stores the SHA-256 hash and expiry.
 * @returns {{ token: string, expiresAt: string }}
 */
export async function issueMobileToken(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(
    Date.now() + MOBILE_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await query(
    `UPDATE users
     SET mobile_token_hash = $1,
         mobile_token_expires_at = $2
     WHERE id = $3`,
    [tokenHash, expiresAt.toISOString(), userId]
  );

  return { token, expiresAt: expiresAt.toISOString() };
}

export async function clearMobileToken(userId) {
  await query(
    `UPDATE users
     SET mobile_token_hash = NULL,
         mobile_token_expires_at = NULL
     WHERE id = $1`,
    [userId]
  );
}

/**
 * getMobileSession(request) → { user } | null
 * Reads Authorization: Bearer <token>, hashes it, looks up a non-expired user.
 */
export async function getMobileSession(request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  if (!token) return null;

  const tokenHash = hashToken(token);
  const result = await query(
    `SELECT ${MOBILE_USER_FIELDS}
     FROM users
     WHERE mobile_token_hash = $1
       AND mobile_token_expires_at IS NOT NULL
       AND mobile_token_expires_at > NOW()`,
    [tokenHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  return { user: serializeMobileUser(row) };
}

export async function upsertPushToken({ userId, token, platform }) {
  await query(
    `INSERT INTO push_tokens (id, user_id, token, platform)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, platform)
     DO UPDATE SET token = EXCLUDED.token, updated_at = NOW()`,
    [randomUUID(), userId, token, platform]
  );
}
