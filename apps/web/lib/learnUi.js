/**
 * Tailwind class-name module for the Learn mode mixed-question UI. Kept separate
 * from lib/ui.js so the Test-mode styling surface is untouched. Uses the same
 * theme tokens (text-text, bg-surface, text-success/error, --color-* vars) as the
 * rest of the app. No CSS modules / separate stylesheets, per project convention.
 */

import { cn } from "./cn";

// NOTE: Tailwind v4 scans for literal class strings at build time, so these
// success/error tint backgrounds must be written out in full (no interpolation).
const SUCCESS_BG = "bg-[color-mix(in_srgb,var(--color-success)_16%,transparent)]";
const ERROR_BG = "bg-[color-mix(in_srgb,var(--color-error)_16%,transparent)]";

export const learnQuestion = "flex w-full flex-col gap-4";

export const learnPrompt =
  "m-0 text-center text-lg font-semibold leading-snug text-text max-md:text-base";

export const learnPromptSubtext = "m-0 text-center text-sm text-text-muted";

export const learnPromptMedia =
  "mx-auto flex items-center justify-center";

// ── multiple choice ────────────────────────────────────────────────────────────

// 2x2 grid on mobile, single 1x4 row on desktop (single-select MC).
export const learnChoiceGrid = "grid grid-cols-2 gap-3 md:grid-cols-4";
// Mid-size multi-select lists (~7 options): 2-col mobile, 3-col desktop.
export const learnMultiSelectGrid = "grid grid-cols-2 gap-3 md:grid-cols-3";

const choiceBase = cn(
  "flex min-h-[3.25rem] min-w-0 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md border px-4 py-3",
  "text-center text-base font-semibold shadow-sm transition-[border-color,background,box-shadow,transform] duration-150 ease-out",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
);

/**
 * @param {{ state?: "idle"|"selected"|"correct"|"wrong"|"missed"|"muted", locked?: boolean }} [opts]
 */
export function learnChoiceButton({ state = "idle", locked = false } = {}) {
  return cn(
    choiceBase,
    state === "idle" &&
      "border-border bg-surface text-text enabled:hover:-translate-y-0.5 enabled:hover:border-border-subtle enabled:hover:bg-surface-hover enabled:hover:shadow-md",
    state === "selected" &&
      "border-accent bg-surface-selected text-text shadow-[0_0_0_3px_var(--color-accent-ring),var(--shadow-md)]",
    state === "correct" && cn("border-success text-success shadow-md", SUCCESS_BG),
    state === "wrong" && cn("border-error text-error", ERROR_BG),
    state === "missed" && cn("border-success text-success shadow-md", SUCCESS_BG),
    state === "muted" && "border-border bg-surface text-text-muted opacity-55",
    locked && "cursor-default"
  );
}

export const learnChoiceFlag = "h-6 w-9 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10";

// Flag-only option grid (larger flags, fewer words).
export const learnFlagChoiceGrid = "grid grid-cols-2 gap-3 md:grid-cols-4";

export function learnFlagChoiceButton({ state = "idle", locked = false } = {}) {
  return cn(
    "flex cursor-pointer flex-col items-center gap-2 rounded-md border p-3 shadow-sm",
    "transition-[border-color,background,box-shadow,transform] duration-150 ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
    state === "idle" &&
      "border-border bg-surface enabled:hover:-translate-y-0.5 enabled:hover:border-border-subtle enabled:hover:bg-surface-hover enabled:hover:shadow-md",
    state === "correct" && cn("border-success shadow-md", SUCCESS_BG),
    state === "wrong" && cn("border-error", ERROR_BG),
    state === "muted" && "border-border bg-surface opacity-55",
    locked && "cursor-default"
  );
}

export const learnFlagChoiceImg = "h-14 w-full rounded-[4px] object-cover ring-1 ring-black/10";

// Shape-only option grid (silhouettes, unlabeled until after answer).
export const learnShapeChoiceGrid = "grid grid-cols-2 gap-3";

export function learnShapeChoiceButton({ state = "idle", locked = false } = {}) {
  return cn(
    "relative flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden rounded-md border p-1.5 shadow-sm",
    "transition-[border-color,background,box-shadow,transform] duration-150 ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
    state === "idle" &&
      "border-border bg-inset enabled:hover:-translate-y-0.5 enabled:hover:border-border-subtle enabled:hover:bg-surface-hover enabled:hover:shadow-md",
    state === "correct" && cn("border-success shadow-md", SUCCESS_BG),
    state === "wrong" && cn("border-error", ERROR_BG),
    state === "muted" && "border-border bg-inset opacity-55",
    locked && "cursor-default"
  );
}

export const learnShapeChoiceSvg = "h-full min-h-0 w-full min-w-0";
export const learnShapePromptSvg = "mx-auto h-[min(24rem,50vh)] w-full";

// ── yes / no ─────────────────────────────────────────────────────────────────

export const learnYesNoRow = "grid grid-cols-2 gap-3";

export function learnYesNoButton({ state = "idle", locked = false } = {}) {
  return cn(
    "flex min-h-[4rem] cursor-pointer items-center justify-center rounded-md border text-lg font-bold shadow-sm",
    "transition-[border-color,background,box-shadow,transform] duration-150 ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
    state === "idle" &&
      "border-border bg-surface text-text enabled:hover:-translate-y-0.5 enabled:hover:border-border-subtle enabled:hover:bg-surface-hover enabled:hover:shadow-md",
    state === "correct" && cn("border-success text-success shadow-md", SUCCESS_BG),
    state === "wrong" && cn("border-error text-error", ERROR_BG),
    state === "muted" && "border-border bg-surface text-text-muted opacity-55",
    locked && "cursor-default"
  );
}

// ── binary comparison cards ──────────────────────────────────────────────────

export const learnBinaryRow = "grid grid-cols-2 gap-3 md:gap-4";

export function learnBinaryCard({ state = "idle", locked = false } = {}) {
  return cn(
    "flex cursor-pointer flex-col items-center gap-3 rounded-lg border p-4 shadow-sm",
    "transition-[border-color,background,box-shadow,transform] duration-150 ease-out",
    state === "idle" &&
      "border-border bg-surface enabled:hover:-translate-y-0.5 enabled:hover:border-border-subtle enabled:hover:bg-surface-hover enabled:hover:shadow-md",
    state === "winner" && cn("border-success shadow-md", SUCCESS_BG),
    state === "loser" && "border-border bg-surface opacity-60",
    locked && "cursor-default"
  );
}

export const learnBinaryFlag = "h-12 w-[4.5rem] rounded-[4px] object-cover ring-1 ring-black/10";
export const learnBinaryName = "text-center text-base font-semibold text-text";
export const learnBinaryStat = "text-center text-sm font-bold tabular-nums text-text-secondary";
export const learnBinaryStatHidden = "text-center text-sm font-bold text-text-muted";

// ── clue button ──────────────────────────────────────────────────────────────

export const learnClueButton = cn(
  "inline-flex items-center gap-1.5 self-center rounded-pill border border-border-subtle bg-surface px-3.5 py-1.5",
  "text-sm font-semibold text-text-secondary shadow-sm transition-[background,transform] duration-150 ease-out",
  "cursor-pointer enabled:hover:-translate-y-px enabled:hover:bg-surface-hover",
  "disabled:cursor-not-allowed disabled:opacity-55",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
);

export const learnClueText = "mt-1 text-center text-sm text-text-muted";

// ── text entry (reused pattern) ───────────────────────────────────────────────

export const learnTextForm = "flex w-full flex-col items-center gap-3";
export const learnTextInput =
  "w-full max-w-sm rounded-sm border border-border-subtle bg-input px-3 py-2.5 text-center text-base text-text shadow-sm outline-none transition-[border-color,box-shadow,color] duration-150 placeholder:text-text-muted focus:border-accent focus:shadow-[0_0_0_4px_var(--color-accent-soft)]";

/** Post-submit tint for free-recall answers (green correct / red wrong). */
export function learnTextInputOutcome(outcome) {
  if (outcome === "correct") {
    return cn(
      "border-success text-success font-semibold",
      SUCCESS_BG,
      "focus:border-success focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-success)_25%,transparent)]"
    );
  }
  if (outcome === "wrong") {
    return cn(
      "border-error text-error font-semibold",
      ERROR_BG,
      "focus:border-error focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-error)_25%,transparent)]"
    );
  }
  return null;
}

/** Green reveal box under a wrong free-recall answer. */
export const learnTextCorrectReveal = cn(
  "w-full max-w-sm rounded-sm border border-success px-3 py-2.5 text-center text-base font-semibold text-success shadow-sm",
  SUCCESS_BG
);

export const learnContinueArrowBtn = cn(
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 text-white",
  "cursor-pointer bg-[image:var(--accent-gradient)] shadow-[var(--shadow-accent)]",
  "transition-[transform,box-shadow,background] duration-150 ease-out",
  "enabled:hover:-translate-y-px enabled:hover:bg-[image:var(--accent-gradient-hover)]",
  "enabled:active:translate-y-0",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
);

// ── mobile fact bottom sheet ──────────────────────────────────────────────────

export const learnFactBackdrop =
  "fixed inset-0 z-[70] flex items-end bg-transparent md:hidden";

export const learnFactSheet = cn(
  "relative w-full rounded-t-2xl border-t border-border bg-surface p-5 shadow-lg",
  "h-[65dvh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]",
  "translate-y-full transition-transform duration-300 ease-out will-change-transform",
  "data-[open=true]:translate-y-0"
);

export const learnFactHandle =
  "mx-auto mb-3 h-1.5 w-10 rounded-pill bg-border-subtle";
export const learnFactHeader = "flex items-center gap-3";
export const learnFactFlag = "h-7 w-10 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10";
export const learnFactName = "m-0 text-lg font-bold text-text";
export const learnFactBody = "m-0 mt-3 text-[0.95rem] leading-relaxed text-text-secondary";
export const learnFactCategory =
  "mt-3 inline-block rounded-pill bg-meta px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted";

// ── session summary (appended to GameCompleteModal) ────────────────────────────

export const learnSummary = "flex flex-col gap-4 border-t border-border pt-4";
export const learnSummarySection = "flex flex-col gap-2";
export const learnSummaryTitle = "m-0 text-sm font-bold uppercase tracking-wide text-text-muted";
export const learnSummaryDetails = "group flex flex-col gap-2";
export const learnSummarySummary = cn(
  "flex w-full cursor-pointer list-none items-center gap-2 rounded-sm py-0.5",
  "text-sm font-bold uppercase tracking-wide text-text-muted",
  "hover:text-text [&::-webkit-details-marker]:hidden [&::marker]:hidden",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
);
export const learnSummaryCount = "font-semibold normal-case tracking-normal text-text-muted/80";
export const learnSummaryChevron =
  "ml-auto block h-[0.4rem] w-[0.4rem] shrink-0 -translate-y-px rotate-45 border-b-2 border-r-2 border-current transition-transform duration-150 group-open:-translate-y-0 group-open:rotate-[225deg]";
export const learnSummaryTypeList = "flex flex-wrap gap-1.5";
export const learnSummaryTypeChip =
  "inline-flex items-center gap-1 rounded-pill bg-meta px-2.5 py-1 text-xs font-semibold text-text-secondary";
export const learnSummaryDeltaList = "flex flex-col gap-1";
export const learnSummaryDeltaRow =
  "flex items-center justify-between gap-2 rounded-sm bg-inset px-3 py-1.5 text-sm";
export const learnSummaryDeltaName = "font-semibold text-text";
export const learnSummaryDeltaUp = "font-bold tabular-nums text-success";
export const learnSummaryDeltaDown = "font-bold tabular-nums text-error";
export const learnSummaryFact = cn(
  "flex flex-col gap-1 rounded-md border border-border bg-inset p-3"
);
export const learnSummaryFactLabel =
  "text-xs font-semibold uppercase tracking-wide text-text-muted";
export const learnSummaryFactText = "text-[0.9rem] leading-relaxed text-text-secondary";
