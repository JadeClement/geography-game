import { auth } from "@/auth";
import { createFriendRequest, getFriendsForUser } from "@/lib/db";

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

    const result = await createFriendRequest(session.user.id, friendId);
    if (!result) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (result.reason === "already_friends") {
      return Response.json({ error: "You are already friends with this user." }, { status: 409 });
    }

    if (result.reason === "already_requested") {
      return Response.json({
        target: {
          id: result.target.id,
          name: result.target.name,
          username: result.target.username,
        },
        created: false,
        status: "pending",
      });
    }

    if (result.reason === "incoming_request") {
      return Response.json(
        { error: "This user already sent you a friend request. Accept it on your scoreboard." },
        { status: 409 }
      );
    }

    return Response.json({
      target: {
        id: result.target.id,
        name: result.target.name,
        username: result.target.username,
      },
      created: result.created,
      status: "pending",
    });
  } catch (error) {
    console.error("Add friend error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
