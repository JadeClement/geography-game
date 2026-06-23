import { cn } from "./cn";

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";

export const primaryBtn = cn(
  "inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-[0.95rem] font-semibold text-white",
  "cursor-pointer border-0 bg-[image:var(--accent-gradient)] shadow-[var(--shadow-accent)]",
  "transition-[transform,box-shadow,background] duration-150 ease-out",
  "enabled:hover:-translate-y-px enabled:hover:bg-[image:var(--accent-gradient-hover)]",
  "enabled:active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none",
  focusRing
);

export const secondaryBtn = cn(
  "inline-flex w-full items-center justify-center rounded-sm border border-border-subtle bg-transparent px-4 py-3",
  "text-[0.95rem] font-semibold text-text-secondary cursor-pointer no-underline",
  "transition-[transform,background,border-color] duration-150 ease-out",
  "enabled:hover:bg-menu-hover enabled:active:translate-y-0",
  "disabled:cursor-not-allowed disabled:opacity-60",
  focusRing
);

export function choiceBtn({ selected = false, disabled = false, className } = {}) {
  return cn(
    "cursor-pointer rounded-md border border-border bg-surface px-5 py-3.5 text-base font-semibold text-text shadow-sm",
    "transition-[border-color,background,box-shadow,transform] duration-150 ease-out",
  "enabled:hover:-translate-y-0.5 enabled:hover:border-border-subtle enabled:hover:bg-surface-hover enabled:hover:shadow-md",
  "enabled:active:translate-y-0 enabled:active:shadow-sm",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
    selected && "border-accent bg-surface-selected shadow-[0_0_0_3px_var(--color-accent-ring),var(--shadow-md)]",
    className
  );
}

export const modalOverlay =
  "fixed inset-0 z-50 flex animate-[modal-overlay-in_0.2s_var(--ease-out)_both] items-center justify-center bg-overlay p-4 backdrop-blur-sm max-md:items-end max-md:p-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]";

export const modalCard =
  "relative w-full max-w-sm animate-[modal-card-in_0.26s_var(--ease-out)_both] rounded-lg border border-border bg-surface p-7 shadow-lg max-md:max-h-[min(90dvh,100%)] max-md:overflow-y-auto max-md:p-5 max-md:rounded-b-none max-md:rounded-t-xl";

export const modalTitle = "m-0 mb-1.5 text-2xl font-bold text-text";

export const modalSubtitle = "m-0 mb-4 text-[0.95rem] text-text-muted";

export const modalActions = "flex flex-col gap-2";

export const modalClose = cn(
  "absolute right-3 top-2.5 flex h-8 w-8 items-center justify-center rounded-pill border-0 bg-transparent",
  "text-2xl leading-none text-text-muted cursor-pointer transition-[background,color] duration-150 ease-out",
  "hover:bg-menu-hover hover:text-text max-md:h-11 max-md:w-11",
  focusRing
);

export const linkBtn = cn(
  "border-0 bg-transparent p-0 font-semibold text-link underline-offset-2 cursor-pointer hover:underline",
  focusRing
);

export const authForm = "flex flex-col gap-3";

export const authSwitch = "mt-4 text-center text-sm text-text-muted";

export const gameMetaTag =
  "rounded-pill bg-meta px-2.5 py-1 text-[0.78rem] font-semibold tracking-wide text-text-secondary max-sm:px-2 max-sm:py-0.5 max-sm:text-[0.72rem]";

export const modalScore = "m-0 mb-1.5 text-[2rem] font-bold text-success";

export const modalGameContext = "m-0 mb-4 text-base text-text-muted";

export const gameCompleteStats =
  "mb-4 flex flex-col items-center gap-0.5 text-[0.95rem] font-semibold";

export function modalMessage({ success = false, error = false, className } = {}) {
  return cn(
    "mb-4 rounded-sm bg-inset px-3 py-2.5 text-sm text-text-menu",
    success && "text-success",
    error && "text-error",
    className
  );
}

export function choiceBtnLevel({ selected = false, disabled = false, className } = {}) {
  return choiceBtn({
    selected,
    disabled,
    className: cn("flex flex-col items-start gap-1.5 px-5 py-4 text-left", className),
  });
}

export const choiceBtnLevelTitle = "text-[1.05rem] font-bold tracking-tight";

export const choiceBtnLevelDesc = "text-sm font-medium leading-snug text-text-muted";

export const gameTimer =
  "font-variant-numeric tabular-nums text-text-muted";

export const gameTimerModal = "text-text-secondary";

// — App shell —
export const appHeader =
  "relative z-10 flex shrink-0 items-center justify-between border-b border-[var(--color-header-teal-border)] bg-app-header px-4 py-2.5 text-emerald-50 max-md:px-3 max-md:py-2 max-md:pt-[max(0.5rem,env(safe-area-inset-top))]";

export const appHeaderBrand = "flex flex-col gap-px leading-tight";

export const appHeaderBrandLink = cn(
  "cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left font-[inherit] text-inherit no-underline transition-opacity duration-150 ease-out hover:opacity-[0.88]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0fdfa] focus-visible:outline-offset-[3px]"
);

export const appHeaderTitle =
  "font-brand text-[clamp(1.5rem,6vw,2.1rem)] font-light leading-none text-[#f0fdfa]";

export const appHeaderSubtitle =
  "text-[0.65rem] font-medium tracking-[0.08em] text-[rgba(240,253,250,0.85)] max-[22rem]:hidden";

export const appHeaderActions = "flex items-center gap-2.5";

export const streakBadge =
  "inline-flex items-center gap-0.5 rounded-full bg-inset px-2.5 py-0.5 text-[0.85rem] font-semibold leading-none text-text-menu whitespace-nowrap";

export const profileMenu = "relative";

export const profileBtn = cn(
  "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-border-subtle bg-surface text-text-menu",
  "transition-[background,border-color,transform] duration-150 ease-out hover:bg-menu-hover hover:border-border-subtle active:scale-[0.96]",
  "max-md:h-11 max-md:w-11",
  focusRing
);

export const profileAvatar = "text-[0.95rem] font-bold";

export const profileIcon = "flex";

export const profileDropdown =
  "absolute right-0 top-[calc(100%+0.45rem)] z-20 min-w-48 origin-top-right animate-[dropdown-in_0.16s_var(--ease-out)_both] rounded-md border border-border bg-surface p-2 shadow-lg";

export const profileName = "mb-1.5 px-2 py-1 text-[0.85rem] text-text-muted";

export const dropdownItem = cn(
  "block w-full cursor-pointer rounded-[0.35rem] border-0 bg-transparent px-2 py-[0.45rem] text-left font-[inherit] text-text no-underline",
  "transition-[background] duration-150 ease-out hover:bg-menu-hover max-md:py-3",
  focusRing
);

// — Settings —
export const settingsPage = "flex min-h-dvh flex-col";

export const settingsContent =
  "mx-auto w-full max-w-xl flex-1 px-4 pb-8 pt-6 max-md:px-3 max-md:pb-[max(2rem,env(safe-area-inset-bottom))]";

export const settingsBack =
  "mb-4 inline-block text-[0.9rem] font-semibold text-link no-underline hover:underline";

export const settingsTitle = "mb-6 text-[clamp(1.5rem,5vw,1.75rem)] font-bold";

export const settingsSection =
  "rounded-lg border border-border bg-surface p-6 shadow-md [&+&]:mt-4 max-md:p-4";

export const settingsSectionTitle = "mb-1.5 text-base font-semibold";

export const settingsSectionDescription = "mb-4 text-[0.9rem] text-text-muted";

export const referenceDefaultSetting = cn(
  "flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-border bg-inset p-3 text-[0.95rem] text-text-muted",
  "[&_input]:h-4 [&_input]:w-4 [&_input]:accent-accent"
);

// — Theme toggle —
export const themeToggle = "flex gap-1.5 max-w-56";

export function themeToggleBtn({ selected = false } = {}) {
  return cn(
    "flex-1 cursor-pointer rounded-sm border border-border bg-inset px-2 py-2 text-[0.8rem] font-semibold text-text-menu",
    "transition-[background,border-color,color,box-shadow] duration-150 ease-out hover:bg-menu-hover hover:text-text max-md:py-3",
    selected && "border-accent bg-surface-selected text-text shadow-[0_0_0_3px_var(--color-accent-ring)]",
    focusRing
  );
}

// — Start flow —
export const startBackArrow = cn(
  "absolute left-4 top-4 z-[2] inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border",
  "bg-[color-mix(in_srgb,var(--color-bg-surface)_88%,transparent)] p-0 text-text shadow-sm",
  "transition-[border-color,background,box-shadow,transform] duration-150 ease-out hover:-translate-x-px hover:border-border-subtle hover:bg-surface-hover hover:shadow-md",
  "active:translate-x-0 active:shadow-sm max-md:left-3 max-md:top-3 max-md:h-11 max-md:w-11",
  focusRing
);

export const startScreen =
  "flex w-full flex-1 flex-col items-center justify-center gap-6 overflow-x-hidden overflow-y-auto px-8 py-10 animate-[start-screen-in_0.32s_var(--ease-out)_both] max-md:justify-start max-md:gap-5 max-md:px-5 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:pt-3 max-sm:gap-4 max-sm:px-4 max-sm:py-3";

export const startScreenSub =
  "relative items-center justify-start gap-5 px-8 pb-10 pt-4 max-md:px-5 max-md:pb-8 max-md:pt-3";

export const startScreenWithGlobe =
  "start-screen--with-globe relative isolate bg-transparent max-md:overflow-x-hidden";

export const startScreenExplore = "w-full justify-center";

export const startScreenContent =
  "start-screen-content relative z-[1] flex w-full flex-col items-center gap-8 max-md:gap-2 max-sm:gap-2";

export const startHeroTitleGroup = "flex flex-col items-center gap-1 max-md:pb-1";

export const startStepHeader =
  "flex w-full shrink-0 flex-col items-center gap-1.5 pt-[3.25rem] text-center max-md:pt-12";

export const startTitle =
  "m-0 text-center text-[clamp(2rem,5vw,2.5rem)] font-extrabold tracking-tight max-md:text-[clamp(1.5rem,6vw,2rem)]";

export const startTitleHero =
  "font-brand relative z-[1] text-[clamp(2rem,5vw,2.5rem)] font-light leading-tight tracking-[0.02em] [text-shadow:0_2px_16px_var(--color-bg),0_0_40px_var(--color-bg)]";

export const startTitleGlobe =
  "start-title-globe relative z-[1] font-brand m-0 text-center font-light leading-[1.05] tracking-[0.02em] text-[clamp(4.5rem,24vw,14rem)]";

export const startSubtitle = "m-0 text-center text-[1.1rem] text-text-muted max-md:text-base";

export const startBrandSubtitle =
  "start-brand-subtitle text-[clamp(0.95rem,2.4vw,1.15rem)] font-semibold lowercase tracking-[0.14em] text-text";

export const startHero =
  "relative mb-1 flex min-h-[clamp(20rem,68vw,28rem)] w-full max-w-[56rem] items-center justify-center max-sm:min-h-[clamp(8rem,30vw,11rem)] short:min-h-[clamp(6rem,22vh,9rem)]";

export const startSection = "flex w-full max-w-[22rem] flex-col items-center gap-5";

export const startSectionWide = "max-w-md";

export const startExploreSection =
  "mx-auto flex w-full max-w-[min(100%,64rem)] flex-col items-center gap-5";

export const startRow = "flex w-full gap-3 max-sm:flex-wrap";

export const startModeRow =
  "grid w-full grid-cols-3 gap-3 p-0.5 max-sm:grid-cols-1 [&_.choice-btn]:min-w-0 [&_.choice-btn]:px-3 [&_.choice-btn]:text-[0.95rem] max-sm:[&_.choice-btn]:py-4";

export function startModeBtn({ selected = false, disabled = false, className } = {}) {
  return cn(
    choiceBtn({ selected, disabled, className }),
    selected &&
      "border-accent bg-accent-soft text-text shadow-[inset_0_0_0_1px_var(--color-accent),0_0_0_2px_var(--color-accent-ring)] focus-visible:outline-none"
  );
}

export const startRegionList = "flex w-full flex-col gap-2";

export const startGlobeSpacer = "start-globe-spacer pointer-events-none w-full";

export const startHomeActions =
  "start-home-actions flex w-full max-w-md flex-col items-center gap-4 max-md:gap-2.5";

export const startLevelList = "w-full max-w-md";

export const startLevelSections =
  "grid w-full max-w-[44rem] grid-cols-2 grid-rows-[auto_auto_auto] justify-center gap-x-8 gap-y-3 max-[36rem]:grid-cols-1 max-[36rem]:grid-rows-none max-[36rem]:gap-6";

export const startLevelSection =
  "grid min-w-0 grid-rows-subgrid row-span-3 gap-3 max-[36rem]:flex max-[36rem]:flex-col max-[36rem]:row-auto";

export const startLevelSectionHeader =
  "flex min-w-0 flex-col gap-1.5 max-[36rem]:contents";

export const startLevelSectionTitle =
  "m-0 text-center text-[0.8rem] font-bold uppercase tracking-[0.08em] text-text-muted";

export const startLevelSectionDesc =
  "m-0 whitespace-nowrap text-center text-[clamp(0.68rem,1.7vw,0.8rem)] font-medium leading-snug text-text-muted max-[36rem]:whitespace-normal";

export const startLevelSectionList =
  "grid w-full max-w-none grid-rows-subgrid row-span-2 items-stretch gap-3 max-[36rem]:flex max-[36rem]:flex-col max-[36rem]:row-auto";

export const startLevelBtn =
  "box-border h-[5.75rem] w-full justify-center";

export const startGameTypeList = "w-full max-w-md [&_.choice-btn-level]:w-full";

export const startMessage = cn(
  "m-0 w-full max-w-md rounded-sm bg-inset px-4 py-3.5 text-center text-[0.95rem] text-text-muted",
  "[&_.primary-btn]:mt-3 [&_.primary-btn]:w-full [&_.secondary-btn]:mt-3 [&_.secondary-btn]:w-full"
);

export function startMessageError(className) {
  return cn(startMessage, "text-error [&_p]:m-0", className);
}

export const goBtn = cn(
  "flex w-3/4 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-0 px-[1.125rem] py-[clamp(0.7rem,2vw,0.95rem)] text-white",
  "bg-gradient-to-br from-green-400 to-green-500 shadow-[0_10px_28px_-10px_rgba(34,197,94,0.55)]",
  "transition-[transform,box-shadow,filter] duration-[0.22s] ease-out enabled:hover:-translate-y-0.5 enabled:hover:brightness-105 enabled:hover:shadow-[0_14px_32px_-10px_rgba(34,197,94,0.7)]",
  "enabled:active:translate-y-0 disabled:cursor-default disabled:opacity-60 max-sm:w-full max-md:py-2.5",
  focusRing
);

export const goBtnIcon =
  "flex h-8 w-8 items-center justify-center rounded-full bg-white/18 [&_svg]:ml-0.5 [&_svg]:h-[1.15rem] [&_svg]:w-[1.15rem]";

export const goBtnLabel =
  "text-[clamp(1.35rem,4vw,1.75rem)] font-extrabold leading-none tracking-tight";

export const goBtnSub = "text-[0.65rem] font-medium opacity-85";

export const exploreBtn =
  "w-full items-center text-center max-md:px-4 max-md:py-3 max-md:[&_.choice-btn-level-desc]:text-[0.78rem]";

// — Game layout —
export const gameShell = "flex h-dvh flex-col";

export const gameHeader =
  "grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border bg-header px-4 py-3 backdrop-blur-[12px] backdrop-saturate-[140%] max-md:grid-cols-1 max-md:gap-y-0 max-md:px-3.5 max-md:py-2.5 max-md:[grid-template-areas:'right']";

export const gameHeaderLeft =
  "flex items-center justify-self-start gap-3 max-md:hidden";

export const gameHeaderCenter =
  "justify-self-center text-center max-md:hidden";

export const gamePromptMobileFloat =
  "pointer-events-none absolute left-1/2 top-3 z-[4] flex w-full -translate-x-1/2 justify-center px-4 md:hidden";

export const gamePromptMobileCard = cn(
  "pointer-events-auto inline-flex w-fit max-w-[calc(100%-2rem)] flex-col items-center rounded-2xl border border-border/50 px-4 py-2 text-center",
  "bg-surface/70 shadow-sm backdrop-blur-md backdrop-saturate-[140%]"
);

export const gameHeaderRight =
  "flex items-center justify-self-end gap-4 max-md:w-full max-md:justify-between max-md:justify-self-stretch max-md:gap-2.5 max-md:[grid-area:right]";

export const gameHeaderActions = "flex items-center gap-2.5 max-md:gap-2";

export const gameMeta = "flex gap-2 max-md:flex-wrap";

export const gameHeaderStats =
  "flex flex-col items-end gap-1";

export const gameProgress =
  "h-[0.35rem] w-[clamp(3.5rem,10vw,6.5rem)] shrink-0 overflow-hidden rounded-pill bg-inset max-md:w-[4.75rem]";

export const gameProgressFill =
  "h-full rounded-[inherit] bg-accent transition-[width] duration-[250ms] ease-out";

export const gameControls = "flex items-center gap-1.5";

export const gameControlBtn = cn(
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border border-border-subtle bg-surface p-0 text-text-menu",
  "transition-[background,border-color,transform] duration-150 ease-out hover:bg-menu-hover hover:border-border-subtle active:scale-[0.96]",
  "max-md:h-7 max-md:w-7 [&_svg]:h-3.5 [&_svg]:w-3.5",
  focusRing
);

export const gameControlBtnStop =
  "hover:border-[color-mix(in_srgb,var(--color-error)_45%,var(--color-border-subtle))] hover:text-error";

export const scoreboard =
  "flex flex-col items-end gap-0.5 text-[0.95rem] font-semibold max-md:text-[0.8rem]";

export const scoreCorrect = "text-success";

export const scoreIncorrect = "text-warning";

export const prompt = "text-xl font-semibold max-md:text-[1.1rem]";

export function promptFeedback({ wrong = false, className } = {}) {
  return cn(prompt, wrong && "text-error", className);
}

export const mapStage = "relative min-h-0 flex-1";

export const mapPauseOverlay = cn(
  "absolute inset-0 z-[5] m-0 cursor-pointer border-0 bg-[rgba(8,12,22,0.18)] p-0 backdrop-blur-[1px]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2"
);

export const mapSidePanels =
  "pointer-events-none absolute right-0 top-0 z-[3] flex w-[min(18rem,42vw)] flex-col max-md:hidden";

export const mapInfoMobileBackdrop = cn(
  "pointer-events-auto absolute inset-0 z-[2] border-0 bg-overlay/35 p-0 backdrop-blur-[1px]",
  "animate-[modal-overlay-in_0.2s_var(--ease-out)_both]",
  focusRing
);

export const mapInfoMobile =
  "pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex flex-col md:hidden";

export const mapInfoMobileSheet = cn(
  "pointer-events-auto overflow-hidden rounded-t-xl border border-b-0 border-border bg-surface shadow-lg",
  "animate-[modal-card-in_0.26s_var(--ease-out)_both] max-h-[min(52vh,26rem)]"
);

export const mapInfoMobileSheetHeader =
  "flex items-center justify-between gap-3 border-b border-border px-4 py-2.5";

export const mapInfoMobileSheetTitle =
  "m-0 text-[0.95rem] font-bold uppercase tracking-wide text-text-muted";

export const mapInfoMobileSheetClose = cn(
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-border bg-transparent p-0 text-lg leading-none text-text-muted",
  "transition-[background,color,border-color] duration-150 ease-out hover:bg-menu-hover hover:text-text",
  focusRing
);

export const mapInfoMobileSheetBody = "overflow-y-auto px-4 py-3";

export const mapInfoMobileTabBar =
  "pointer-events-auto flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md";

export function mapInfoMobileTab({ active = false, className } = {}) {
  return cn(
    "flex-1 cursor-pointer border-0 bg-transparent px-3 py-2.5 text-[0.82rem] font-bold uppercase tracking-wide text-text-muted",
    "transition-[color,background,box-shadow] duration-150 ease-out",
    active && "bg-surface-selected text-text shadow-[inset_0_-2px_0_0_var(--color-accent)]",
    className
  );
}

export const mapInfoMobileTabDivider = "w-px shrink-0 self-stretch bg-border";

export const flagCard =
  "pointer-events-none absolute left-4 top-4 z-[2] rounded-md border border-border bg-surface p-2.5 shadow-lg backdrop-blur-[10px] max-md:left-2 max-md:top-2 max-md:p-2";

export const answerPrompt = "flex flex-col items-center gap-2";

export const answerInput = cn(
  "w-[min(100%,18rem)] rounded-sm border border-border-subtle bg-input px-4 py-2.5 text-center text-lg font-semibold text-text shadow-sm",
  "transition-[border-color,box-shadow] duration-150 ease-out focus:border-accent focus:shadow-[0_0_0_4px_var(--color-accent-soft)] focus:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-70 max-md:w-full max-md:text-[1.1rem]",
  focusRing
);

export const gamePromptMobileInput = cn(
  answerInput,
  "w-auto min-w-[10rem] max-w-[min(100%,16rem)] max-md:w-auto max-md:min-w-[10rem] max-md:max-w-[min(100%,16rem)]"
);

export const spellingSuggestion = "m-0 text-[0.9rem] font-medium text-text-muted";

export const spellingSuggestionLink = cn(
  "cursor-pointer border-0 bg-transparent p-0 font-[inherit] font-semibold text-inherit underline hover:text-link",
  focusRing
);

export function mapFeedback({ type, className } = {}) {
  const base = cn(
    "pointer-events-none absolute left-1/2 top-5 z-[2] flex max-w-[min(90vw,26rem)] -translate-x-1/2 items-center gap-2.5 rounded-full",
    "py-[0.7rem] pl-4 pr-[1.35rem] text-[1.05rem] font-semibold leading-tight tracking-wide backdrop-blur-[14px]",
    "max-md:top-3 max-md:py-2 max-md:pl-3 max-md:pr-3 max-md:text-[0.95rem]",
    "animate-[map-feedback-in_0.18s_cubic-bezier(0.22,1,0.36,1)_both]",
    className
  );
  const variants = {
    correct:
      "border border-green-300/45 bg-gradient-to-br from-green-800/92 to-green-700/88 text-emerald-50 shadow-[0_10px_40px_rgba(34,197,94,0.28),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
    wrong:
      "border border-amber-300/45 bg-gradient-to-br from-amber-900/92 to-orange-800/88 text-amber-50 shadow-[0_10px_40px_rgba(245,158,11,0.22),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
    reveal:
      "border border-red-300/50 bg-gradient-to-br from-red-900/94 to-red-800/90 text-red-50 shadow-[0_10px_40px_rgba(239,68,68,0.3),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
    "got-it":
      "border border-slate-400/45 bg-gradient-to-br from-slate-700/92 to-slate-600/88 text-slate-100 shadow-[0_10px_40px_rgba(15,23,42,0.35),0_0_0_1px_rgba(255,255,255,0.06)_inset]",
  };
  return cn(base, variants[type] ?? variants["got-it"]);
}

export const mapFeedbackIcon = "h-6 w-6 shrink-0";

export const mapFeedbackText = "min-w-0 truncate pr-0.5";

export function flagPrompt({ card = false, className } = {}) {
  return cn(
    "block rounded border border-border object-cover shadow-sm",
    card
      ? "aspect-[3/2] h-auto w-[min(42vw,15rem)] rounded-[0.35rem] border-0 shadow-none max-md:w-[min(36vw,10rem)]"
      : "h-11 w-auto rounded",
    className
  );
}

// — Map side panels —
export function mapSidePanel({ open, className } = {}) {
  return cn(
    "pointer-events-auto flex flex-col overflow-hidden border-l border-border bg-surface shadow-lg",
    "not-first:border-t not-first:border-border last:rounded-bl-md last:border-b last:border-border",
    "max-md:rounded-none max-md:border-l-0 max-md:shadow-none max-md:first:rounded-t-md max-md:first:border-t max-md:first:border-border max-md:last:border-b-0",
    className
  );
}

export function mapSidePanelHeader({ open, className } = {}) {
  return cn(
    "flex items-center justify-between gap-3 border-b border-transparent px-[0.85rem] py-[0.65rem] transition-[border-color] duration-150",
    open && "border-border",
    className
  );
}

export const mapSidePanelHeading = "flex min-w-0 items-center gap-1.5";

export const mapSidePanelTitle =
  "m-0 text-[0.95rem] font-bold uppercase tracking-wide text-text-muted";

export const mapSidePanelShortcut =
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm border border-border bg-inset px-[0.35rem] py-0.5 font-[inherit] text-[0.68rem] font-semibold leading-tight text-text-muted";

export const mapSidePanelToggle = cn(
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm border border-border bg-transparent p-0 text-text-muted",
  "transition-[background,color,border-color] duration-150 ease-out hover:bg-menu-hover hover:text-text max-md:h-11 max-md:w-11",
  focusRing
);

export function mapSidePanelChevron({ open, className } = {}) {
  return cn(
    "block h-[0.45rem] w-[0.45rem] -translate-y-px rotate-45 border-b-2 border-r-2 border-current transition-transform duration-[220ms] ease-out",
    open
      ? "translate-y-0.5 -rotate-[135deg] max-md:-translate-y-px max-md:rotate-45"
      : "max-md:translate-y-0.5 max-md:-rotate-[135deg]",
    className
  );
}

export function mapSidePanelBody({ open, className } = {}) {
  return cn(
    "overflow-hidden px-[0.85rem] transition-[max-height,opacity,padding] duration-[280ms] ease-out",
    open
      ? "max-h-[min(70vh,24rem)] overflow-y-auto py-3 opacity-100 max-md:max-h-[min(36vh,16rem)]"
      : "max-h-0 py-0 opacity-0",
    className
  );
}

export const countryHintHeader = "mb-2 flex items-center justify-between gap-2";

export const countryHintTitle =
  "m-0 text-[0.82rem] font-bold uppercase tracking-wide text-text-muted";

export const countryHintList = "m-0 flex list-none flex-col gap-1.5 p-0";

export function countryHintItem({ revealed = false } = {}) {
  return cn(
    "rounded-sm bg-inset px-2 py-1.5 text-[0.92rem] font-semibold tracking-[0.08em] text-text-muted",
    revealed && "tracking-normal text-text"
  );
}

export const countryHintEmpty = "m-0 text-[0.88rem] text-text-muted";

export const countryHintNote = "mt-2.5 m-0 text-[0.88rem] italic text-text-muted";

export const countryHintFacts = "mt-[1.1rem] border-t border-border pt-4";

export const countryHintCount =
  "text-[0.72rem] font-semibold tracking-wide text-text-muted";

export const countryFact =
  "flex flex-col gap-1.5 rounded-sm bg-inset px-2.5 py-2.5";

export const countryFactText = "m-0 text-[0.92rem] leading-snug text-text";

export const countryFactNext = cn(
  "mt-2.5 inline-flex cursor-pointer self-start rounded-sm border border-border bg-transparent px-3 py-1.5 text-[0.85rem] font-semibold text-text-secondary",
  "transition-[background,color,border-color] duration-150 ease-out hover:border-border-subtle hover:bg-menu-hover hover:text-text",
  focusRing
);

const FACT_BADGE_COLORS = {
  history: "border-amber-500/35 bg-amber-500/16 text-amber-300",
  politics: "border-blue-400/35 bg-blue-500/16 text-blue-300",
  society: "border-purple-400/35 bg-purple-500/16 text-purple-300",
  geography: "border-teal-400/35 bg-teal-500/16 text-teal-300",
};

export function countryFactBadge(category) {
  return cn(
    "inline-flex items-center self-start whitespace-nowrap rounded-pill border px-[0.45rem] py-0.5 text-[0.66rem] font-bold uppercase tracking-wide",
    FACT_BADGE_COLORS[category] ?? "border-border bg-inset text-text-muted"
  );
}

export const countryReferenceList = "m-0 flex flex-col gap-2.5";

export const countryReferenceRow = "grid grid-cols-[5.5rem_1fr] items-start gap-2.5";

export const countryReferenceLabel =
  "m-0 text-[0.78rem] font-bold uppercase tracking-wide text-text-muted";

export const countryReferenceValue = "m-0 text-[0.98rem] font-semibold text-text";

export const countryReferenceFlag = "max-w-40 w-full";

export const countryReferenceEmpty = "m-0 text-[0.88rem] text-text-muted";

export const countryReferenceNote = "m-0 text-[0.88rem] italic text-text-muted";

export const countryReferenceFacts = "mt-4 border-t border-border pt-4";

export const countryReferenceFactsTitle =
  "m-0 mb-2.5 text-[0.82rem] font-bold uppercase tracking-wide text-text-muted";

export const countryReferenceFactsList = "m-0 flex list-none flex-col gap-2.5 p-0";

export const countryReferenceFact = "flex flex-col gap-1.5";

export const countryReferenceFactText = "text-[0.9rem] leading-snug text-text-secondary";

// — Results —
export const resultsPage = "flex min-h-dvh flex-col";

export const resultsContent =
  "mx-auto w-full max-w-4xl flex-1 px-4 pb-10 pt-6 max-md:px-3 max-md:pb-[max(2.5rem,env(safe-area-inset-bottom))]";

export const resultsBack =
  "mb-4 inline-block text-[0.9rem] font-semibold text-link no-underline hover:underline";

export const resultsTitle = "mb-1.5 text-[clamp(1.5rem,5vw,1.75rem)] font-bold";

export const resultsSubtitle = "mb-6 text-base text-text-muted";

export const resultsMessage = "m-0 text-text-muted";

export const resultsMessageError = "text-error";

export const resultsSignIn =
  "flex flex-col items-start gap-4 rounded-lg border border-border bg-surface p-6 shadow-md";

export const resultsTables = "flex flex-col gap-5";

export const resultsGroupTitle =
  "mb-[-0.25rem] mt-3 text-[1.15rem] font-bold tracking-tight first:mt-0";

export const resultsGroupNote = "m-0 text-[0.9rem] leading-snug text-text-muted";

export const resultsSection =
  "flex flex-col gap-3 rounded-lg border border-border bg-surface p-6 shadow-md max-md:p-4";

export const resultsTableTitle =
  "m-0 text-[0.8rem] font-bold uppercase tracking-[0.08em] text-text-muted";

export const resultsTableWrap =
  "overflow-x-auto rounded-md border border-border [-webkit-overflow-scrolling:touch]";

export const resultsMobileCards = "flex flex-col gap-3 md:hidden";

export const resultsTable =
  "w-full border-collapse text-[0.9rem] [&_tbody_tr:hover_td]:bg-surface-hover [&_td]:border [&_td]:border-border [&_td]:p-2.5 [&_td]:text-center [&_td]:tabular-nums [&_td]:text-text [&_th]:border [&_th]:border-border [&_th]:p-2.5";

export const resultsTableColHeader =
  "bg-inset font-semibold text-text-muted";

export const resultsTableRowHeader =
  "results-table-sticky-col whitespace-nowrap bg-inset text-left font-semibold text-text-secondary";

export const resultsMobileCard =
  "rounded-md border border-border bg-inset p-3";

export const resultsMobileCardTitle =
  "m-0 mb-2 text-[0.95rem] font-bold text-text-secondary";

export const resultsMobileGrid =
  "grid grid-cols-2 gap-2 sm:grid-cols-3";

export const resultsMobileCell =
  "flex flex-col gap-0.5 rounded-sm bg-surface px-2.5 py-2 text-center";

export const resultsMobileCellLabel =
  "text-[0.72rem] font-bold uppercase tracking-wide text-text-muted";

export const resultsMobileCellValue =
  "text-[0.95rem] font-semibold tabular-nums text-text";

export const masteryCell = "relative overflow-hidden";

export const masteryCellBar =
  "absolute inset-y-0 left-0 z-0 border-r-2 border-accent bg-accent-soft transition-[width] duration-[0.22s] ease-out";

export const masteryCellValue = "relative z-[1] tabular-nums";

// — Celebration —
export function celebrationOverlay({ leaving = false } = {}) {
  return cn(
    "fixed inset-0 z-[60] flex cursor-pointer items-center justify-center overflow-hidden bg-[rgba(8,12,22,0.55)] p-6 opacity-100 backdrop-blur-[2px] transition-opacity duration-500 ease-out",
    leaving && "opacity-0"
  );
}

export const celebrationCard =
  "relative z-[1] flex max-w-[min(90vw,26rem)] flex-col items-center gap-1.5 rounded-lg border border-border-subtle bg-[color-mix(in_srgb,var(--color-bg-surface)_90%,transparent)] px-8 py-7 text-center shadow-[var(--shadow-lg),0_0_60px_-10px_var(--color-accent-ring)] animate-[celebration-pop_0.4s_var(--ease-out)_both]";

export const celebrationEmoji =
  "text-[3.5rem] leading-none animate-[celebration-bounce_1.4s_var(--ease-out)_infinite]";

export const celebrationHeadline =
  "m-0 mt-1 text-[1.6rem] font-extrabold tracking-tight text-text";

export const celebrationSubtitle = "m-0 text-base leading-snug text-text-secondary";

export const celebrationHint =
  "m-0 mt-2.5 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-text-muted";

export const celebrationConfetti =
  "pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden";

export const celebrationConfettiPiece =
  "celebration-confetti-piece absolute top-[-10%] h-[0.9rem] w-[0.6rem] rounded-[1px] opacity-0";

export const celebrationConfettiPieceRound =
  "celebration-confetti-piece--round h-[0.7rem] w-[0.7rem] rounded-full";

// — Mastery page —
export const masteryPage =
  "min-h-dvh bg-[radial-gradient(120%_90%_at_50%_-10%,#142544_0%,#0a1426_45%,#050a16_100%)] text-slate-200";

export const masteryContent =
  "mx-auto max-w-6xl px-[clamp(1rem,4vw,2rem)] pb-12 pt-6 max-md:pb-[max(2.5rem,env(safe-area-inset-bottom))]";

export const masteryBack =
  "mb-4 inline-block font-medium text-slate-400 no-underline transition-colors duration-150 hover:text-slate-200";

export const masteryHead = "mb-5";

export const masteryTitle =
  "m-0 bg-gradient-to-r from-cyan-400 via-purple-400 to-amber-400 bg-clip-text text-[clamp(1.5rem,5vw,2.5rem)] font-extrabold tracking-tight text-transparent";

export const masterySubtitle = "mt-1.5 text-[1.05rem] text-slate-400";

export const masteryMessage = "text-base text-slate-300";

export const masteryMessageError = "text-red-300";

export const masterySignIn =
  "flex flex-col items-start gap-4 rounded-lg border border-slate-400/20 bg-slate-900/50 p-6";

export const masteryToolbar =
  "mb-4 flex flex-wrap items-center justify-between gap-3";

export const masteryTabs =
  "flex flex-wrap gap-1.5 rounded-pill border border-slate-400/15 bg-slate-900/55 p-1";

export function masteryTab({ active = false, className } = {}) {
  return cn(
    "inline-flex cursor-pointer items-center gap-1.5 rounded-pill border border-transparent bg-transparent px-4 py-2 text-[0.9rem] font-semibold text-slate-400",
    "transition-[color,background,border-color] duration-150 hover:bg-slate-400/10 hover:text-slate-200 max-md:px-3 max-md:py-2.5",
    active && "bg-[rgba(2,6,18,0.55)]",
    className
  );
}

export const masteryTabDot = "h-2.5 w-2.5 rounded-full shadow-[0_0_8px_currentColor]";

export const masteryShare = "shrink-0 max-md:w-full";

export const masteryStage =
  "grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]";

export const masteryMapWrap =
  "mastery-map-wrap relative h-[min(64vh,38rem)] overflow-hidden rounded-lg border border-slate-400/20 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]";

export const masteryMapCanvas = "h-full w-full";

export const masteryTooltip =
  "pointer-events-none absolute z-[5] flex min-w-36 flex-col gap-0.5 rounded-md border border-slate-400/25 bg-[rgba(2,6,18,0.92)] px-2.5 py-2 text-[0.82rem] text-slate-200 shadow-lg [&_strong]:mb-0.5 [&_strong]:text-[0.92rem]";

export const masteryTooltipRow =
  "flex items-center gap-1.5 text-slate-300 [&_em]:ml-auto [&_em]:font-bold [&_em]:not-italic [&_em]:text-slate-50";

export const masteryTooltipDot = "h-[0.55rem] w-[0.55rem] rounded-full";

export const masteryPanel =
  "flex flex-col items-center gap-4 rounded-lg border border-slate-400/15 bg-slate-900/50 p-5 max-md:p-4";

export const masteryRing = "h-36 w-36";

export const masteryRingTrack = "fill-none stroke-[10] stroke-slate-400/20";

export const masteryRingFill =
  "origin-center -rotate-90 fill-none stroke-[10] stroke-linecap-round transition-[stroke-dashoffset,stroke] duration-[800ms] ease-out [filter:drop-shadow(0_0_6px_currentColor)]";

export const masteryRingValue =
  "fill-slate-50 text-[1.6rem] font-extrabold [text-anchor:middle]";

export const masteryRingLabel =
  "fill-slate-400 text-[0.7rem] font-semibold uppercase tracking-[0.08em] [text-anchor:middle]";

export const masteryStatLine =
  "m-0 text-center text-base leading-snug text-slate-400 [&_strong]:text-2xl";

export const masteryLegend =
  "flex w-full flex-col gap-2 border-t border-slate-400/15 pt-2";

export const masteryLegendTitle =
  "text-[0.75rem] font-bold uppercase tracking-[0.08em] text-slate-400";

export const masteryLegendRow =
  "flex items-center gap-2 text-[0.85rem] text-slate-300 [&_em]:ml-auto [&_em]:font-bold [&_em]:not-italic [&_em]:text-slate-50";

export const masterySwatch = "h-3 w-3 shrink-0 rounded-sm";

export const masteryGradientBar = "h-2 w-full rounded-pill";

export const masteryLegendScale =
  "flex justify-between text-[0.72rem] text-slate-500";

// — Map containers (shared with Pacific/Mapbox) —
export const mapContainer = "h-full min-h-0 w-full flex-1";

export const pacificMap = "relative overflow-hidden bg-inset";

export const pacificMapSvg = "block h-full w-full cursor-grab touch-none active:cursor-grabbing";

export const pacificMapCountryClickable = "cursor-pointer hover:brightness-110";

export const pacificMapControlBtn = cn(
  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm border border-border bg-surface p-0 text-base font-semibold leading-none text-text shadow-md transition-[background] duration-150 hover:bg-menu-hover max-md:h-11 max-md:w-11",
  focusRing
);

export const pacificMapControlBtnWide = "text-[0.95rem]";

export const pacificMapControls =
  "pointer-events-auto absolute bottom-3 right-3 z-[4] flex flex-col gap-1.5 max-md:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-md:right-2";
