import { auth } from "@/auth";
import { deleteUser } from "@/lib/db";
import { getMobileSession } from "@/lib/mobile-auth";

/** DELETE — permanently remove the signed-in account and cascaded data. */
export async function DELETE(request) {
  const session = (await auth()) || (await getMobileSession(request));
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await deleteUser(session.user.id);
    if (!deleted) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Account deletion error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
