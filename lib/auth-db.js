import { randomUUID } from "crypto";
import { query } from "./db.js";
import { hashToken } from "./auth-tokens.js";

const TOKEN_TYPES = {
  EMAIL_VERIFICATION: "email_verification",
  PASSWORD_RESET: "password_reset",
};

export { TOKEN_TYPES };

export async function getUserVerificationStatus(userId) {
  const result = await query(
    `SELECT email_verified_at AS "emailVerifiedAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function markEmailVerified(userId) {
  await query(
    `UPDATE users SET email_verified_at = NOW() WHERE id = $1 AND email_verified_at IS NULL`,
    [userId]
  );
}

export async function createAuthToken({ userId, type, rawToken, expiresInMs }) {
  const id = randomUUID();
  const tokenHash = hashToken(rawToken);
  const result = await query(
    `INSERT INTO auth_tokens (id, user_id, token_hash, type, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 millisecond'))
     RETURNING id, expires_at AS "expiresAt"`,
    [id, userId, tokenHash, type, expiresInMs]
  );
  return result.rows[0];
}

export async function findAuthToken({ rawToken, type }) {
  const tokenHash = hashToken(rawToken);
  const result = await query(
    `SELECT t.id, t.user_id AS "userId", t.type, t.expires_at AS "expiresAt",
            t.used_at AS "usedAt", u.email, u.name, u.email_verified_at AS "emailVerifiedAt"
     FROM auth_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.type = $2`,
    [tokenHash, type]
  );
  return result.rows[0] ?? null;
}

export async function findValidAuthToken({ rawToken, type }) {
  const authToken = await findAuthToken({ rawToken, type });
  if (!authToken || authToken.usedAt || new Date(authToken.expiresAt) <= new Date()) {
    return null;
  }
  return authToken;
}

export async function markAuthTokenUsed(tokenId) {
  await query(
    `UPDATE auth_tokens SET used_at = NOW() WHERE id = $1`,
    [tokenId]
  );
}

export async function invalidateAuthTokensForUser(userId, type) {
  await query(
    `UPDATE auth_tokens
     SET used_at = NOW()
     WHERE user_id = $1 AND type = $2 AND used_at IS NULL`,
    [userId, type]
  );
}

export async function countRecentAuthTokens({ userId, type, windowMs }) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM auth_tokens
     WHERE user_id = $1
       AND type = $2
       AND created_at > NOW() - ($3 * INTERVAL '1 millisecond')`,
    [userId, type, windowMs]
  );
  return result.rows[0]?.count ?? 0;
}

export async function getLatestAuthTokenCreatedAt({ userId, type }) {
  const result = await query(
    `SELECT created_at AS "createdAt"
     FROM auth_tokens
     WHERE user_id = $1 AND type = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, type]
  );
  return result.rows[0] ?? null;
}

export async function updateUserPassword(userId, hashedPassword) {
  await query(`UPDATE users SET password = $1 WHERE id = $2`, [hashedPassword, userId]);
}

export async function getUserByEmailWithVerification(email) {
  const result = await query(
    `SELECT id, name, email, password, email_verified_at AS "emailVerifiedAt"
     FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}
