import { GAME_TYPES } from "@/lib/gameTypes";
import { GAME_MODES } from "@/lib/regions";

export const START_STEPS = {
  HOME: "home",
  EXPLORE: "explore",
  CHOOSE_TYPE: "chooseType",
  LEVEL: "level",
  LEARNING_SIZE: "learningSize",
};

const VALID_STEPS = new Set(Object.values(START_STEPS));
const VALID_MODES = new Set(Object.values(GAME_MODES));
const VALID_GAME_TYPES = new Set(Object.values(GAME_TYPES));

export function buildStartScreenUrl({
  step = START_STEPS.HOME,
  mode,
  region,
  gameType,
  level,
} = {}) {
  if (!step || step === START_STEPS.HOME) {
    return "/";
  }

  const params = new URLSearchParams();
  params.set("step", step);
  if (mode) params.set("mode", mode);
  if (region) params.set("region", region);
  if (gameType) params.set("type", gameType);
  if (level != null) params.set("level", String(level));

  return `/?${params.toString()}`;
}

export function parseStartScreenSearchParams(searchParams) {
  const rawStep = searchParams.get("step") || START_STEPS.HOME;
  const step = VALID_STEPS.has(rawStep) ? rawStep : START_STEPS.HOME;

  const mode = searchParams.get("mode");
  const region = searchParams.get("region");
  const gameType = searchParams.get("type");
  const levelRaw = searchParams.get("level");
  const level = levelRaw != null && levelRaw !== "" ? Number(levelRaw) : null;

  return {
    step,
    mode: VALID_MODES.has(mode) ? mode : null,
    region: region || null,
    gameType: VALID_GAME_TYPES.has(gameType) ? gameType : null,
    level: Number.isFinite(level) ? level : null,
  };
}

export function normalizeStartScreenRoute(parsed) {
  const { step, mode, region, gameType, level } = parsed;

  if (step === START_STEPS.HOME) {
    return { step: START_STEPS.HOME, mode: null, region: null, gameType: null, level: null };
  }

  if (step === START_STEPS.EXPLORE) {
    return { step, mode: null, region: null, gameType: null, level: null };
  }

  if (step === START_STEPS.CHOOSE_TYPE) {
    if (!mode || !region) {
      return { step: START_STEPS.HOME, mode: null, region: null, gameType: null, level: null };
    }
    return { step, mode, region, gameType: null, level: null };
  }

  if (step === START_STEPS.LEVEL) {
    if (!mode || !region || !gameType) {
      return { step: START_STEPS.HOME, mode: null, region: null, gameType: null, level: null };
    }
    return { step, mode, region, gameType, level: null };
  }

  if (step === START_STEPS.LEARNING_SIZE) {
    if (!mode || !region || level == null) {
      return { step: START_STEPS.HOME, mode: null, region: null, gameType: null, level: null };
    }
    return {
      step,
      mode,
      region,
      gameType: GAME_TYPES.LEARNING,
      level,
    };
  }

  return { step: START_STEPS.HOME, mode: null, region: null, gameType: null, level: null };
}

export function isPlayingSearchParams(searchParams) {
  return searchParams.get("play") === "1";
}

export function buildPlayingUrl() {
  return "/?play=1";
}
