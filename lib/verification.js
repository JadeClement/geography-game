import { generateToken } from "./auth-tokens.js";
import {
  TOKEN_TYPES,
  createAuthToken,
  invalidateAuthTokensForUser,
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
