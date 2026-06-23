import {
  TOKEN_TYPES,
  findValidAuthToken,
  markAuthTokenUsed,
  markEmailVerified,
} from "@/lib/auth-db";

export async function POST(request) {
  try {
    const body = await request.json();
    const token = body.token?.trim();

    if (!token) {
      return Response.json({ error: "Verification token is required." }, { status: 400 });
    }

    const authToken = await findValidAuthToken({
      rawToken: token,
      type: TOKEN_TYPES.EMAIL_VERIFICATION,
    });

    if (!authToken) {
      return Response.json(
        { error: "This verification link is invalid or has expired." },
        { status: 400 }
      );
    }

    if (authToken.emailVerifiedAt) {
      await markAuthTokenUsed(authToken.id);
      return Response.json({ message: "Email is already verified." });
    }

    await markEmailVerified(authToken.userId);
    await markAuthTokenUsed(authToken.id);

    return Response.json({ message: "Email verified successfully." });
  } catch (error) {
    console.error("Email verification error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
