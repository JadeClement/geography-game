import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import {
  issueMobileToken,
  serializeMobileUser,
} from "@/lib/mobile-auth";
import { isRateLimited, recordRateLimitEvent } from "@/lib/rate-limit";
import { isValidEmail, normalizeEmail } from "@/lib/validation";

const RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 };

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
    const password = body.password;

    if (!email || !isValidEmail(email) || !password) {
      return Response.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const emailKey = `mobile-login:email:${email}`;
    const ip = getClientIp(request);
    const ipKey = `mobile-login:ip:${ip}`;

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

    const user = await getUserByEmail(email);
    if (!user) {
      await recordRateLimitEvent(ipKey);
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await Promise.all([
        recordRateLimitEvent(emailKey),
        recordRateLimitEvent(ipKey),
      ]);
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const { token, expiresAt } = await issueMobileToken(user.id);

    return Response.json({
      token,
      expiresAt,
      user: serializeMobileUser(user),
    });
  } catch (error) {
    console.error("Mobile login error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
