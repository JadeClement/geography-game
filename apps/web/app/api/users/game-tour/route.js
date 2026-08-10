import { auth } from "@/auth";
import {
  getUserGameTourCompleted,
  markUserGameTourCompleted,
} from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const completed = await getUserGameTourCompleted(session.user.id);
    return Response.json({ completed });
  } catch (error) {
    console.error("Game tour status error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await markUserGameTourCompleted(session.user.id);
    return Response.json({ completed: true });
  } catch (error) {
    console.error("Game tour mark error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
