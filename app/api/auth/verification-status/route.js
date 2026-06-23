import { auth } from "@/auth";
import { getUserVerificationStatus } from "@/lib/auth-db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getUserVerificationStatus(session.user.id);

    return Response.json({
      emailVerified: Boolean(status?.emailVerifiedAt),
    });
  } catch (error) {
    console.error("Verification status error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
