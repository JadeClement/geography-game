import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) return null;

        try {
          const user = await getUserByEmail(email);
          if (!user) return null;

          const valid = await bcrypt.compare(password, user.password);
          if (!valid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: Boolean(user.emailVerifiedAt),
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
        token.emailVerified = user.emailVerified ?? false;
      }
      if (trigger === "update" && session?.emailVerified != null) {
        token.emailVerified = session.emailVerified;
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id;
      }
      if (token?.emailVerified != null) {
        session.user.emailVerified = token.emailVerified;
      }
      return session;
    },
  },
});
