import { auth } from "@/auth";
import { getUserById, isUsernameTaken, updateUserUsername } from "@/lib/db";
import { normalizeUsername, validateUsername } from "@/lib/usernames";

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const username = normalizeUsername(body.username);
    const usernameError = validateUsername(username);

    if (usernameError) {
      return Response.json({ error: usernameError }, { status: 400 });
    }

    if (await isUsernameTaken(username, { excludeUserId: session.user.id })) {
      return Response.json({ error: "That username is already taken." }, { status: 409 });
    }

    const updated = await updateUserUsername(session.user.id, username);
    if (!updated) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    return Response.json({
      user: {
        id: updated.id,
        name: updated.name,
        username: updated.username,
        email: updated.email,
      },
    });
  } catch (error) {
    console.error("Username update error:", error);
    if (error.code === "23505") {
      return Response.json({ error: "That username is already taken." }, { status: 409 });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserById(session.user.id);
  if (!user) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
    },
  });
}
