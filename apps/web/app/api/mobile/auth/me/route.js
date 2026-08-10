import { getMobileSession } from "@/lib/mobile-auth";

export async function GET(request) {
  try {
    const session = await getMobileSession(request);
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    return Response.json({ user: session.user });
  } catch (error) {
    console.error("Mobile me error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
