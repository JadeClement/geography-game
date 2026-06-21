import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { createUser, getUserByEmail } from "@/lib/db";

export async function POST(request) {
  try {
    const body = await request.json();
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

    if (!name || !email || !password) {
      return Response.json(
        { error: "Name, email, and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return Response.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await createUser({
      id: randomUUID(),
      name,
      email,
      password: hashedPassword,
    });

    return Response.json({ user }, { status: 201 });
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
