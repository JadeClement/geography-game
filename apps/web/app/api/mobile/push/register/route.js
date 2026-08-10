import {
  getMobileSession,
  upsertPushToken,
} from "@/lib/mobile-auth";

export async function POST(request) {
  try {
    const session = await getMobileSession(request);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const platform = body.platform;

    if (!token) {
      return Response.json({ error: "token is required." }, { status: 400 });
    }
    if (platform !== "ios" && platform !== "android") {
      return Response.json(
        { error: "platform must be 'ios' or 'android'." },
        { status: 400 }
      );
    }

    await upsertPushToken({
      userId: session.user.id,
      token,
      platform,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Push register error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
