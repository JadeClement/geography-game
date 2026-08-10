import bcrypt from "bcryptjs";
import {
  TOKEN_TYPES,
  findValidAuthToken,
  invalidateAuthTokensForUser,
  markAuthTokenUsed,
  updateUserPassword,
} from "@/lib/auth-db";
import { sendPasswordChangedEmail } from "@/lib/email";
import { validatePassword } from "@/lib/validation";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token")?.trim();

    if (!token) {
      return Response.json({ valid: false, error: "Reset token is required." }, { status: 400 });
    }

    const authToken = await findValidAuthToken({
      rawToken: token,
      type: TOKEN_TYPES.PASSWORD_RESET,
    });

    if (!authToken) {
      return Response.json(
        { valid: false, error: "This reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    return Response.json({ valid: true });
  } catch (error) {
    console.error("Reset token validation error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const token = body.token?.trim();
    const password = body.password;
    const confirmPassword = body.confirmPassword;

    if (!token) {
      return Response.json({ error: "Reset token is required." }, { status: 400 });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return Response.json({ error: passwordError }, { status: 400 });
    }

    if (password !== confirmPassword) {
      return Response.json({ error: "Passwords do not match." }, { status: 400 });
    }

    const authToken = await findValidAuthToken({
      rawToken: token,
      type: TOKEN_TYPES.PASSWORD_RESET,
    });

    if (!authToken) {
      return Response.json(
        { error: "This reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await updateUserPassword(authToken.userId, hashedPassword);
    await markAuthTokenUsed(authToken.id);
    await invalidateAuthTokensForUser(authToken.userId, TOKEN_TYPES.PASSWORD_RESET);

    await sendPasswordChangedEmail({
      to: authToken.email,
      name: authToken.name,
    });

    return Response.json({ message: "Password updated successfully." });
  } catch (error) {
    console.error("Password reset error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
