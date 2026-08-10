import { GAME_TYPES } from "@worldly/constants";

export { GAME_TYPES };

export function getGameTypeLabel(gameType) {
  if (gameType === GAME_TYPES.LEARNING) return "Learning";
  if (gameType === GAME_TYPES.DISCOVER) return "Discover";
  return "Test";
}
