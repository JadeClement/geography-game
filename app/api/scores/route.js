import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { getScoreForGame, getScoresForUser, upsertScore } from "@/lib/db";
import { isValidLevel } from "@/lib/levels";

const DEFAULT_LEVEL = "F1";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scores = await getScoresForUser(session.user.id);
    return Response.json({ scores });
  } catch (error) {
    console.error("Score fetch error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mode, region, score } = body;
    const level = body.level ?? DEFAULT_LEVEL;

    if (!mode || !region || typeof score !== "number" || score < 0 || !isValidLevel(level)) {
      return Response.json({ error: "Invalid score data." }, { status: 400 });
    }

    const existing = await getScoreForGame(session.user.id, mode, region, level);

    if (existing && score <= existing.score) {
      return Response.json({
        saved: false,
        isPersonalBest: false,
        previousBest: existing.score,
        currentScore: score,
      });
    }

    const saved = await upsertScore({
      id: existing?.id ?? randomUUID(),
      userId: session.user.id,
      mode,
      region,
      level,
      score,
    });

    return Response.json({
      saved: true,
      isPersonalBest: true,
      previousBest: existing?.score ?? null,
      currentScore: score,
      score: saved,
    });
  } catch (error) {
    console.error("Score save error:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
