import { auth } from "@/auth";
import {
  TOKEN_TYPES,
  countRecentAuthTokens,
  getLatestAuthTokenCreatedAt,
  getUserVerificationStatus,
  markAuthTokenUsed,
  markEmailVerified,
  findValidAuthToken,
} from "@/lib/auth-db";
import { recordRateLimitEvent } from "@/lib/rate-limit";
import { issueVerificationEmail } from "@/lib/verification";

const RESEND_MIN_INTERVAL_MS = 60 * 1000;
const RESEND_DAILY_MAX = 5;
const RESEND_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const status = await getUserVerificationStatus(userId);

    if (status?.emailVerifiedAt) {
      return Response.json({ message: "Email is already verified." });
    }

    const latest = await getLatestAuthTokenCreatedAt({
      userId,
      type: TOKEN_TYPES.EMAIL_VERIFICATION,
    });
    if (latest) {
      const elapsed = Date.now() - new Date(latest.createdAt).getTime();
      if (elapsed < RESEND_MIN_INTERVAL_MS) {
        const waitSeconds = Math.ceil((RESEND_MIN_INTERVAL_MS - elapsed) / 1000);
        return Response.json(
          { error: `Please wait ${waitSeconds} seconds before requesting another email.` },
          { status: 429 }
        );
      }
    }

    const dailyCount = await countRecentAuthTokens({
      userId,
      type: TOKEN_TYPES.EMAIL_VERIFICATION,
      windowMs: RESEND_DAILY_WINDOW_MS,
    });
    if (dailyCount >= RESEND_DAILY_MAX) {
      return Response.json(
        { error: "You've reached the daily limit for verification emails. Try again tomorrow." },
        { status: 429 }
      );
    }

    const user = {
      id: userId,
      email: session.user.email,
      name: session.user.name,
    };

    const result = await issueVerificationEmail({ user, request });
    await recordRateLimitEvent(`verify-resend:${userId}`);

    if (!result.sent) {
      return Response.json(
        { error: "Could not send verification email. Please try again later." },
        { status: 503 }
      );
    }

    return Response.json({ message: "Verification email sent." });
  } catch (error) {
    console.error("Verification resend error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
