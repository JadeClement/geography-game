export const GAME_TYPES = {
  TEST: "test",
  LEARNING: "learning",
};

export const LEARNING_SESSION_SIZES = [
  { id: 10, label: "10 countries" },
  { id: 20, label: "20 countries" },
  { id: "all", label: "All weak countries" },
];

export function getGameTypeLabel(gameType) {
  if (gameType === GAME_TYPES.LEARNING) return "Learning";
  return "Test";
}
