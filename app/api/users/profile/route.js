import { auth } from "@/auth";
import {
  getUserById,
  isUsernameTaken,
  updateUserProfile,
  updateUserUsername,
} from "@/lib/db";
import {
  avatarFromUser,
  normalizeAvatarPayload,
  validateAvatarPayload,
} from "@/lib/avatars";
import { normalizeUsername, validateUsername } from "@/lib/usernames";

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    avatar: avatarFromUser(user),
  };
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

  return Response.json({ user: serializeUser(user) });
}

export async function PATCH(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    let user = await getUserById(session.user.id);
    if (!user) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (body.username != null) {
      const username = normalizeUsername(body.username);
      const usernameError = validateUsername(username);
      if (usernameError) {
        return Response.json({ error: usernameError }, { status: 400 });
      }
      if (await isUsernameTaken(username, { excludeUserId: session.user.id })) {
        return Response.json({ error: "That username is already taken." }, { status: 409 });
      }
      user = await updateUserUsername(session.user.id, username);
    }

    if (body.avatar != null) {
      const avatarError = validateAvatarPayload(body.avatar);
      if (avatarError) {
        return Response.json({ error: avatarError }, { status: 400 });
      }
      const avatar = normalizeAvatarPayload(body.avatar);
      user = await updateUserProfile(session.user.id, avatar);
    }

    return Response.json({ user: serializeUser(user) });
  } catch (error) {
    console.error("Profile update error:", error);
    if (error.code === "23505") {
      return Response.json({ error: "That username is already taken." }, { status: 409 });
    }
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
