import {
  GAME_LEVELS,
  LEVEL_CODES,
  LEVEL_SECTIONS,
  COUNTRY_FLASH_MS,
  WRONG_CLICK_FLASH_MS,
} from "@worldly/constants";

export {
  GAME_LEVELS,
  LEVEL_CODES,
  LEVEL_SECTIONS,
  COUNTRY_FLASH_MS,
  WRONG_CLICK_FLASH_MS,
};

export function isValidLevel(level) {
  return LEVEL_CODES.includes(level);
}

export const LEVEL_OPTIONS = LEVEL_SECTIONS.flatMap((section) =>
  section.levels.map((option) => ({
    ...option,
    section: section.id,
    sectionTitle: section.title,
  }))
);

function findLevelSection(level) {
  for (const section of LEVEL_SECTIONS) {
    const option = section.levels.find((entry) => entry.level === level);
    if (option) return { section, option };
  }
  return null;
}

/**
 * Mastery proves downward within a section only: the "flash" (no-fill) tier
 * proves the "fill" tier of the same category. Returns levels whose mastery
 * implies mastery of `level`.
 */
export function getMasteryProvingLevels(level) {
  if (level === GAME_LEVELS.FIND_FILL) return [GAME_LEVELS.FIND_FLASH];
  if (level === GAME_LEVELS.NAME_FILL) return [GAME_LEVELS.NAME_FLASH];
  return [];
}

export function isFindLevel(level) {
  return level === GAME_LEVELS.FIND_FILL || level === GAME_LEVELS.FIND_FLASH;
}

export function isNameLevel(level) {
  return level === GAME_LEVELS.NAME_FILL || level === GAME_LEVELS.NAME_FLASH;
}

export function isProgressiveFillLevel(level) {
  return level === GAME_LEVELS.FIND_FILL || level === GAME_LEVELS.NAME_FILL;
}

export function usesColorFlash(level) {
  return level === GAME_LEVELS.FIND_FLASH || level === GAME_LEVELS.NAME_FLASH;
}

export function getLevelLabel(level) {
  const match = findLevelSection(level);
  if (!match) return `Level ${level}`;
  return `${match.section.title} · ${match.option.title}`;
}

export function getLevelShortLabel(level) {
  const match = findLevelSection(level);
  if (!match) return `Level ${level}`;
  return `${match.section.shortTitle} ${match.option.title.replace("Level ", "")}`;
}
