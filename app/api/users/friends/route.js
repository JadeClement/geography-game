import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { addUserFriend, getFriendsForUser } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const friends = await getFriendsForUser(session.user.id);
    return Response.json({ friends });
  } catch (error) {
    console.error("Friends fetch error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const friendId = body.friendId?.trim();

    if (!friendId) {
      return Response.json({ error: "Friend id is required." }, { status: 400 });
    }

    if (friendId === session.user.id) {
      return Response.json({ error: "You cannot add yourself as a friend." }, { status: 400 });
    }

    const result = await addUserFriend(session.user.id, friendId);
    if (!result) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    return Response.json({
      friend: {
        id: result.friend.id,
        name: result.friend.name,
        username: result.friend.username,
      },
      created: result.created,
    });
  } catch (error) {
    console.error("Add friend error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
