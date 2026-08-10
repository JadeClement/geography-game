import { generateToken } from "./auth-tokens.js";
import {
  TOKEN_TYPES,
  createAuthToken,
  invalidateAuthTokensForUser,
} from "./auth-db.js";
import { sendPasswordResetEmail } from "./email.js";
import { getAppBaseUrl } from "./auth-url.js";

const RESET_EXPIRY_MS = 60 * 60 * 1000;

export async function issuePasswordResetEmail({ user, request }) {
  await invalidateAuthTokensForUser(user.id, TOKEN_TYPES.PASSWORD_RESET);

  const rawToken = generateToken();
  await createAuthToken({
    userId: user.id,
    type: TOKEN_TYPES.PASSWORD_RESET,
    rawToken,
    expiresInMs: RESET_EXPIRY_MS,
  });

  const baseUrl = getAppBaseUrl(request);
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

  return sendPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
  });
}
