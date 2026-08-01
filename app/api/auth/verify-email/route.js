import { verifyEmailWithToken } from "@/lib/verification";

export async function POST(request) {
  try {
    const body = await request.json();
    const result = await verifyEmailWithToken(body.token);

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    return Response.json({ message: result.message });
  } catch (error) {
    console.error("Email verification error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
