import { hashToken } from "@/lib/auth-tokens";
import {
  BIOMETRIC_REFRESH_GRACE_DAYS,
  issueMobileToken,
  serializeMobileUser,
} from "@/lib/mobile-auth";
import { query } from "@/lib/db";
import { isRateLimited, recordRateLimitEvent } from "@/lib/rate-limit";

const RATE_LIMIT = { max: 3, windowMs: 60 * 60 * 1000 };

const USER_FIELDS = `
  id, name, username, email, email_verified_at AS "emailVerifiedAt",
  avatar_type AS "avatarType", avatar_color AS "avatarColor",
  avatar_flag AS "avatarFlag"
`;

/**
 * POST { expiredToken }
 * Re-issues a mobile token after Face ID without storing a password.
 * Accepts a token that has expired but is still within
 * BIOMETRIC_REFRESH_GRACE_DAYS of its own expiry. Password reset nulls the
 * hash, so this grace does not keep a reset account signed in.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const expiredToken = body?.expiredToken;
    if (!expiredToken || typeof expiredToken !== "string") {
      return Response.json({ error: "Token required." }, { status: 400 });
    }

    const tokenHash = hashToken(expiredToken);
    const result = await query(
      `SELECT ${USER_FIELDS}
       FROM users
       WHERE mobile_token_hash = $1
         AND mobile_token_expires_at IS NOT NULL
         AND mobile_token_expires_at > NOW() - ($2::int * INTERVAL '1 day')`,
      [tokenHash, BIOMETRIC_REFRESH_GRACE_DAYS]
    );

    const user = result.rows[0];
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateKey = `mobile-biometric:${user.id}`;
    if (await isRateLimited(rateKey, RATE_LIMIT)) {
      return Response.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
    await recordRateLimitEvent(rateKey);

    const { token, expiresAt } = await issueMobileToken(user.id);

    return Response.json({
      token,
      expiresAt,
      user: serializeMobileUser(user),
    });
  } catch (error) {
    console.error("Biometric refresh error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
