import { generateToken } from "./auth-tokens.js";
import {
  TOKEN_TYPES,
  createAuthToken,
  findAuthToken,
  findValidAuthToken,
  invalidateAuthTokensForUser,
  markAuthTokenUsed,
  markEmailVerified,
} from "./auth-db.js";
import { sendVerificationEmail } from "./email.js";
import { getAppBaseUrl } from "./auth-url.js";

const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export async function issueVerificationEmail({ user, request }) {
  await invalidateAuthTokensForUser(user.id, TOKEN_TYPES.EMAIL_VERIFICATION);

  const rawToken = generateToken();
  await createAuthToken({
    userId: user.id,
    type: TOKEN_TYPES.EMAIL_VERIFICATION,
    rawToken,
    expiresInMs: VERIFICATION_EXPIRY_MS,
  });

  const baseUrl = getAppBaseUrl(request);
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

  return sendVerificationEmail({
    to: user.email,
    name: user.name,
    verifyUrl,
  });
}

/**
 * Consume an email-verification token. Safe to call from a Server Component
 * page load or from the API — returns a ready-to-render result (no client round-trip).
 */
export async function verifyEmailWithToken(rawToken) {
  const token = rawToken?.trim();
  if (!token) {
    return { ok: false, error: "Verification link is missing or invalid." };
  }

  try {
    const authToken = await findValidAuthToken({
      rawToken: token,
      type: TOKEN_TYPES.EMAIL_VERIFICATION,
    });

    if (!authToken) {
      const usedToken = await findAuthToken({
        rawToken: token,
        type: TOKEN_TYPES.EMAIL_VERIFICATION,
      });
      if (usedToken?.emailVerifiedAt) {
        return {
          ok: true,
          alreadyVerified: true,
          message: "Your email is already verified — you're all set!",
        };
      }
      return {
        ok: false,
        error: "This verification link is invalid or has expired.",
      };
    }

    if (authToken.emailVerifiedAt) {
      await markAuthTokenUsed(authToken.id);
      return {
        ok: true,
        alreadyVerified: true,
        message: "Your email is already verified — you're all set!",
      };
    }

    await markEmailVerified(authToken.userId);
    await markAuthTokenUsed(authToken.id);

    return {
      ok: true,
      alreadyVerified: false,
      message: "Thanks for verifying your email!",
    };
  } catch (error) {
    console.error("Email verification error:", error);
    return { ok: false, error: "Something went wrong." };
  }
}
