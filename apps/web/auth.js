import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";
import { isRateLimited, recordRateLimitEvent } from "@/lib/rate-limit";

// Brute-force / credential-stuffing protection for the sign-in endpoint.
// Only failed attempts are counted, so a legitimate user is never locked out
// by their own successful logins.
const LOGIN_RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };

function getClientIp(request) {
  const headers = request?.headers;
  if (!headers || typeof headers.get !== "function") return "unknown";
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return headers.get("x-real-ip") ?? "unknown";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) return null;

        const ip = getClientIp(request);
        const emailKey = `login:email:${email}`;
        const ipKey = `login:ip:${ip}`;

        try {
          const [emailLimited, ipLimited] = await Promise.all([
            isRateLimited(emailKey, LOGIN_RATE_LIMIT),
            isRateLimited(ipKey, LOGIN_RATE_LIMIT),
          ]);

          if (emailLimited || ipLimited) return null;

          const user = await getUserByEmail(email);
          if (!user) {
            await recordRateLimitEvent(ipKey);
            return null;
          }

          const valid = await bcrypt.compare(password, user.password);
          if (!valid) {
            await Promise.all([
              recordRateLimitEvent(emailKey),
              recordRateLimitEvent(ipKey),
            ]);
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username,
            emailVerified: Boolean(user.emailVerifiedAt),
            avatarType: user.avatarType ?? "color",
            avatarColor: user.avatarColor ?? null,
            avatarFlag: user.avatarFlag ?? null,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/",
  },
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.emailVerified = user.emailVerified ?? false;
        token.avatarType = user.avatarType ?? "color";
        token.avatarColor = user.avatarColor ?? null;
        token.avatarFlag = user.avatarFlag ?? null;
      }
      if (trigger === "update" && session) {
        if (session.emailVerified != null) {
          token.emailVerified = session.emailVerified;
        }
        if (session.username != null) {
          token.username = session.username;
        }
        if (session.avatarType != null) {
          token.avatarType = session.avatarType;
        }
        if (session.avatarColor !== undefined) {
          token.avatarColor = session.avatarColor;
        }
        if (session.avatarFlag !== undefined) {
          token.avatarFlag = session.avatarFlag;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id;
      }
      if (token?.username) {
        session.user.username = token.username;
      }
      if (token?.avatarType) {
        session.user.avatarType = token.avatarType;
      }
      if (token?.avatarColor !== undefined) {
        session.user.avatarColor = token.avatarColor;
      }
      if (token?.avatarFlag !== undefined) {
        session.user.avatarFlag = token.avatarFlag;
      }
      if (token?.emailVerified != null) {
        session.user.emailVerified = token.emailVerified;
      }
      return session;
    },
  },
});
