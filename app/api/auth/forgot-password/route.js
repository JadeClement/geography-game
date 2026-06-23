import { getUserByEmailWithVerification } from "@/lib/auth-db";
import { issuePasswordResetEmail } from "@/lib/password-reset";
import { isRateLimited, recordRateLimitEvent } from "@/lib/rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

const SUCCESS_MESSAGE =
  "If an account exists for that email, we've sent a reset link.";

const RATE_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);

    if (!email || !isValidEmail(email)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const emailKey = `forgot-password:email:${email}`;
    const ip = getClientIp(request);
    const ipKey = `forgot-password:ip:${ip}`;

    const [emailLimited, ipLimited] = await Promise.all([
      isRateLimited(emailKey, RATE_LIMIT),
      isRateLimited(ipKey, RATE_LIMIT),
    ]);

    if (emailLimited || ipLimited) {
      return Response.json(
        { error: "Too many requests. Please try again in a few minutes." },
        { status: 429 }
      );
    }

    await Promise.all([
      recordRateLimitEvent(emailKey),
      recordRateLimitEvent(ipKey),
    ]);

    const user = await getUserByEmailWithVerification(email);

    if (user?.emailVerifiedAt) {
      await issuePasswordResetEmail({ user, request });
    }

    return Response.json({ message: SUCCESS_MESSAGE });
  } catch (error) {
    console.error("Forgot password error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
