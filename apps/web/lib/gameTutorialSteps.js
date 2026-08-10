import { GAME_TYPES } from "@/lib/gameTypes";
import { GAME_MODES } from "@/lib/regions";
import { getGoalCopy, getWelcomeCopy } from "@/lib/gameModeIntro";

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
 * @property {string} [titleMobile] - resolved into title on mobile by mapStep
 * @property {string} [bodyMobile] - resolved into body on mobile by mapStep
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

function mapStep(isMobile, { title, body, titleMobile, bodyMobile, ...rest }) {
  return {
    ...rest,
    title: isMobile && titleMobile ? titleMobile : title,
    body: isMobile && bodyMobile ? bodyMobile : body,
  };
}

function welcomeStep(ctx) {
  return {
    id: "welcome",
    type: "modal",
    ...getWelcomeCopy(ctx),
  };
}

function goalStep(ctx) {
  return {
    id: "goal",
    type: "modal",
    ...getGoalCopy(ctx),
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
    (() => {
      const promptItem =
        ctx.mode === GAME_MODES.FLAGS
          ? "flag"
          : ctx.mode === GAME_MODES.CAPITALS
            ? "capital"
            : "country";
      return {
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
              ? `The ${promptItem} you are looking for appears in this floating card.`
              : `The ${promptItem} you are looking for appears here.`,
        when: (c) => !(c.isMobile && c.isDiscover),
      };
    })(),
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
        ? "Tap countries to explore. Press {{help}} in the header any time to replay this tour."
        : "Good luck! Press {{help}} in the header any time to replay this tour.",
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

  return buildSharedSteps(ctx)
    .filter((step) => (step.when ? step.when(ctx) : true))
    .map((step) => mapStep(ctx.isMobile, step));
}

export function getGameTutorialTitle(tourId) {
  if (!tourId) return "How to play";
  if (tourId.startsWith("discover:")) return "Discover mode";
  if (tourId.includes(":name:")) return "Name it mode";
  if (tourId.startsWith(`${GAME_TYPES.LEARNING}:`)) return "Learn mode";
  return "Test mode";
}
