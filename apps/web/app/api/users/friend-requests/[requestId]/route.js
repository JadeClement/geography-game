import { auth } from "@/auth";
import { acceptFriendRequest, declineFriendRequest } from "@/lib/db";

export async function PATCH(request, { params }) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { requestId } = await params;
    const body = await request.json();
    const action = body.action?.trim();

    if (!requestId) {
      return Response.json({ error: "Request id is required." }, { status: 400 });
    }

    if (action === "accept") {
      const result = await acceptFriendRequest(requestId, session.user.id);
      if (!result) {
        return Response.json({ error: "Friend request not found." }, { status: 404 });
      }

      return Response.json({
        friend: {
          id: result.friend.id,
          name: result.friend.name,
          username: result.friend.username,
        },
      });
    }

    if (action === "decline") {
      const result = await declineFriendRequest(requestId, session.user.id);
      if (!result) {
        return Response.json({ error: "Friend request not found." }, { status: 404 });
      }

      return Response.json({ declined: true });
    }

    return Response.json({ error: "Action must be accept or decline." }, { status: 400 });
  } catch (error) {
    console.error("Friend request update error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
