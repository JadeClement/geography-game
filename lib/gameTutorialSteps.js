import { GAME_TYPES } from "@/lib/gameTypes";
import { GAME_MODES } from "@/lib/regions";
import { getModeGoalLabel } from "@/lib/gameTutorial";

/**
 * @typedef {"modal" | "spotlight"} GameTutorialStepType
 * @typedef {"map" | "prompt" | "mobilePrompt" | "controls" | "score" | "pacificControls"} GameTutorialTarget
 *
 * @typedef {object} GameTutorialStep
 * @property {string} id
 * @property {GameTutorialStepType} type
 * @property {GameTutorialTarget} [target]
 * @property {string} title
 * @property {string} body
 * @property {string} [titleMobile]
 * @property {string} [bodyMobile]
 * @property {(ctx: GameTutorialContext) => boolean} [when]
 *
 * @typedef {object} GameTutorialContext
 * @property {boolean} isMobile
 * @property {boolean} isOceania
 * @property {boolean} isDiscover
 * @property {boolean} isNameGame
 * @property {boolean} isFindGame
 * @property {boolean} isLearning
 * @property {boolean} signedIn
 * @property {string} mode
 * @property {string} modeLabel
 */

function mapStep(isMobile, isOceania, { title, body, titleMobile, bodyMobile, ...rest }) {
  return {
    ...rest,
    title: isMobile && titleMobile ? titleMobile : title,
    body: isMobile && bodyMobile ? bodyMobile : body,
    when: rest.when ?? (isOceania ? undefined : () => !rest.id?.includes("pacific")),
  };
}

function welcomeStep(ctx) {
  const kind =
    ctx.mode === GAME_MODES.CAPITALS
      ? "capitals"
      : ctx.mode === GAME_MODES.FLAGS
        ? "flags"
        : "countries";

  return {
    id: "welcome",
    type: "modal",
    title: ctx.isDiscover ? "Welcome to Discover" : "Welcome to your quiz",
    body: ctx.isDiscover
      ? `Explore ${kind} on the map at your own pace — tap to reveal names, with no score or timer.`
      : ctx.isLearning
        ? `This Learn session drills ${kind} you miss most. Take your time and use the hints if you need them.`
        : `This Test covers every ${kind.slice(0, -1)} in the region. Your score and progress are tracked.`,
  };
}

function goalStep(ctx) {
  const item = getModeGoalLabel(ctx.mode);

  if (ctx.isDiscover) {
    return {
      id: "goal",
      type: "modal",
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
      id: "goal",
      type: "modal",
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
    id: "goal",
    type: "modal",
    title: "Your goal",
    body:
      ctx.mode === GAME_MODES.FLAGS
        ? "Find the country whose flag matches the prompt, then click it on the map."
        : ctx.mode === GAME_MODES.CAPITALS
          ? `Find the country whose capital matches the prompt, then click it on the map.`
          : `Find the country whose name matches the prompt, then click it on the map.`,
    titleMobile: "Your goal",
    bodyMobile:
      ctx.mode === GAME_MODES.FLAGS
        ? "Match the flag shown in the floating prompt to a country on the map, then tap it."
        : `Match the ${item} in the prompt to a country on the map, then tap it.`,
  };
}

function buildSharedSteps(ctx) {
  const steps = [
    welcomeStep(ctx),
    goalStep(ctx),
    {
      id: "map",
      type: "spotlight",
      target: "map",
      interactive: true,
      title: ctx.isOceania ? "Move around the map" : "Move around the map",
      body: ctx.isOceania
        ? "Drag to pan. Use the + and − buttons to zoom, ⌂ to reset Oceania, and ⊕ for the full world view."
        : "Drag the map to pan. Scroll or pinch to zoom in and out. Try it now — the map is live while this tip is open.",
      titleMobile: "Move around the map",
      bodyMobile: ctx.isOceania
        ? "Drag to pan. Tap + and − to zoom, ⌂ to reset, and ⊕ for the full world."
        : "Drag with one finger to pan. Pinch with two fingers to zoom.",
    },
    {
      id: "pacific-controls",
      type: "spotlight",
      target: "pacificControls",
      title: "Map zoom buttons",
      body: "These buttons zoom, reset the view, or show the entire world canvas.",
      when: (c) => c.isOceania,
    },
    {
      id: "small-countries",
      type: "modal",
      title: "Tiny islands",
      body: "Small countries appear as circles when zoomed out. Zoom in and the real island shapes appear — circles hide automatically.",
    },
    {
      id: "discover-labels",
      type: "modal",
      title: "Labels on the map",
      body: "When you tap a country, its name or flag animates onto the map. Listen for the spoken pronunciation.",
      when: (c) => c.isMobile && c.isDiscover,
    },
    {
      id: "prompt",
      type: "spotlight",
      target:
        ctx.isMobile && (ctx.isNameGame || ctx.isFindGame) ? "mobilePrompt" : "prompt",
      title: ctx.isDiscover ? "Discover" : "The prompt",
      body: ctx.isDiscover
        ? "Instructions appear in the header while you explore."
        : ctx.isNameGame
          ? ctx.isMobile
            ? "Type your answer in the text box. Press Enter to submit."
            : "Type your answer here. Press Enter to submit."
          : ctx.isMobile
            ? "The country, capital, or flag you are looking for appears in this floating card."
            : "The country, capital, or flag you are looking for appears here.",
      when: (c) => !(c.isMobile && c.isDiscover),
    },
    {
      id: "controls",
      type: "spotlight",
      target: "controls",
      title: "Game controls",
      body: ctx.isDiscover
        ? "Mute or unmute sounds with the speaker. Use the stop button to leave the game."
        : "Mute sounds, pause the timer, or stop and return home.",
      bodyMobile: ctx.isDiscover
        ? "Mute sounds or stop the game with these buttons."
        : "Mute, pause, or stop the game from here.",
    },
    {
      id: "score",
      type: "spotlight",
      target: "score",
      title: "Progress & score",
      body: "Track correct and incorrect answers, your timer, and how far through the quiz you are.",
      bodyMobile: "Correct ✓ and incorrect ✗ counts appear here, along with your progress bar.",
      when: (c) => !c.isDiscover,
    },
    {
      id: "sign-in",
      type: "modal",
      title: "Save your progress",
      body: "Create a free account to unlock Learn mode, track mastery over time, and pick up where you left off on any device.",
      when: (c) => !c.signedIn,
    },
    {
      id: "ready",
      type: "modal",
      title: "You're ready!",
      body: ctx.isDiscover
        ? "Tap countries to explore. Press ? in the header any time to replay this tour."
        : "Good luck! Press ? in the header any time to replay this tour.",
    },
  ];

  return steps;
}

export function getGameTutorialSteps(tourId, context) {
  if (!tourId) return [];

  const ctx = {
    isMobile: context.isMobile,
    isOceania: context.isOceania,
    isDiscover: context.isDiscover,
    isNameGame: context.isNameGame,
    isFindGame: context.isFindGame,
    isLearning: context.isLearning,
    signedIn: context.signedIn,
    mode: context.mode,
    modeLabel: context.modeLabel,
  };

  return buildSharedSteps(ctx).filter((step) => (step.when ? step.when(ctx) : true));
}

export function getGameTutorialTitle(tourId) {
  if (!tourId) return "How to play";
  if (tourId.startsWith("discover:")) return "Discover mode";
  if (tourId.includes(":name:")) return "Name it mode";
  if (tourId.startsWith(`${GAME_TYPES.LEARNING}:`)) return "Learn mode";
  return "Test mode";
}
