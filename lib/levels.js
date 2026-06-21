export const GAME_LEVELS = {
  FIND_FILL: 1,
  FIND_FLASH: 2,
  NAME_FILL: 3,
  NAME_FLASH: 4,
};

export const LEVEL_OPTIONS = [
  {
    level: GAME_LEVELS.FIND_FILL,
    title: "Level 1",
    description: "Find the country (map fills in)",
  },
  {
    level: GAME_LEVELS.FIND_FLASH,
    title: "Level 2",
    description: "Find the country (map doesn't fill in)",
  },
  {
    level: GAME_LEVELS.NAME_FILL,
    title: "Level 3",
    description: "Name the country (map fills in)",
  },
  {
    level: GAME_LEVELS.NAME_FLASH,
    title: "Level 4",
    description: "Name the country (map doesn't fill in)",
  },
];

export const COUNTRY_FLASH_MS = 1000;
export const WRONG_CLICK_FLASH_MS = 800;

export function isFindLevel(level) {
  return level === GAME_LEVELS.FIND_FILL || level === GAME_LEVELS.FIND_FLASH;
}

export function isNameLevel(level) {
  return level === GAME_LEVELS.NAME_FILL || level === GAME_LEVELS.NAME_FLASH;
}

export function isMapFillLevel(level) {
  return level === GAME_LEVELS.FIND_FILL || level === GAME_LEVELS.NAME_FILL;
}

export function isProgressiveFillLevel(level) {
  return level === GAME_LEVELS.FIND_FILL || level === GAME_LEVELS.NAME_FILL;
}

export function usesColorFlash(level) {
  return level === GAME_LEVELS.FIND_FLASH || level === GAME_LEVELS.NAME_FLASH;
}

export function getLevelLabel(level) {
  return LEVEL_OPTIONS.find((option) => option.level === level)?.title ?? `Level ${level}`;
}
