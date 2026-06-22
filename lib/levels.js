export const GAME_LEVELS = {
  FIND_FILL: "F1",
  FIND_FLASH: "F2",
  NAME_FILL: "N1",
  NAME_FLASH: "N2",
};

export const LEVEL_CODES = Object.values(GAME_LEVELS);

export function isValidLevel(level) {
  return LEVEL_CODES.includes(level);
}

export const LEVEL_SECTIONS = [
  {
    id: "find",
    title: "Find it",
    shortTitle: "Find",
    subtitle: "Given a country title, click the country on the map.",
    levels: [
      {
        level: GAME_LEVELS.FIND_FILL,
        title: "Level 1",
        description: "Map fills in as you go",
      },
      {
        level: GAME_LEVELS.FIND_FLASH,
        title: "Level 2",
        description: "Countries disappear",
      },
    ],
  },
  {
    id: "name",
    title: "Name it",
    shortTitle: "Name",
    subtitle:
      "Given a country on the map, type the country's name.",
    levels: [
      {
        level: GAME_LEVELS.NAME_FILL,
        title: "Level 1",
        description: "Map fills in as you go",
      },
      {
        level: GAME_LEVELS.NAME_FLASH,
        title: "Level 2",
        description: "Countries disappear",
      },
    ],
  },
];

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
  const match = findLevelSection(level);
  if (!match) return `Level ${level}`;
  return `${match.section.title} · ${match.option.title}`;
}

export function getLevelShortLabel(level) {
  const match = findLevelSection(level);
  if (!match) return `Level ${level}`;
  return `${match.section.shortTitle} ${match.option.title.replace("Level ", "")}`;
}
