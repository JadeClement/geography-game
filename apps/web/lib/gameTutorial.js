import { GAME_TYPES } from "@/lib/gameTypes";
import { isNameLevel } from "@/lib/levels";
import { GAME_MODES } from "@/lib/regions";

export function getGameTourId(session) {
  if (!session?.mode) return null;

  if (session.gameType === GAME_TYPES.DISCOVER) {
    return `discover:${session.mode}`;
  }

  const levelKind = session.level != null && isNameLevel(session.level) ? "name" : "find";
  const gameType =
    session.gameType === GAME_TYPES.LEARNING ? GAME_TYPES.LEARNING : GAME_TYPES.TEST;

  return `${gameType}:${levelKind}:${session.mode}`;
}

export function getModeGoalLabel(mode) {
  if (mode === GAME_MODES.CAPITALS) return "capital";
  if (mode === GAME_MODES.FLAGS) return "flag";
  return "country";
}
