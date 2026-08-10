import {
  getMobileSession,
  issueMobileToken,
} from "@/lib/mobile-auth";

export async function POST(request) {
  try {
    const session = await getMobileSession(request);
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { token, expiresAt } = await issueMobileToken(session.user.id);

    return Response.json({
      token,
      expiresAt,
      user: session.user,
    });
  } catch (error) {
    console.error("Mobile refresh error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
