import { auth } from "@/auth";
import { deleteUserPracticeData } from "@/lib/db";

/** DELETE — wipe the signed-in user's practice / mastery / score history. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteUserPracticeData(session.user.id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Practice reset error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
