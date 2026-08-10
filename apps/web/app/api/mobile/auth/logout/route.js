import { clearMobileToken, getMobileSession } from "@/lib/mobile-auth";

export async function POST(request) {
  try {
    const session = await getMobileSession(request);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    await clearMobileToken(session.user.id);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Mobile logout error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
