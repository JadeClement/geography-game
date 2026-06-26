import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { createUser, getUserByEmail } from "@/lib/db";
import { isRateLimited, recordRateLimitEvent } from "@/lib/rate-limit";
import { issueVerificationEmail } from "@/lib/verification";
import { isValidEmail, normalizeEmail, validatePassword } from "@/lib/validation";

const SUCCESS_MESSAGE =
  "If this email is not already registered, we've created your account and sent a verification link.";

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
    const name = body.name?.trim();
    const email = normalizeEmail(body.email);
    const password = body.password;

    if (!name || !email || !password) {
      return Response.json(
        { error: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return Response.json({ error: passwordError }, { status: 400 });
    }

    const emailKey = `register:email:${email}`;
    const ip = getClientIp(request);
    const ipKey = `register:ip:${ip}`;

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

    await Promise.all([recordRateLimitEvent(emailKey), recordRateLimitEvent(ipKey)]);

    const hashedPassword = await bcrypt.hash(password, 12);
    const existing = await getUserByEmail(email);

    if (existing) {
      return Response.json({ message: SUCCESS_MESSAGE });
    }

    const user = await createUser({
      id: randomUUID(),
      name,
      email,
      password: hashedPassword,
    });

    try {
      await issueVerificationEmail({ user, request });
    } catch (emailError) {
      console.error("Verification email error:", emailError);
    }

    return Response.json({ message: SUCCESS_MESSAGE });
  } catch (error) {
    console.error("Registration error:", error);
    if (error.message?.includes("DATABASE_URL")) {
      return Response.json({ error: "Database is not configured." }, { status: 503 });
    }
    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      return Response.json(
        {
          error:
            "Cannot reach the database. For local development, use your Postgres public URL in .env (not postgres.railway.internal).",
        },
        { status: 503 }
      );
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
