import { GAME_MODES } from "@/lib/regions";
import { getModeGoalLabel } from "@/lib/gameTutorial";

export function getWelcomeCopy(ctx) {
  const kind =
    ctx.mode === GAME_MODES.CAPITALS
      ? "capitals"
      : ctx.mode === GAME_MODES.FLAGS
        ? "flags"
        : "countries";

  return {
    title: ctx.isDiscover ? "Welcome to Discover" : "Welcome to your quiz",
    body: ctx.isDiscover
      ? `Explore ${kind} on the map at your own pace — tap to reveal names, with no score or timer.`
      : ctx.isLearning
        ? `This Learn session drills ${kind} you miss most. Take your time and use the hints if you need them.`
        : `This Test covers every ${kind.slice(0, -1)} in the region. Your score and progress are tracked.`,
  };
}

export function getGoalCopy(ctx) {
  const item = getModeGoalLabel(ctx.mode);

  if (ctx.isDiscover) {
    return {
      title: "Your goal",
      body:
        ctx.mode === GAME_MODES.FLAGS
          ? "Tap any country to see its flag. Tap again to hear the country name spoken aloud."
          : ctx.mode === GAME_MODES.CAPITALS
            ? "Tap any country to see its capital. Names are spoken aloud so you can hear the pronunciation."
            : "Tap any country to see its name. Names are spoken aloud so you can hear the pronunciation.",
    };
  }

  if (ctx.isNameGame) {
    return {
      title: "Your goal",
      body:
        ctx.mode === GAME_MODES.CAPITALS
          ? "A country is highlighted on the map. Type its capital in the box and press Enter."
          : ctx.mode === GAME_MODES.FLAGS
            ? "A country is highlighted on the map. Type the country name in the box and press Enter."
            : "A country is highlighted on the map. Type its name in the box and press Enter.",
      titleMobile: "Your goal",
      bodyMobile:
        ctx.mode === GAME_MODES.CAPITALS
          ? "A country is highlighted below the header. Type its capital and press Enter on the keyboard."
          : "A country is highlighted on the map. Type its name in the prompt and press Enter.",
    };
  }

  return {
    title: "Your goal",
    body:
      ctx.mode === GAME_MODES.FLAGS
        ? "Find the country whose flag matches the prompt, then click it on the map."
        : ctx.mode === GAME_MODES.CAPITALS
          ? "Find the country whose capital matches the prompt, then click it on the map."
          : "Find the country whose name matches the prompt, then click it on the map.",
    titleMobile: "Your goal",
    bodyMobile:
      ctx.mode === GAME_MODES.FLAGS
        ? "Match the flag shown in the floating prompt to a country on the map, then tap it."
        : `Match the ${item} in the prompt to a country on the map, then tap it.`,
  };
}

/**
 * Combined welcome + goal copy for the per-game mode intro modal.
 * @param {{
 *   isMobile?: boolean,
 *   isDiscover?: boolean,
 *   isNameGame?: boolean,
 *   isLearning?: boolean,
 *   mode?: string,
 * }} context
 */
export function getGameModeIntro(context) {
  const ctx = {
    isMobile: Boolean(context.isMobile),
    isDiscover: Boolean(context.isDiscover),
    isNameGame: Boolean(context.isNameGame),
    isLearning: Boolean(context.isLearning),
    mode: context.mode,
  };

  const welcome = getWelcomeCopy(ctx);
  const goal = getGoalCopy(ctx);
  const goalBody =
    ctx.isMobile && goal.bodyMobile ? goal.bodyMobile : goal.body;

  return {
    title: welcome.title,
    paragraphs: [welcome.body, goalBody].filter(Boolean),
  };
}
