"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import MapCountryInfoPanels from "@/components/MapCountryInfoPanels";
import FlagPrompt from "@/components/FlagPrompt";
import GameModeIntro from "@/components/GameModeIntro";
import GameTutorial from "@/components/GameTutorial";
import GameTutorialButton from "@/components/GameTutorialButton";
import DiscoverCompleteModal from "@/components/DiscoverCompleteModal";
import DiscoverCountrySheet from "@/components/DiscoverCountrySheet";
import DiscoverMapLabels from "@/components/DiscoverMapLabels";
import DiscoverTerritoryModal from "@/components/DiscoverTerritoryModal";
import GameCompleteModal from "@/components/GameCompleteModal";
import LearnRoundOverlay from "@/components/learn/LearnRoundOverlay";
import IdlePromptModal from "@/components/IdlePromptModal";
import { buildLearnWrongReveal, isNeighborLearnQuestion, isMapBorderSpoilingQuestion, getNeighborIdsForQuestion } from "@/lib/learn/wrongReveal";
import { resolveGuessedCountryInRegion } from "@/lib/learn/resolveGuessedCountry";
import { matchDiscoverTerritoryNote } from "@/lib/discoverTerritories";
import MapFeedback from "@/components/MapFeedback";
import MapboxMap from "@/components/MapboxMap";
import PacificMap from "@/components/PacificMap";
import PronunciationButton from "@/components/PronunciationButton";
import SoundVolumeButton from "@/components/SoundVolumeButton";
import StartScreen from "@/components/StartScreen";
import { CORRECT_ROUND_DELAY_MS, MAX_ATTEMPTS, REVEAL_ROUND_DELAY_MS, normalizeName } from "@/lib/constants";
import {
  fetchMasteryStats,
  fetchWeakCountryStats,
  fetchLearnChallenge,
  saveLearnChallenge,
  recordCountryStat,
  ROUND_OUTCOMES,
} from "@/lib/countryStats";
import {
  countryFromFeature,
  isCorrectCountry,
  isCorrectTextAnswer,
  loadCountriesGeoJSON,
  shuffleCountries,
} from "@/lib/countries";
import { getSpellingSuggestion } from "@/lib/spelling";
import { cn } from "@/lib/cn";
import { enrichGeojsonWithColors, getCountryColorMap } from "@/lib/countryColors";
import { getMapViewForRegion, getLearnFocusMapView, getCountryWithNeighbors, buildSmallCountriesGeoJSON } from "@/lib/geometry";
import { GAME_TYPES, getGameTypeLabel } from "@/lib/gameTypes";
import { GAME_TYPE_FOR_STATS } from "@/lib/mastery";
import {
  appendGuestRound,
  clearPendingGuestGame,
  getPendingGuestGame,
  setPendingGuestScore,
  syncPendingGuestGame,
} from "@/lib/pendingGuestGame";
import { buildLearningQueue, buildFullRegionLearningQueue } from "@/lib/learning";
import { buildLearnSession, rebuildQuestionsForCountries } from "@/lib/learn/sessionSequencer";
import {
  createDefaultChallenge,
  normalizeChallenge,
  updateChallengeLevel,
  challengeOutcomeFromAnswer,
} from "@/lib/learn/challengeLevel";
import { buildLearnStatPayload, logLearnEmaUpdate } from "@/lib/learn/emaIntegration";
import { fetchSeenFacts } from "@/lib/learn/factsClient";
import { buildLearnSessionSummary } from "@/lib/learn/sessionSummary";
import { getGameTourId } from "@/lib/gameTutorial";
import { getGameModeIntro } from "@/lib/gameModeIntro";
import { getGameTutorialSteps } from "@/lib/gameTutorialSteps";
import { useMobileViewport } from "@/lib/hooks/useMobileViewport";
import {
  hasCompletedGameTourLocally,
  markGameTourCompletedLocally,
} from "@/lib/onboardingPrefs";
import { getReferencePanelDefaultOpen } from "@/lib/referencePanelPrefs";
import {
  COUNTRY_FLASH_MS,
  GAME_LEVELS,
  getLevelLabel,
  getMasteryProvingLevels,
  isFindLevel,
  isNameLevel,
  isProgressiveFillLevel,
  usesColorFlash,
  WRONG_CLICK_FLASH_MS,
} from "@/lib/levels";
import {
  GAME_MODES,
  getModeLabel,
  REGIONS,
  buildGameGeojson,
  buildInactiveGeojson,
  filterCountriesByRegion,
} from "@/lib/regions";
import {
  START_STEPS,
  buildPlayingUrl,
  buildStartScreenUrl,
  isPlayingSearchParams,
} from "@/lib/startNavigation";
import { playCorrectSound, playIncorrectSound } from "@/lib/sounds";
import { playCapitalPronunciation, playCountryPronunciation } from "@/lib/pronunciation";
import { PRONUNCIATION_KINDS } from "@/lib/pronunciationVoices";
import {
  getDiscoverInstructionText,
  getDiscoverLabelContent,
} from "@/lib/discoverLabels";
import { formatElapsedTime } from "@/lib/time";
import {
  answerInput,
  answerPrompt,
  flagCard,
  gameControlBtn,
  gameControlBtnStop,
  gameControls,
  gameHeader,
  gameHeaderActions,
  gameHeaderCenter,
  gameHeaderCenterDiscoverMobile,
  gameHeaderDiscoverMobile,
  gameHeaderDiscoverPrompt,
  gameHeaderLeft,
  gameHeaderLeftDiscoverMobile,
  gameHeaderMobileDefault,
  gameHeaderRightDiscoverMobile,
  gameHeaderRightMobilePlay,
  gameHeaderTimerMobile,
  gameHeaderStats,
  gamePromptMobileFloat,
  gamePromptMobileCard,
  gamePromptMobileInput,
  gameMeta,
  gameMetaTag,
  gameMetaTagButton,
  gameProgress,
  gameProgressFill,
  gameShell,
  gameTimer,
  mapPauseOverlay,
  mapFeedbackAnchor,
  mapOverlayStack,
  mapStage,
  modalActions,
  modalCard,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
  prompt,
  promptFeedback,
  promptWithPronunciation,
  scoreboard,
  scoreCorrect,
  scoreIncorrect,
  secondaryBtn,
  spellingSuggestion,
  spellingSuggestionLink,
  startScreen,
  startSubtitle,
  focusRing,
} from "@/lib/ui";
import { useSyncRef } from "@/lib/hooks/useSyncRef";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useGameTimer } from "@/lib/hooks/useGameTimer";
import { useRoundScoring } from "@/lib/hooks/useRoundScoring";
import { useCountryQueue } from "@/lib/hooks/useCountryQueue";
import { useIdleDetection } from "@/lib/hooks/useIdleDetection";
import { useGameBoard } from "@/lib/hooks/useGameBoard";
import { useSession } from "next-auth/react";

// Number of countries in a "Go" quick-review session.
const GO_SESSION_SIZE = 10;

function CountryPromptLabel({
  text,
  iso3,
  kind = PRONUNCIATION_KINDS.COUNTRY,
  toneClassName,
  pronunciationDisabled = false,
}) {
  if (!text) return null;

  if (!iso3) {
    return toneClassName ? <span className={toneClassName}>{text}</span> : text;
  }

  return (
    <span className={promptWithPronunciation}>
      <span className={toneClassName}>{text}</span>
      <PronunciationButton
        iso3={iso3}
        label={text}
        kind={kind}
        inline
        disabled={pronunciationDisabled}
      />
    </span>
  );
}

// A country counts as already mastered for a level if it is effectively
// graduated at that level or at a proving level (the mastery API applies decay).
function getMasteredCountryIds(masteryRows, level) {
  const relevantLevels = new Set([level, ...getMasteryProvingLevels(level)]);
  const mastered = new Set();
  for (const row of masteryRows) {
    if (row.graduated && relevantLevels.has(row.level)) {
      mastered.add(row.countryId);
    }
  }
  return mastered;
}

/** Test/Learn map toast titles: Correct (green), Correct second try (orange), Incorrect (red). */
function outcomeFeedback({ correct, secondTry = false, detail = null }) {
  if (correct) {
    const feedback = secondTry
      ? { text: "Correct second try", type: "second-try" }
      : { text: "Correct", type: "correct" };
    return detail ? { ...feedback, detail } : feedback;
  }
  return detail
    ? { text: "Incorrect", type: "incorrect", detail }
    : { text: "Incorrect", type: "incorrect" };
}

export default function GeographyGame() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: authSession, status: authStatus } = useSession();
  const isMobile = useMobileViewport();
  const [allCountries, setAllCountries] = useState([]);
  const [displayMapCountries, setDisplayMapCountries] = useState([]);
  const [territoryGeojson, setTerritoryGeojson] = useState({
    type: "FeatureCollection",
    features: [],
  });
  const [loadError, setLoadError] = useState(null);
  const [session, setSession] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [spellingSuggestionText, setSpellingSuggestionText] = useState(null);
  const [showMenuConfirm, setShowMenuConfirm] = useState(false);
  const [leaveConfirmUrl, setLeaveConfirmUrl] = useState(null);
  const [flagsClickHeader, setFlagsClickHeader] = useState(null);
  const [learnMorePanelOpen, setLearnMorePanelOpen] = useState(false);
  const [discoverCountrySheetOpen, setDiscoverCountrySheetOpen] = useState(false);
  const [discoverTerritoryNote, setDiscoverTerritoryNote] = useState(null);
  const [discoverLabelsById, setDiscoverLabelsById] = useState({});
  const [discoverAnimatingLabel, setDiscoverAnimatingLabel] = useState(null);
  const [discoverHoveredCountryId, setDiscoverHoveredCountryId] = useState(null);
  /** Country name titles shown on the map after a wrong "highlighted country" answer. */
  const [learnFeedbackLabelsById, setLearnFeedbackLabelsById] = useState({});
  const [mapViewRevision, setMapViewRevision] = useState(0);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialManualOpen, setTutorialManualOpen] = useState(false);
  const [tutorialStepId, setTutorialStepId] = useState(null);
  const [modeIntroOpen, setModeIntroOpen] = useState(false);
  const [tourCompleted, setTourCompleted] = useState(false);
  const [tourStatusReady, setTourStatusReady] = useState(false);
  // Stays true from game start until the mode intro / first-run tour is dismissed,
  // so the first country is not announced during the open-race before the modal mounts.
  const [onboardingGateOpen, setOnboardingGateOpen] = useState(false);
  const [masteryLoadWarning, setMasteryLoadWarning] = useState(false);

  // ── Learn-mode mixed-question engine (separate from the classic Find/Name loop).
  // Only active for Learn sessions started from the wizard — NOT Go (find-only) or
  // Test/Discover, which keep the classic round loop untouched.
  const [learnQuestions, setLearnQuestions] = useState(null);
  const [learnIndex, setLearnIndex] = useState(0);
  const [learnSummary, setLearnSummary] = useState(null);
  const learnQuestionsRef = useRef(null);
  const learnIndexRef = useRef(0);
  const learnAnswersRef = useRef([]);
  const learnMasteryBeforeRef = useRef(new Map());
  const learnMasteryAfterRef = useRef(new Map());
  const learnSeenFactsRef = useRef({});
  const learnMapEmitRef = useRef(null);
  const learnQuestionStartRef = useRef(0);
  const learnLockRef = useRef(false);
  const learnAdvanceTimerRef = useRef(null);
  const currentLearnQuestionRef = useRef(null);
  // After a wrong Learn answer, pause until the learner taps Continue.
  const [learnAwaitingContinue, setLearnAwaitingContinue] = useState(false);
  const [learnContinueMessage, setLearnContinueMessage] = useState(null);
  const learnAwaitingContinueRef = useRef(false);
  // Neighbor wrongs: map teach step (highlight + border colors + titles).
  const [learnNeighborMapVisible, setLearnNeighborMapVisible] = useState(false);
  // Area-compare wrongs: larger green / smaller red on the map with area labels.
  const [learnAreaCompareReveal, setLearnAreaCompareReveal] = useState(null);
  // Landlocked wrongs: show the country on the map with bottom Continue.
  const [learnLandlockedReveal, setLearnLandlockedReveal] = useState(null);
  // Highlight wrongs ("which country is highlighted"): correct + guessed titles.
  const [learnHighlightWrongReveal, setLearnHighlightWrongReveal] = useState(null);
  // Soft miss on map-click: name the clicked country, then Try again (no score yet).
  const [learnAwaitingRetry, setLearnAwaitingRetry] = useState(false);
  const [learnRetryMessage, setLearnRetryMessage] = useState(null);
  const learnMapMissedRef = useRef(false);
  const learnChallengeRef = useRef(createDefaultChallenge());
  const learnSampledRef = useRef([]);
  const learnMasteryStatsRef = useRef(new Map());
  const learnCategoryRef = useRef("countries");
  const learnRegionRef = useRef(null);

  const mapContainerRef = useRef(null);
  const gamePromptAnchorRef = useRef(null);
  const mobilePromptRef = useRef(null);
  const gameControlsRef = useRef(null);
  const gameHeaderStatsRef = useRef(null);
  const pacificControlsRef = useRef(null);
  const pendingOnboardingPromptRef = useRef(false);
  const discoverHeaderAnchorRef = useRef(null);
  const discoverMobileAnchorRef = useRef(null);
  const learnMorePanelRef = useRef(null);
  const mapProjectRef = useRef(null);

  const closeInfoPanels = useCallback(() => {
    setLearnMorePanelOpen(false);
    setDiscoverCountrySheetOpen(false);
    setDiscoverTerritoryNote(null);
  }, []);

  const closeDiscoverCountrySheet = useCallback(() => {
    setDiscoverCountrySheetOpen(false);
  }, []);

  const closeDiscoverTerritoryNote = useCallback(() => {
    setDiscoverTerritoryNote(null);
  }, []);

  const toggleLearnMorePanel = useCallback(() => {
    setLearnMorePanelOpen((open) => !open);
  }, []);

  const assignGamePromptAnchorRef = useCallback((node) => {
    gamePromptAnchorRef.current = node;
    discoverHeaderAnchorRef.current = node;
  }, []);

  const assignMobilePromptRef = useCallback((node) => {
    mobilePromptRef.current = node;
    discoverMobileAnchorRef.current = node;
  }, []);
  const [gamePaused, setGamePaused] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const resumeDialogRef = useFocusTrap(showResumeConfirm);
  const menuDialogRef = useFocusTrap(showMenuConfirm);
  const [discoverCompleteModalOpen, setDiscoverCompleteModalOpen] = useState(false);
  const discoverCompleteShownRef = useRef(false);
  // Snapshot of mastery before/after the just-finished game, used to detect
  // milestones in the complete modal. `undefined` until the game finishes.
  const [milestoneStats, setMilestoneStats] = useState(undefined);
  const [guestSyncState, setGuestSyncState] = useState(null);

  // Game stopwatch (runs only while a scored game is active and not finished).
  const timer = useGameTimer(
    Boolean(session) &&
      gameActive &&
      !gameComplete &&
      session?.gameType !== GAME_TYPES.DISCOVER
  );
  const {
    elapsedMs,
    finalElapsedMs,
    resetPause: resetTimerPause,
    pause: pauseGameTimer,
    resume: resumeGameTimer,
    start: startGameTimer,
    stop: stopGameTimer,
    reset: resetGameTimer,
  } = timer;

  // Right/wrong counts and the list of missed countries.
  const scoring = useRoundScoring();
  const {
    rightCount,
    wrongCount,
    rightCountRef,
    wrongCountRef,
    roundMarkedIncorrectRef,
    incorrectTargetsRef,
    reset: resetScoring,
    beginRound: beginRoundScoring,
    markRoundCorrect,
    markRoundIncorrect,
  } = scoring;

  // The shuffled country queue and the current target.
  const queue = useCountryQueue();
  const {
    targetCountry,
    targetCountryRef,
    queueRef: countryQueueRef,
    setTarget,
    loadQueue,
    advance: advanceQueue,
    reset: resetQueue,
  } = queue;

  // Everything the map currently displays (highlights, fills, flashes, feedback).
  const gameBoard = useGameBoard();
  const {
    board,
    revealModeRef,
    setFeedback,
    setRevealMode,
    setHighlightCountryId,
    setFlashSmallCountryId,
    addWrongCountry,
    addRoundWrongCountry,
    setFlashWrongCountryIds,
    clearFlashWrongIfOnly,
    clearRoundWrongCountries,
    addFilledCountry,
    setFilledCountryIds,
    setWrongCountryIds,
    setShowColorCountryIds,
    clearShowColorIfOnly,
    startGameBoard,
    startRoundBoard,
    finishGameBoard,
    resetBoard,
  } = gameBoard;
  const {
    revealMode,
    feedback,
    highlightCountryId,
    flashSmallCountryId,
    wrongCountryIds,
    roundWrongCountryIds,
    flashWrongCountryIds,
    filledCountryIds,
    showColorCountryIds,
  } = board;

  const filledCountryIdSet = useMemo(() => new Set(filledCountryIds), [filledCountryIds]);

  const wrongAttemptsRef = useRef(0);
  const nextRoundTimeoutRef = useRef(null);
  const colorFlashTimeoutRef = useRef(null);
  const wrongFlashTimeoutRef = useRef(null);
  const answerInputRef = useRef(null);
  const handleBackToMenuRef = useRef(() => {});
  const gameInHistoryRef = useRef(false);
  const suppressPlayCheckRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const roundStartTimeRef = useRef(null);
  const revealStatRecordedRef = useRef(false);
  // Per-country mastery records captured from the round-stat responses the game
  // already makes, so milestones need no extra API calls.
  const sessionStatRecordsRef = useRef(new Map());
  const pendingStatPromisesRef = useRef([]);
  const preCreditedIdsRef = useRef([]);
  const regionCountryIdsRef = useRef([]);

  // Refs that always mirror the latest state for synchronous reads in handlers.
  const gameActiveRef = useSyncRef(gameActive);
  const gamePausedRef = useSyncRef(gamePaused);

  const signedIn = authStatus === "authenticated" && authSession?.user;
  const signedInRef = useSyncRef(signedIn);
  const sessionRef = useSyncRef(session);

  // "Are you still there?" idle handling. onIdleReturn runs handleBackToMenu,
  // which is defined later, so we route it through a ref to break the cycle.
  const handleIdleReturn = useCallback(() => handleBackToMenuRef.current(), []);
  const idle = useIdleDetection({
    active:
      Boolean(session) &&
      gameActive &&
      !gameComplete &&
      session?.gameType !== GAME_TYPES.DISCOVER,
    paused: gamePaused,
    pauseTimer: pauseGameTimer,
    resumeTimer: resumeGameTimer,
    resetTimerPause,
    onIdleReturn: handleIdleReturn,
  });
  const {
    promptOpen: idlePromptOpen,
    resetIdleState,
    scheduleIdlePrompt,
    handleIdleContinue,
    clearIdleTimers,
    closePrompt: closeIdlePrompt,
  } = idle;

  const hasToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

  useEffect(() => {
    loadCountriesGeoJSON()
      .then(({ countries, displayMapCountries: mapOnly, territoryGeojson: territories }) => {
        setAllCountries(countries);
        setDisplayMapCountries(mapOnly ?? []);
        setTerritoryGeojson(
          territories ?? { type: "FeatureCollection", features: [] }
        );
      })
      .catch((error) => setLoadError(error.message || "Failed to load country data."));
  }, []);

  useEffect(() => {
    if (!masteryLoadWarning) return;
    const timeoutId = setTimeout(() => setMasteryLoadWarning(false), 8000);
    return () => clearTimeout(timeoutId);
  }, [masteryLoadWarning]);

  useEffect(() => {
    return () => {
      if (nextRoundTimeoutRef.current) {
        clearTimeout(nextRoundTimeoutRef.current);
      }
      if (colorFlashTimeoutRef.current) {
        clearTimeout(colorFlashTimeoutRef.current);
      }
      if (wrongFlashTimeoutRef.current) {
        clearTimeout(wrongFlashTimeoutRef.current);
      }
      if (learnAdvanceTimerRef.current) {
        clearTimeout(learnAdvanceTimerRef.current);
      }
    };
  }, []);

  const activeCountries = useMemo(() => {
    if (!session) return [];
    return filterCountriesByRegion(allCountries, session.region);
  }, [allCountries, session]);

  const regionMapCountries = useMemo(
    () => [...allCountries, ...displayMapCountries],
    [allCountries, displayMapCountries]
  );

  const allCountriesById = useMemo(
    () => new Map(allCountries.map((country) => [country.id, country])),
    [allCountries]
  );

  // Country lookup for the Learn engine UI (flags, comparative stats) and summary.
  const resolveLearnCountry = useCallback(
    (countryId) => {
      const country = allCountriesById.get(countryId);
      if (!country) return {};
      return {
        name: country.name,
        iso2: country.iso2,
        population: country.population,
        area: country.area,
        neighborCount: Array.isArray(country.neighbors) ? country.neighbors.length : 0,
        capital: country.capital,
        facts: country.facts,
      };
    },
    [allCountriesById]
  );

  // Countries that crossed the graduation bar for the first time this round
  // (were not graduated before, are now), surfaced in the end-of-game modal.
  const newlyGraduatedNames = useMemo(() => {
    const records = milestoneStats?.statRecords;
    if (!records) return [];

    const nameById = new Map(allCountries.map((country) => [country.id, country.name]));
    const names = [];
    for (const [countryId, record] of Object.entries(records)) {
      if (record?.afterGraduated && !record?.beforeGraduated) {
        names.push(nameById.get(countryId) ?? countryId);
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  }, [milestoneStats, allCountries]);

  useEffect(() => {
    regionCountryIdsRef.current = activeCountries.map((country) => country.id);
  }, [activeCountries]);

  const isOceaniaRegion = session?.region === "oceania";

  const inactiveCountries = useMemo(() => {
    if (!isOceaniaRegion) return [];
    return allCountries.filter((country) => country.region !== "oceania");
  }, [allCountries, isOceaniaRegion]);

  const countryColorMap = useMemo(
    () => getCountryColorMap(activeCountries),
    [activeCountries]
  );

  const activeGeojson = useMemo(() => {
    const base = buildGameGeojson(activeCountries);
    return enrichGeojsonWithColors(base, countryColorMap);
  }, [activeCountries, countryColorMap]);

  const activeSmallCountriesGeojson = useMemo(() => {
    const base = buildSmallCountriesGeoJSON(activeCountries);
    return enrichGeojsonWithColors(base, countryColorMap);
  }, [activeCountries, countryColorMap]);

  const inactiveGeojson = useMemo(() => {
    const inactive = buildInactiveGeojson(allCountries, session?.region);
    const territoryFeatures = territoryGeojson?.features ?? [];
    if (territoryFeatures.length === 0) return inactive;
    return {
      type: "FeatureCollection",
      features: [...inactive.features, ...territoryFeatures],
    };
  }, [allCountries, session?.region, territoryGeojson]);

  const mapWrongCountryIds = useMemo(() => {
    if (roundWrongCountryIds.length === 0) return wrongCountryIds;
    return [...new Set([...wrongCountryIds, ...roundWrongCountryIds])];
  }, [wrongCountryIds, roundWrongCountryIds]);

  const mapView = useMemo(() => {
    if (!session) return null;
    return getMapViewForRegion(activeCountries, session.region);
  }, [activeCountries, session]);

  const regionLabel =
    REGIONS.find((region) => region.id === session?.region)?.label ?? "";
  const modeLabel = getModeLabel(session?.mode);
  const isFlagsMode = session?.mode === GAME_MODES.FLAGS;
  const levelLabel = session?.level ? getLevelLabel(session.level) : "";
  const isDiscoverGame = session?.gameType === GAME_TYPES.DISCOVER;
  const isTestGame = session?.gameType === GAME_TYPES.TEST;
  const isLearningGame = session?.gameType === GAME_TYPES.LEARNING;
  const isGoGame = Boolean(session?.go);
  // Discover on phone uses DiscoverCountrySheet instead of the Learn More panel.
  const showLearnMorePanel =
    (isDiscoverGame && !isMobile) ||
    isLearningGame ||
    Boolean(session?.review);
  const isFindGame = Boolean(
    session?.level && isFindLevel(session.level) && !isDiscoverGame
  );
  const isNameGame = session?.level ? isNameLevel(session.level) : false;
  // The mixed-question engine runs for wizard Learn sessions only (Go stays
  // find-only, so it keeps the classic loop). `learnQuestions` is only populated
  // by the engine start path, so this is false for every other game type.
  const learnEngineActive =
    isLearningGame && !isGoGame && Array.isArray(learnQuestions);
  const currentLearnQuestion = learnEngineActive
    ? (learnQuestions[learnIndex] ?? null)
    : null;
  const isLearnMapClickQuestion = currentLearnQuestion?.answerType === "map_click";
  // Questions that reference the map ("find"/"which is highlighted") use the top
  // layout so the map stays visible; everything else is a centered card. Wrong
  // neighbor answers also force the map layout so borders can be taught on-map.
  // Neighbor map teach step paints borders without a question modal.
  // Highlight wrongs do the same: map feedback + labels stay visible, only Continue.
  const learnNeighborRevealActive = learnNeighborMapVisible;
  const learnAreaCompareRevealActive = Boolean(learnAreaCompareReveal);
  const learnLandlockedRevealActive = Boolean(learnLandlockedReveal);
  const learnLandlockedTopMessage = (() => {
    if (!learnLandlockedReveal?.countryId) return null;
    const country = allCountriesById.get(learnLandlockedReveal.countryId);
    if (!country?.name) return null;
    return learnLandlockedReveal.isLandlocked
      ? `${country.name} is landlocked!`
      : `${country.name} is not landlocked!`;
  })();
  // Area-compare / highlight-map continue: keep the question one-liner at the
  // top (no country cards) so the prompt still frames the map teach step.
  const learnAreaCompareTopPrompt =
    learnAreaCompareRevealActive && currentLearnQuestion?.type === "area_compare"
      ? (currentLearnQuestion.prompt?.trim() || null)
      : null;
  // MC highlight wrongs drop the card for a map teach step. Free-recall text
  // entry keeps the card so the typed answer can turn green/red in place.
  const learnHighlightMapContinue =
    learnAwaitingContinue &&
    currentLearnQuestion?.mapConfig?.display === "highlight" &&
    !currentLearnQuestion?.mapConfig?.keepOverlay &&
    currentLearnQuestion?.answerType !== "text_entry";
  const learnHighlightTopPrompt = learnHighlightMapContinue
    ? (currentLearnQuestion?.prompt?.trim() || null)
    : null;
  const learnMapContinueTopPrompt =
    learnAreaCompareTopPrompt || learnHighlightTopPrompt;
  const learnMapOnlyContinue =
    learnNeighborMapVisible ||
    learnHighlightMapContinue ||
    learnAreaCompareRevealActive ||
    learnLandlockedRevealActive;
  const learnUsesMap =
    Boolean(currentLearnQuestion?.mapConfig) ||
    learnNeighborRevealActive ||
    learnAreaCompareRevealActive ||
    learnLandlockedRevealActive;
  // Neighbor / landlocked cards: keep the landmass, hide country borders so
  // the answer isn't readable off the map. Restore borders on the teach step.
  const hideCountryOutlines =
    learnEngineActive &&
    isMapBorderSpoilingQuestion(currentLearnQuestion) &&
    !learnMapOnlyContinue;
  // Highlight prompts paint their subject yellow on the region backdrop. The
  // question card is top-pinned (see LearnRoundOverlay) so the full region stays
  // in view — we intentionally do NOT zoom to the subject or use asymmetric
  // fitBounds padding (that cropped Europe down to the Mediterranean).
  const learnHighlightRevealsAnchor =
    learnEngineActive &&
    currentLearnQuestion?.mapConfig?.display === "highlight" &&
    !learnMapOnlyContinue;
  // Highlight-wrong reveal: keep the subject yellow (prompt) and paint only the
  // guess red via wrongCountryIds — two reds made correct vs guess ambiguous.
  const learnHighlightTone = learnAreaCompareRevealActive
    ? "correct"
    : learnNeighborRevealActive
      ? "success"
      : learnHighlightWrongReveal ||
          learnLandlockedRevealActive ||
          learnHighlightRevealsAnchor ||
          learnHighlightMapContinue
        ? "prompt"
        : "error";

  // Derive Learn highlights from the question / teach step — never rely on a
  // board-state race between startRoundBoard, clearLearnContinueState, and a
  // follow-up useEffect (that race left language prompts with no yellow fill).
  const mapHighlightCountryId = (() => {
    if (isDiscoverGame) return null;
    if (!learnEngineActive) return highlightCountryId;
    if (learnAreaCompareReveal?.largerId) return learnAreaCompareReveal.largerId;
    if (learnLandlockedReveal?.countryId) return learnLandlockedReveal.countryId;
    if (learnNeighborRevealActive && currentLearnQuestion?.countryId) {
      return currentLearnQuestion.countryId;
    }
    if (currentLearnQuestion?.mapConfig?.display === "highlight") {
      const fromConfig = currentLearnQuestion.mapConfig.highlightIds?.[0];
      return fromConfig ?? currentLearnQuestion.countryId ?? null;
    }
    return highlightCountryId;
  })();

  const mapViewForRender = useMemo(() => {
    // Bust referential equality when the Learn question / camera mode changes so
    // Mapbox always re-applies the camera (same region bounds after a neighbor
    // close-up would otherwise no-op if we only keyed by question id).
    const learnCameraMode = learnAreaCompareRevealActive
      ? "area"
      : learnNeighborRevealActive
        ? "neighbors"
        : "region";
    const learnQuestionKey = learnEngineActive
      ? `${currentLearnQuestion?.id ?? learnIndex}:${learnCameraMode}`
      : null;
    const withLearnKey = (view) =>
      view && learnQuestionKey != null
        ? { ...view, _learnQuestionId: learnQuestionKey }
        : view;

    // Frame subject (+ land neighbors) at ~3× combined land area — for teach
    // steps that paint the whole border cluster on the map.
    const focusPadding =
      learnMapOnlyContinue && !learnMapContinueTopPrompt ? 88 : 140;
    const focusCluster = (countryId) => {
      const subject = allCountriesById.get(countryId);
      if (!subject) return null;
      return getLearnFocusMapView(getCountryWithNeighbors(subject, allCountriesById), {
        regionId: session?.region,
        padding: focusPadding,
      });
    };

    if (learnAreaCompareRevealActive && learnAreaCompareReveal) {
      const pair = [learnAreaCompareReveal.largerId, learnAreaCompareReveal.smallerId]
        .map((id) => allCountriesById.get(id))
        .filter(Boolean);
      if (pair.length > 0) {
        const pairView = getLearnFocusMapView(pair, {
          regionId: session?.region,
          padding: focusPadding,
        });
        if (pairView) return withLearnKey(pairView);
      }
    }
    // Neighbor teach: subject + every land neighbor (what's painted on the map).
    if (learnNeighborRevealActive && currentLearnQuestion?.countryId) {
      const view = focusCluster(currentLearnQuestion.countryId);
      if (view) return withLearnKey(view);
    }
    // Highlight / language / choice questions: full session region only — zoom
    // all the way out from any prior teach close-up (e.g. Balkans → all Europe).
    if (learnEngineActive) {
      return withLearnKey(mapView);
    }
    return mapView;
  }, [
    mapView,
    learnEngineActive,
    learnIndex,
    currentLearnQuestion,
    learnMapOnlyContinue,
    learnNeighborRevealActive,
    learnAreaCompareRevealActive,
    learnAreaCompareReveal,
    learnMapContinueTopPrompt,
    allCountriesById,
    session?.region,
  ]);

  // Mirror the latest engine values into refs for synchronous reads in handlers.
  learnQuestionsRef.current = learnQuestions;
  learnIndexRef.current = learnIndex;
  currentLearnQuestionRef.current = currentLearnQuestion;
  const tourId = useMemo(() => getGameTourId(session), [session]);
  const pronunciationAllowed =
    !tutorialOpen && !modeIntroOpen && !onboardingGateOpen && tourCompleted;
  const modeIntro = useMemo(
    () =>
      getGameModeIntro({
        isMobile,
        isDiscover: isDiscoverGame,
        isNameGame,
        isLearning: isLearningGame,
        mode: session?.mode,
      }),
    [isMobile, isDiscoverGame, isNameGame, isLearningGame, session?.mode]
  );
  const tutorialSteps = useMemo(
    () =>
      getGameTutorialSteps(tourId, {
        isMobile,
        isOceania: isOceaniaRegion,
        isDiscover: isDiscoverGame,
        isNameGame,
        isFindGame,
        isLearning: isLearningGame,
        signedIn: Boolean(signedIn),
        mode: session?.mode,
        modeLabel,
      }),
    [
      tourId,
      isMobile,
      isOceaniaRegion,
      isDiscoverGame,
      isNameGame,
      isFindGame,
      isLearningGame,
      signedIn,
      session?.mode,
      modeLabel,
    ]
  );
  const tutorialTargetRefs = useMemo(
    () => ({
      map: mapContainerRef,
      prompt: gamePromptAnchorRef,
      mobilePrompt: mobilePromptRef,
      controls: gameControlsRef,
      score: gameHeaderStatsRef,
      pacificControls: pacificControlsRef,
    }),
    []
  );

  const persistTourCompleted = useCallback(() => {
    markGameTourCompletedLocally();
    setTourCompleted(true);
    if (!signedInRef.current) return;
    fetch("/api/users/game-tour", { method: "POST" }).catch(() => {});
  }, []);

  const openGameTutorial = useCallback(
    ({ manual = false } = {}) => {
      setModeIntroOpen(false);
      setTutorialManualOpen(manual);
      setTutorialOpen(true);
      setGamePaused(true);
      pauseGameTimer();
    },
    [pauseGameTimer]
  );

  const closeGameTutorial = useCallback(
    ({ completed = false, skipped = false } = {}) => {
      setTutorialOpen(false);
      setTutorialStepId(null);
      const wasManual = tutorialManualOpen;
      setTutorialManualOpen(false);
      setOnboardingGateOpen(false);
      setGamePaused(false);
      resumeGameTimer();
      if (completed || (!wasManual && skipped)) {
        persistTourCompleted();
      }
    },
    [persistTourCompleted, resumeGameTimer, tutorialManualOpen]
  );

  const openModeIntro = useCallback(() => {
    setModeIntroOpen(true);
    setGamePaused(true);
    pauseGameTimer();
  }, [pauseGameTimer]);

  const closeModeIntro = useCallback(() => {
    setModeIntroOpen(false);
    setOnboardingGateOpen(false);
    setGamePaused(false);
    resumeGameTimer();
  }, [resumeGameTimer]);

  // Resolve once-per-user tour status: localStorage + signed-in account.
  useEffect(() => {
    if (authStatus === "loading") return;

    const localDone = hasCompletedGameTourLocally();

    if (!signedIn) {
      setTourCompleted(localDone);
      setTourStatusReady(true);
      return undefined;
    }

    if (localDone) {
      setTourCompleted(true);
      setTourStatusReady(true);
      // Sync guest completion up to the account if needed.
      fetch("/api/users/game-tour", { method: "POST" }).catch(() => {});
      return undefined;
    }

    let cancelled = false;
    setTourStatusReady(false);
    fetch("/api/users/game-tour")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.completed) {
          markGameTourCompletedLocally();
          setTourCompleted(true);
        } else {
          setTourCompleted(false);
        }
        setTourStatusReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setTourCompleted(false);
          setTourStatusReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authStatus, signedIn]);

  useEffect(() => {
    if (!session) {
      pendingOnboardingPromptRef.current = false;
      setOnboardingGateOpen(false);
    }
  }, [session]);

  // First game ever → full tour. Later games → short mode intro every start.
  useEffect(() => {
    if (!pendingOnboardingPromptRef.current) return;
    if (!session || !gameActive || gameComplete) return;
    if (tutorialOpen || modeIntroOpen) return;
    if (!tourStatusReady) return;

    if (!tourId) {
      pendingOnboardingPromptRef.current = false;
      setOnboardingGateOpen(false);
      return;
    }

    pendingOnboardingPromptRef.current = false;

    if (!tourCompleted) {
      openGameTutorial({ manual: false });
    } else {
      openModeIntro();
    }
  }, [
    session,
    gameActive,
    gameComplete,
    tourId,
    tourStatusReady,
    tourCompleted,
    tutorialOpen,
    modeIntroOpen,
    openGameTutorial,
    openModeIntro,
  ]);

  const findRoundPronouncedTargetRef = useRef(null);

  useEffect(() => {
    if (!gameActive || gameComplete || isDiscoverGame || !targetCountry?.id) {
      return;
    }
    // The Learn engine drives its own prompts; auto-pronouncing the target would
    // read out the answer for "name it" questions.
    if (isLearningGame && !isGoGame) return;
    if (!pronunciationAllowed) {
      return;
    }
    if (!session?.level || !isFindLevel(session.level)) return;

    const isCountriesMode = session?.mode === GAME_MODES.COUNTRIES;
    const isCapitalsMode = session?.mode === GAME_MODES.CAPITALS;
    if (!isCountriesMode && !isCapitalsMode) return;
    if (isCapitalsMode && !targetCountry.capital?.trim()) return;
    if (findRoundPronouncedTargetRef.current === targetCountry.id) return;

    findRoundPronouncedTargetRef.current = targetCountry.id;
    if (isCapitalsMode) {
      playCapitalPronunciation(targetCountry.id);
    } else {
      playCountryPronunciation(targetCountry.id);
    }
  }, [
    gameActive,
    gameComplete,
    isDiscoverGame,
    isGoGame,
    isLearningGame,
    session?.level,
    session?.mode,
    targetCountry,
    tourId,
    tutorialOpen,
    pronunciationAllowed,
  ]);

  useEffect(() => {
    if (!session || gameComplete) {
      findRoundPronouncedTargetRef.current = null;
    }
  }, [session, gameComplete]);

  useEffect(() => {
    if (!gameActive || gameComplete || !targetCountry || !showLearnMorePanel) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (learnMorePanelOpen) {
          setLearnMorePanelOpen(false);
        }
        return;
      }

      const isLearnMoreShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "i" || event.key === "I");

      if (isLearnMoreShortcut) {
        event.preventDefault();
        toggleLearnMorePanel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    gameActive,
    gameComplete,
    showLearnMorePanel,
    learnMorePanelOpen,
    targetCountry,
    toggleLearnMorePanel,
  ]);

  const preCreditedCount = session?.preCreditedCount ?? 0;
  const displayedCorrect = rightCount + preCreditedCount;
  const totalRounds = session?.totalRounds ?? activeCountries.length;
  const roundsCompleted = rightCount + wrongCount;
  const queuePosition = gameComplete
    ? totalRounds
    : Math.min(
        roundsCompleted + (gameActive && targetCountry ? 1 : 0),
        totalRounds
      );
  const queueProgress = totalRounds > 0 ? queuePosition / totalRounds : 0;

  const isFindFlagsGame =
    isFlagsMode && session?.level != null && isFindLevel(session.level);
  const isFlashLevel = session?.level ? usesColorFlash(session.level) : false;

  const highlightTargetCountryId =
    session?.level === GAME_LEVELS.NAME_FILL &&
    !isFlagsMode &&
    !learnEngineActive &&
    targetCountry &&
    !revealMode &&
    !gameComplete
      ? targetCountry.id
      : null;

  const buildMilestoneStats = useCallback(() => {
    setMilestoneStats({
      statRecords: Object.fromEntries(sessionStatRecordsRef.current),
      preCreditedIds: [...preCreditedIdsRef.current],
      regionCountryIds: [...regionCountryIdsRef.current],
    });
  }, []);

  const finishGame = useCallback(() => {
    stopGameTimer();
    setGameActive(false);
    setGameComplete(true);
    finishGameBoard();

    const activeSession = sessionRef.current;
    if (
      !signedInRef.current &&
      activeSession?.gameType === GAME_TYPES.TEST &&
      !activeSession.review
    ) {
      setPendingGuestScore({
        mode: activeSession.mode,
        region: activeSession.region,
        level: activeSession.level,
        score:
          rightCountRef.current + (activeSession.preCreditedCount ?? 0),
      });
    }

    // Wait for the in-flight round-stat saves to resolve so the snapshot
    // reflects the final round's mastery/graduation before we detect milestones.
    const pending = [...pendingStatPromisesRef.current];
    if (pending.length === 0) {
      buildMilestoneStats();
      return;
    }
    Promise.allSettled(pending).then(() => {
      pendingStatPromisesRef.current = [];
      buildMilestoneStats();
    });
  }, [buildMilestoneStats, finishGameBoard, stopGameTimer]);

  const finishRound = useCallback(() => {
    const total = countryQueueRef.current.length;
    const completed = rightCountRef.current + wrongCountRef.current;
    if (completed >= total) {
      finishGame();
      return true;
    }
    return false;
  }, [countryQueueRef, finishGame, rightCountRef, wrongCountRef]);

  const recordRoundOutcome = useCallback(
    (outcome) => {
      const target = targetCountryRef.current;
      const activeSession = sessionRef.current;
      if (!target || !activeSession) return;

      const responseTimeMs =
        outcome === ROUND_OUTCOMES.NEEDED_REVEAL || roundStartTimeRef.current == null
          ? undefined
          : Date.now() - roundStartTimeRef.current;

      const gameType = activeSession.review
        ? GAME_TYPE_FOR_STATS.REVIEW
        : (activeSession.gameType ?? GAME_TYPES.TEST);

      if (!signedInRef.current) {
        appendGuestRound({
          countryId: target.id,
          mode: activeSession.mode,
          level: activeSession.level,
          outcome,
          responseTimeMs,
          gameType,
        });
        return;
      }

      const promise = recordCountryStat({
        countryId: target.id,
        mode: activeSession.mode,
        level: activeSession.level,
        outcome,
        responseTimeMs,
        gameType,
      })
        .then((res) => {
          const stat = res?.stat;
          if (!stat?.countryId) return;
          const prior = sessionStatRecordsRef.current.get(stat.countryId);
          sessionStatRecordsRef.current.set(stat.countryId, {
            beforeMastery: prior?.beforeMastery ?? stat.previousMasteryScore ?? 0,
            beforeGraduated: prior?.beforeGraduated ?? stat.previousGraduated ?? false,
            afterMastery: stat.masteryScore ?? 0,
            afterGraduated: stat.graduated ?? false,
          });
        })
        .catch((error) => {
          console.error("Failed to record country stat:", error);
        });

      pendingStatPromisesRef.current.push(promise);
    },
    [targetCountryRef]
  );

  useEffect(() => {
    if (!signedIn) {
      setGuestSyncState(null);
      return undefined;
    }

    const pending = getPendingGuestGame();
    if (!pending?.rounds?.length && !pending?.score) {
      return undefined;
    }

    let cancelled = false;
    setGuestSyncState({ loading: true, result: null, error: null, synced: false });

    syncPendingGuestGame({
      onRoundRecorded: (stat) => {
        if (!stat?.countryId) return;
        const prior = sessionStatRecordsRef.current.get(stat.countryId);
        sessionStatRecordsRef.current.set(stat.countryId, {
          beforeMastery: prior?.beforeMastery ?? stat.previousMasteryScore ?? 0,
          beforeGraduated: prior?.beforeGraduated ?? stat.previousGraduated ?? false,
          afterMastery: stat.masteryScore ?? 0,
          afterGraduated: stat.graduated ?? false,
        });
      },
    })
      .then(({ synced, saveResult }) => {
        if (cancelled) return;
        if (synced) {
          buildMilestoneStats();
          setGuestSyncState({
            loading: false,
            result: saveResult,
            error: null,
            synced: true,
          });
        } else {
          setGuestSyncState(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setGuestSyncState({
            loading: false,
            result: null,
            error: error.message || "Could not save your game progress.",
            synced: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn, buildMilestoneStats]);

  const clearColorFlash = useCallback(() => {
    if (colorFlashTimeoutRef.current) {
      clearTimeout(colorFlashTimeoutRef.current);
      colorFlashTimeoutRef.current = null;
    }
  }, []);

  const clearWrongFlash = useCallback(() => {
    if (wrongFlashTimeoutRef.current) {
      clearTimeout(wrongFlashTimeoutRef.current);
      wrongFlashTimeoutRef.current = null;
    }
  }, []);

  const triggerWrongFlash = useCallback(
    (countryId) => {
      clearWrongFlash();
      setFlashWrongCountryIds([countryId]);

      wrongFlashTimeoutRef.current = setTimeout(() => {
        clearFlashWrongIfOnly(countryId);
        wrongFlashTimeoutRef.current = null;
      }, WRONG_CLICK_FLASH_MS);
    },
    [clearFlashWrongIfOnly, clearWrongFlash, setFlashWrongCountryIds]
  );

  const triggerColorFlash = useCallback(
    (countryId, onComplete) => {
      clearColorFlash();
      clearWrongFlash();
      setShowColorCountryIds([countryId]);

      colorFlashTimeoutRef.current = setTimeout(() => {
        clearShowColorIfOnly(countryId);
        colorFlashTimeoutRef.current = null;
        onComplete?.();
      }, COUNTRY_FLASH_MS);
    },
    [clearColorFlash, clearShowColorIfOnly, clearWrongFlash, setShowColorCountryIds]
  );

  const updateShowColorForRound = useCallback(
    (target, level, mode) => {
      if (level === GAME_LEVELS.NAME_FLASH && target && mode !== GAME_MODES.FLAGS) {
        setShowColorCountryIds([target.id]);
        return;
      }
      setShowColorCountryIds([]);
    },
    [setShowColorCountryIds]
  );

  const startRound = useCallback(() => {
    clearColorFlash();
    clearWrongFlash();
    wrongAttemptsRef.current = 0;
    beginRoundScoring();
    revealStatRecordedRef.current = false;
    roundStartTimeRef.current = Date.now();
    startRoundBoard(!isProgressiveFillLevel(session?.level ?? 0));
    setAnswerText("");
    setSpellingSuggestionText(null);
    setFlagsClickHeader(null);

    const next = advanceQueue();

    if (session?.level) {
      updateShowColorForRound(next, session.level, session.mode);
    } else {
      setShowColorCountryIds([]);
    }

    if (isNameLevel(session?.level ?? 0)) {
      requestAnimationFrame(() => answerInputRef.current?.focus());
    }
  }, [
    advanceQueue,
    beginRoundScoring,
    clearColorFlash,
    clearWrongFlash,
    session?.level,
    session?.mode,
    setShowColorCountryIds,
    startRoundBoard,
    updateShowColorForRound,
  ]);

  const scheduleNextRound = useCallback(
    (delay = CORRECT_ROUND_DELAY_MS) => {
      if (nextRoundTimeoutRef.current) {
        clearTimeout(nextRoundTimeoutRef.current);
      }
      if (delay <= 0) {
        if (gameActiveRef.current) startRound();
        return;
      }
      nextRoundTimeoutRef.current = setTimeout(() => {
        if (gameActiveRef.current) startRound();
      }, delay);
    },
    [startRound]
  );

  const startGame = useCallback(
    ({
      gameType = GAME_TYPES.TEST,
      mode,
      region,
      level,
      countries,
      review = false,
      reviewCountryIds = null,
      learningCountryIds = null,
      learningSessionSize = null,
      preCreditedCountryIds = null,
      go = false,
      showMasteryLoadWarning = false,
    }) => {
      const pool = countries ?? filterCountriesByRegion(allCountries, region);
      const preCredited = preCreditedCountryIds ?? [];
      const totalRounds = pool.length + preCredited.length;
      if (totalRounds === 0) return;

      clearPendingGuestGame();
      setMasteryLoadWarning(showMasteryLoadWarning);

      if (nextRoundTimeoutRef.current) {
        clearTimeout(nextRoundTimeoutRef.current);
      }
      clearColorFlash();
      clearWrongFlash();
      resetIdleState();

      sessionStatRecordsRef.current = new Map();
      pendingStatPromisesRef.current = [];
      preCreditedIdsRef.current = preCredited;
      setMilestoneStats(undefined);

      startGameTimer();

      loadQueue(shuffleCountries(pool));
      resetScoring();
      beginRoundScoring();

      const countryIds =
        reviewCountryIds ?? learningCountryIds ?? pool.map((country) => country.id);

      setSession({
        gameType,
        mode,
        region,
        level,
        review,
        go,
        learningSessionSize,
        totalRounds,
        preCreditedCount: preCredited.length,
        reviewCountryIds: review ? countryIds : null,
        learningCountryIds: gameType === GAME_TYPES.LEARNING ? countryIds : null,
      });
      setGameComplete(false);
      setGamePaused(false);
      setShowResumeConfirm(false);
      // Pre-credited (already mastered) countries show as filled from the start.
      startGameBoard(preCredited);

      // Everything was already mastered — nothing left to quiz.
      if (pool.length === 0) {
        setGameActive(false);
        setGameComplete(true);
        setTarget(null);
        regionCountryIdsRef.current = preCredited;
        buildMilestoneStats();
        return;
      }

      setGameActive(true);
      pendingOnboardingPromptRef.current = true;
      setOnboardingGateOpen(true);

      const first = advanceQueue();
      wrongAttemptsRef.current = 0;
      revealStatRecordedRef.current = false;
      roundStartTimeRef.current = Date.now();
      setAnswerText("");
      setSpellingSuggestionText(null);
      setLearnMorePanelOpen(
        (gameType === GAME_TYPES.LEARNING || review) && getReferencePanelDefaultOpen()
      );
      updateShowColorForRound(first, level, mode);

      if (isNameLevel(level)) {
        requestAnimationFrame(() => answerInputRef.current?.focus());
      }

      router.push(buildPlayingUrl());
      gameInHistoryRef.current = true;
    },
    [
      advanceQueue,
      allCountries,
      beginRoundScoring,
      buildMilestoneStats,
      clearColorFlash,
      clearWrongFlash,
      loadQueue,
      resetIdleState,
      resetScoring,
      router,
      setTarget,
      startGameBoard,
      startGameTimer,
      updateShowColorForRound,
    ]
  );

  const startDiscoverGame = useCallback(
    ({ mode, region }) => {
      const pool = filterCountriesByRegion(allCountries, region);
      if (pool.length === 0) return;

      clearPendingGuestGame();

      if (nextRoundTimeoutRef.current) {
        clearTimeout(nextRoundTimeoutRef.current);
      }
      clearColorFlash();
      clearWrongFlash();
      resetIdleState();

      sessionStatRecordsRef.current = new Map();
      pendingStatPromisesRef.current = [];
      preCreditedIdsRef.current = [];
      setMilestoneStats(undefined);

      resetGameTimer();
      loadQueue([]);
      resetScoring();
      resetBoard();

      setSession({
        gameType: GAME_TYPES.DISCOVER,
        mode,
        region,
        level: null,
        totalRounds: pool.length,
      });
      setGameComplete(false);
      setGamePaused(false);
      setShowResumeConfirm(false);
      setGameActive(true);
      pendingOnboardingPromptRef.current = true;
      setOnboardingGateOpen(true);
      setTarget(null);
      setHighlightCountryId(null);
      setFlashSmallCountryId(null);
      setFlagsClickHeader(null);
      setLearnMorePanelOpen(true);
      setDiscoverCountrySheetOpen(false);
      setDiscoverTerritoryNote(null);
      setFeedback({ text: "", type: "" });
      discoverCompleteShownRef.current = false;
      setDiscoverCompleteModalOpen(false);
      setDiscoverLabelsById({});
      setDiscoverAnimatingLabel(null);

      router.push(buildPlayingUrl());
      gameInHistoryRef.current = true;
    },
    [
      allCountries,
      clearColorFlash,
      clearWrongFlash,
      loadQueue,
      resetBoard,
      resetGameTimer,
      resetIdleState,
      resetScoring,
      router,
      setFeedback,
      setFlashSmallCountryId,
      setHighlightCountryId,
      setTarget,
    ]
  );

  // "Go": a quick 10-country review of your weakest countries in the
  // chosen region (Countries · Find it · Level 1). Falls back to random
  // countries when there is no weak data or the player is signed out.
  const startGoSession = useCallback(async (region = "world") => {
    const regionPool = filterCountriesByRegion(allCountries, region);
    if (regionPool.length === 0) return;

    let chosen = [];
    if (signedIn) {
      try {
        const data = await fetchWeakCountryStats({
          mode: GAME_MODES.COUNTRIES,
          level: GAME_LEVELS.FIND_FILL,
          region,
        });
        if ((data.weakCount ?? 0) > 0) {
          const ids = buildLearningQueue(data.stats, Math.min(GO_SESSION_SIZE, data.weakCount));
          chosen = ids
            .map((id) => regionPool.find((country) => country.id === id))
            .filter(Boolean);
        }
      } catch (error) {
        console.error("Go: failed to load weak countries", error);
      }
    }

    if (chosen.length < GO_SESSION_SIZE) {
      const have = new Set(chosen.map((country) => country.id));
      const fillers = shuffleCountries(
        regionPool.filter((country) => !have.has(country.id))
      ).slice(0, GO_SESSION_SIZE - chosen.length);
      chosen = [...chosen, ...fillers];
    }

    chosen = chosen.slice(0, GO_SESSION_SIZE);
    if (chosen.length === 0) return;

    startGame({
      gameType: GAME_TYPES.LEARNING,
      mode: GAME_MODES.COUNTRIES,
      region,
      level: GAME_LEVELS.FIND_FILL,
      countries: chosen,
      learningCountryIds: chosen.map((country) => country.id),
      learningSessionSize: GO_SESSION_SIZE,
      go: true,
    });
  }, [allCountries, signedIn, startGame]);

  // World Test: pre-credit countries already mastered (graduated, with the level
  // cascade) in any region so they aren't re-quizzed.
  const buildWorldTestCountries = useCallback(
    async ({ mode, level }) => {
      const worldPool = filterCountriesByRegion(allCountries, "world");
      try {
        const data = await fetchMasteryStats({ mode });
        const masteredIds = getMasteredCountryIds(data.mastery ?? [], level);
        return {
          countries: worldPool.filter((country) => !masteredIds.has(country.id)),
          preCreditedCountryIds: worldPool
            .filter((country) => masteredIds.has(country.id))
            .map((country) => country.id),
          masteryLoadFailed: false,
        };
      } catch (error) {
        console.error("Failed to load mastery for World Test:", error);
        return { countries: worldPool, preCreditedCountryIds: [], masteryLoadFailed: true };
      }
    },
    [allCountries]
  );

  // ── Learn mixed-question engine: build, start, answer, advance, finish ────────

  // Fetch mastery (soft) + challenge level, then build a mixed-question session
  // over EVERY country in the region — no weak-only "learning list" and no
  // session-size cap. Challenge (mode×region) drives question tiers; mastery
  // only weights country order and soft-bumps predictedSuccess.
  const buildLearnEngineData = useCallback(
    async ({ mode, level, region }) => {
      const regionPool = filterCountriesByRegion(allCountries, region);
      if (regionPool.length === 0) return null;

      const masteryById = new Map();
      try {
        const data = await fetchMasteryStats({ mode });
        const provingLevels = new Set(getMasteryProvingLevels(level));
        for (const row of data.mastery ?? []) {
          if (row.level !== level && !provingLevels.has(row.level)) continue;
          const prev = masteryById.get(row.countryId) ?? 0;
          masteryById.set(
            row.countryId,
            Math.max(prev, Number(row.masteryScore) || 0)
          );
        }
      } catch (error) {
        console.error("Learn: failed to load mastery for weighting", error);
      }

      let challenge = createDefaultChallenge();
      try {
        const data = await fetchLearnChallenge({ mode, region });
        challenge = normalizeChallenge(data.challenge);
      } catch (error) {
        console.error("Learn: failed to load challenge level", error);
      }

      const queueIds = buildFullRegionLearningQueue(
        regionPool.map((country) => country.id),
        masteryById
      );
      const regionById = new Map(regionPool.map((country) => [country.id, country]));
      const countries = queueIds.map((id) => regionById.get(id)).filter(Boolean);
      if (countries.length === 0) return null;

      const sampled = countries.map((country) => ({
        countryId: country.id,
        mastery: masteryById.get(country.id) ?? 0,
      }));

      const statsById = new Map(
        sampled.map((entry) => [
          entry.countryId,
          { countryId: entry.countryId, masteryScore: entry.mastery },
        ])
      );

      const { questions, sessionMeta } = buildLearnSession({
        countries: sampled,
        category: mode,
        allCountries,
        masteryStats: statsById,
        sessionSize: "all",
        challenge,
      });
      if (!Array.isArray(questions) || questions.length === 0) return null;

      return {
        countries,
        queueIds,
        questions,
        sessionMeta,
        sampled,
        masteryStats: statsById,
        challenge,
        masteryBefore: new Map(sampled.map((entry) => [entry.countryId, entry.mastery])),
      };
    },
    [allCountries]
  );

  const finishLearnGame = useCallback(() => {
    stopGameTimer();
    setGameActive(false);
    setGameComplete(true);
    finishGameBoard();
    if (learnAdvanceTimerRef.current) {
      clearTimeout(learnAdvanceTimerRef.current);
      learnAdvanceTimerRef.current = null;
    }

    const build = () => {
      setLearnSummary(
        buildLearnSessionSummary({
          answers: learnAnswersRef.current,
          masteryBefore: learnMasteryBeforeRef.current,
          masteryAfter: learnMasteryAfterRef.current,
          resolveCountry: resolveLearnCountry,
          category: sessionRef.current?.mode,
          seenByCountry: learnSeenFactsRef.current,
        })
      );
      buildMilestoneStats();
    };

    const pending = [...pendingStatPromisesRef.current];
    if (pending.length === 0) {
      build();
      return;
    }
    Promise.allSettled(pending).then(() => {
      pendingStatPromisesRef.current = [];
      build();
    });
  }, [buildMilestoneStats, finishGameBoard, resolveLearnCountry, sessionRef, stopGameTimer]);

  // Advances to the next question after a brief pause so the answer feedback is
  // seen. (Between-question facts intentionally removed — facts stay in the Learn
  // More panel and the end-of-session recap.) Wrong answers use Continue instead
  // of this timer (see handleLearnAnswer / handleLearnContinue).
  const clearLearnContinueState = useCallback(() => {
    learnAwaitingContinueRef.current = false;
    setLearnAwaitingContinue(false);
    setLearnContinueMessage(null);
    setLearnNeighborMapVisible(false);
    setLearnAreaCompareReveal(null);
    setLearnLandlockedReveal(null);
    setLearnHighlightWrongReveal(null);
    setLearnAwaitingRetry(false);
    setLearnRetryMessage(null);
    learnMapMissedRef.current = false;
    setLearnFeedbackLabelsById({});
    // Do NOT clear highlightCountryId here — the per-question highlight sync
    // owns it. Clearing here raced with that sync and left language / "which
    // country is highlighted" prompts with no yellow fill.
    setFlashSmallCountryId(null);
    setShowColorCountryIds([]);
    setFilledCountryIds([]);
    setWrongCountryIds([]);
    clearRoundWrongCountries();
  }, [
    clearRoundWrongCountries,
    setFilledCountryIds,
    setFlashSmallCountryId,
    setShowColorCountryIds,
    setWrongCountryIds,
  ]);

  /** Paint the subject + all land neighbors on the map (post-answer teach step). */
  const showLearnNeighborMapReveal = useCallback(
    (
      neighborReveal,
      { selectedValue = null, feedbackType = "wrong", message = "", secondTry = false } = {}
    ) => {
      const { mainId, neighborIds } = neighborReveal;
      const visibleNeighborIds = neighborIds.filter((id) =>
        activeCountries.some((country) => country.id === id)
      );
      const neighborIdSet = new Set(neighborIds);
      const labels = {};
      const mainCountry = allCountriesById.get(mainId);
      if (
        mainCountry?.name &&
        activeCountries.some((country) => country.id === mainId)
      ) {
        labels[mainId] = {
          kind: "text",
          text: mainCountry.name,
          countryId: mainId,
          emphasized: true,
          alwaysShow: true,
        };
      }
      for (const id of visibleNeighborIds) {
        const neighbor = allCountriesById.get(id);
        if (neighbor?.name) {
          labels[id] = {
            kind: "text",
            text: neighbor.name,
            countryId: id,
            alwaysShow: true,
          };
        }
      }

      // Wrong path: red for distractors + bordering countries the learner missed
      // (multi-select / recall-all pass an array of picks).
      const foundNeighborIds = new Set();
      const missedNeighborIds = new Set();
      if (feedbackType === "wrong" && selectedValue != null) {
        const selections = Array.isArray(selectedValue)
          ? selectedValue
          : [selectedValue];

        clearWrongFlash();

        for (const value of selections) {
          if (typeof value === "string" && neighborIdSet.has(value)) {
            foundNeighborIds.add(value);
            continue;
          }
          const guessed = resolveGuessedCountryInRegion(value, {
            allCountriesById,
            activeCountries,
            excludeIds: [mainId],
          });
          if (!guessed) continue;
          if (neighborIdSet.has(guessed.id)) {
            foundNeighborIds.add(guessed.id);
            continue;
          }
          addRoundWrongCountry(guessed.id);
          labels[guessed.id] = {
            kind: "text",
            text: guessed.name,
            countryId: guessed.id,
            alwaysShow: true,
          };
        }

        if (Array.isArray(selectedValue)) {
          for (const id of visibleNeighborIds) {
            if (!foundNeighborIds.has(id)) {
              missedNeighborIds.add(id);
              addRoundWrongCountry(id);
            }
          }
        }
      }

      setHighlightCountryId(mainId);
      // Learn maps as FIND_FILL: `filled` is what actually paints assigned colors.
      // `showColor` covers flash levels / Pacific stroke; both clear on Continue.
      // Missed neighbors stay out of the green fill — they're painted red via wrong.
      const greenNeighborIds = visibleNeighborIds.filter(
        (id) => !missedNeighborIds.has(id)
      );
      setFilledCountryIds(greenNeighborIds);
      setShowColorCountryIds(greenNeighborIds);
      setLearnFeedbackLabelsById(labels);
      setLearnNeighborMapVisible(true);
      setLearnAreaCompareReveal(null);
      setLearnLandlockedReveal(null);
      setLearnHighlightWrongReveal(null);
      setFeedback(
        outcomeFeedback({
          correct: feedbackType === "correct",
          secondTry: feedbackType === "correct" && secondTry,
          detail: message || null,
        })
      );
    },
    [
      activeCountries,
      addRoundWrongCountry,
      allCountriesById,
      clearWrongFlash,
      setFeedback,
      setFilledCountryIds,
      setHighlightCountryId,
      setShowColorCountryIds,
    ]
  );

  const advanceLearnAfterAnswer = useCallback(
    (delayMs = 650) => {
      const idx = learnIndexRef.current;
      const questions = learnQuestionsRef.current ?? [];
      const isLast = idx >= questions.length - 1;

      learnAdvanceTimerRef.current = setTimeout(() => {
        learnLockRef.current = false;
        clearLearnContinueState();
        if (isLast) {
          finishLearnGame();
          return;
        }
        const nextIndex = idx + 1;
        learnIndexRef.current = nextIndex;
        setLearnIndex(nextIndex);
      }, delayMs);
    },
    [clearLearnContinueState, finishLearnGame]
  );

  const handleLearnContinue = useCallback(() => {
    if (!learnAwaitingContinueRef.current) return;
    if (learnAdvanceTimerRef.current) {
      clearTimeout(learnAdvanceTimerRef.current);
      learnAdvanceTimerRef.current = null;
    }

    // Clear teach paints and advance in the same turn so neighbor colors never
    // remain on the following question (and the answered card doesn't flash back).
    learnLockRef.current = false;
    const idx = learnIndexRef.current;
    const questions = learnQuestionsRef.current ?? [];
    const isLast = idx >= questions.length - 1;
    clearLearnContinueState();
    if (isLast) {
      finishLearnGame();
      return;
    }
    const nextIndex = idx + 1;
    learnIndexRef.current = nextIndex;
    setLearnIndex(nextIndex);
  }, [clearLearnContinueState, finishLearnGame]);

  const handleLearnTryAgain = useCallback(() => {
    setLearnAwaitingRetry(false);
    setLearnRetryMessage(null);
    clearWrongFlash();
    setFeedback({ text: "", type: "" });
    learnLockRef.current = false;
  }, [clearWrongFlash, setFeedback]);

  useEffect(() => {
    if (!learnAwaitingContinue && !learnAwaitingRetry) return undefined;

    const onKeyDown = (event) => {
      if (event.key !== "Enter") return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      if (learnAwaitingRetry) {
        handleLearnTryAgain();
        return;
      }
      handleLearnContinue();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    learnAwaitingContinue,
    learnAwaitingRetry,
    handleLearnContinue,
    handleLearnTryAgain,
  ]);

  // Immediate map/text feedback for "which country is highlighted" questions:
  // wrong guess → paint that country red and name the correct one.
  const handleLearnSelectFeedback = useCallback(
    (event) => {
      const question = currentLearnQuestionRef.current;
      if (!question || question.mapConfig?.display !== "highlight") return;

      // Highlight free-recall paints the typed answer green/red in the form —
      // skip the floating toast so the card stays compact.
      const inlineTextFeedback = question.answerType === "text_entry";

      if (event.correct) {
        if (!inlineTextFeedback) {
          setFeedback(outcomeFeedback({ correct: true }));
        }
        return;
      }

      const selected = event.selectedValue;
      let wrongId = null;
      if (typeof selected === "string" && selected) {
        if (allCountriesById.has(selected)) {
          wrongId = selected;
        } else {
          const normalized = normalizeName(selected);
          wrongId =
            allCountries.find((country) => normalizeName(country.name) === normalized)
              ?.id ?? null;
        }
      }

      if (wrongId && wrongId !== question.countryId) {
        clearWrongFlash();
        addRoundWrongCountry(wrongId);
      }

      if (!inlineTextFeedback) {
        setFeedback(outcomeFeedback({ correct: false }));
      }

      // Title both countries on the map so the miss is easy to compare.
      setLearnHighlightWrongReveal({
        correctId: question.countryId,
        guessedId:
          wrongId && wrongId !== question.countryId ? wrongId : null,
      });
      setLearnFeedbackLabelsById({});
    },
    [
      addRoundWrongCountry,
      allCountries,
      allCountriesById,
      clearWrongFlash,
      setFeedback,
    ]
  );

  // Unified answer handler for every Learn question type. Records the PRIMARY
  // country only (the comparison country's mastery is never touched).
  const handleLearnAnswer = useCallback(
    (event) => {
      if (learnLockRef.current) return;
      const activeSession = sessionRef.current;
      if (!activeSession) return;
      learnLockRef.current = true;

      beginRoundScoring();
      if (event.correct) {
        markRoundCorrect();
        playCorrectSound();
      } else {
        markRoundIncorrect(
          allCountriesById.get(event.countryId) ?? { id: event.countryId }
        );
        playIncorrectSound();
      }

      const { payload, meta } = buildLearnStatPayload(event, {
        mode: activeSession.mode,
        level: activeSession.level,
      });
      logLearnEmaUpdate(event, meta);
      learnAnswersRef.current.push({
        countryId: event.countryId,
        questionType: event.questionType,
      });

      // Adaptive challenge: update mode×region pacing, then rebuild not-yet-shown
      // questions so a hot T4 streak can harden mid-session.
      const prevChallenge = normalizeChallenge(learnChallengeRef.current);
      const outcomeRecord = challengeOutcomeFromAnswer({
        tier: event.tier,
        outcome: meta.outcome,
        correct: event.correct,
        revealUsed: event.revealUsed,
        fast: event.fast,
        predictedSuccess: event.predictedSuccess,
      });
      const nextChallenge = updateChallengeLevel(prevChallenge, outcomeRecord);
      learnChallengeRef.current = nextChallenge;

      if (nextChallenge.workingTier !== prevChallenge.workingTier) {
        const idx = learnIndexRef.current;
        const currentQuestions = learnQuestionsRef.current ?? [];
        const remainingEntries = currentQuestions.slice(idx + 1).map((q) => {
          const sampled = (learnSampledRef.current ?? []).find(
            (entry) => entry.countryId === q.countryId
          );
          return {
            countryId: q.countryId,
            mastery: sampled?.mastery ?? 0,
          };
        });
        if (remainingEntries.length > 0) {
          const rebuilt = rebuildQuestionsForCountries({
            countries: remainingEntries,
            category: learnCategoryRef.current ?? activeSession.mode,
            allCountries,
            masteryStats: learnMasteryStatsRef.current,
            challenge: nextChallenge,
          });
          const nextQuestions = [
            ...currentQuestions.slice(0, idx + 1),
            ...rebuilt,
          ];
          learnQuestionsRef.current = nextQuestions;
          setLearnQuestions(nextQuestions);
          setSession((prev) =>
            prev ? { ...prev, totalRounds: nextQuestions.length } : prev
          );
        }
      }

      if (signedInRef.current) {
        const challengePromise = saveLearnChallenge({
          mode: activeSession.mode,
          region: activeSession.region,
          outcome: meta.outcome,
          tier: event.tier,
          correct: event.correct,
          revealUsed: event.revealUsed,
          fast: event.fast,
          predictedSuccess: event.predictedSuccess,
        }).catch((error) => {
          console.error("Failed to save learn challenge:", error);
        });
        pendingStatPromisesRef.current.push(challengePromise);

        const promise = recordCountryStat(payload)
          .then((res) => {
            const stat = res?.stat;
            if (!stat?.countryId) return;
            learnMasteryAfterRef.current.set(stat.countryId, stat.masteryScore ?? 0);
            if (!learnMasteryBeforeRef.current.has(stat.countryId)) {
              learnMasteryBeforeRef.current.set(
                stat.countryId,
                stat.previousMasteryScore ?? 0
              );
            }
            const prior = sessionStatRecordsRef.current.get(stat.countryId);
            sessionStatRecordsRef.current.set(stat.countryId, {
              beforeMastery: prior?.beforeMastery ?? stat.previousMasteryScore ?? 0,
              beforeGraduated: prior?.beforeGraduated ?? stat.previousGraduated ?? false,
              afterMastery: stat.masteryScore ?? 0,
              afterGraduated: stat.graduated ?? false,
            });
          })
          .catch((error) => {
            console.error("Failed to record learn stat:", error);
          });
        pendingStatPromisesRef.current.push(promise);
      } else {
        appendGuestRound(payload);
      }

      const question = currentLearnQuestionRef.current;
      const secondTry = Boolean(event.priorMiss);
      if (event.correct) {
        // Neighbor questions: always show every land border on the map.
        if (isNeighborLearnQuestion(question)) {
          const reveal = buildLearnWrongReveal(question, allCountriesById);
          learnAwaitingContinueRef.current = true;
          setLearnAwaitingContinue(true);
          setLearnContinueMessage(null);
          if (reveal.neighborReveal) {
            showLearnNeighborMapReveal(reveal.neighborReveal, {
              selectedValue: event.selectedValue,
              feedbackType: "correct",
              message: reveal.message,
              secondTry,
            });
          } else {
            setFeedback(outcomeFeedback({ correct: true, secondTry }));
          }
          return;
        }
        // Teaching notes pause for Continue on correct answers too.
        if (question?.continueNote) {
          learnAwaitingContinueRef.current = true;
          setLearnAwaitingContinue(true);
          setLearnContinueMessage(null);
          setFeedback(outcomeFeedback({ correct: true, secondTry }));
          return;
        }
        // Highlight free-recall: typed answer turns green in-form; wait for the
        // Submit→arrow continue (no auto-advance toast under the card).
        if (
          question?.mapConfig?.display === "highlight" &&
          question?.answerType === "text_entry"
        ) {
          learnAwaitingContinueRef.current = true;
          setLearnAwaitingContinue(true);
          setLearnContinueMessage(null);
          setFeedback({ text: "", type: "" });
          return;
        }
        // Correct path keeps a brief pause so option/map feedback is seen.
        setFeedback(outcomeFeedback({ correct: true, secondTry }));
        advanceLearnAfterAnswer(650);
        return;
      }

      // Wrong answers pause for an explicit Continue — show the correct answer
      // (and paint bordering countries on the map when relevant).
      const reveal = buildLearnWrongReveal(question, allCountriesById);
      learnAwaitingContinueRef.current = true;
      setLearnAwaitingContinue(true);
      setLearnContinueMessage(reveal.message);

      if (reveal.neighborReveal) {
        showLearnNeighborMapReveal(reveal.neighborReveal, {
          selectedValue: event.selectedValue,
          feedbackType: "wrong",
          message: reveal.message,
        });
      } else if (reveal.areaCompareReveal) {
        const { largerId, smallerId } = reveal.areaCompareReveal;
        const formatAreaLabel = (country) => {
          if (!country?.name) return null;
          if (typeof country.area !== "number") return country.name;
          return `${country.name} · ${country.area.toLocaleString()} km²`;
        };
        const labels = {};
        const larger = allCountriesById.get(largerId);
        const smaller = allCountriesById.get(smallerId);
        const largerLabel = formatAreaLabel(larger);
        const smallerLabel = formatAreaLabel(smaller);
        // Prefer active-region geometry; fall back to full roster so a peer that
        // somehow sits outside the filtered pool still gets a map title.
        const labelCountry = (id) =>
          activeCountries.find((country) => country.id === id) ??
          allCountriesById.get(id) ??
          null;
        if (largerLabel && labelCountry(largerId)) {
          labels[largerId] = {
            kind: "text",
            text: largerLabel,
            countryId: largerId,
            emphasized: true,
            alwaysShow: true,
          };
        }
        if (smallerLabel && labelCountry(smallerId)) {
          labels[smallerId] = {
            kind: "text",
            text: smallerLabel,
            countryId: smallerId,
            emphasized: true,
            alwaysShow: true,
          };
        }
        clearWrongFlash();
        addRoundWrongCountry(smallerId);
        setHighlightCountryId(largerId);
        setShowColorCountryIds([]);
        setLearnFeedbackLabelsById(labels);
        setLearnNeighborMapVisible(false);
        setLearnAreaCompareReveal({ largerId, smallerId });
        setLearnLandlockedReveal(null);
        setLearnHighlightWrongReveal(null);
        setFeedback(outcomeFeedback({ correct: false }));
      } else if (reveal.landlockedReveal) {
        const { countryId, isLandlocked } = reveal.landlockedReveal;
        const country = allCountriesById.get(countryId);
        const labels = {};
        if (
          country?.name &&
          activeCountries.some((entry) => entry.id === countryId)
        ) {
          labels[countryId] = {
            kind: "text",
            text: country.name,
            countryId,
            emphasized: true,
            alwaysShow: true,
          };
        }
        setHighlightCountryId(countryId);
        setShowColorCountryIds([]);
        setLearnFeedbackLabelsById(labels);
        setLearnNeighborMapVisible(false);
        setLearnAreaCompareReveal(null);
        setLearnLandlockedReveal({ countryId, isLandlocked });
        setLearnHighlightWrongReveal(null);
        // Amber landlocked banner already states the answer — skip redundant Incorrect toast.
        setFeedback({ text: "", type: "" });
      } else if (
        question?.mapConfig?.display === "highlight" &&
        question?.answerType === "text_entry"
      ) {
        // Keep the question card: typed answer turns red in-form and Submit
        // becomes the continue arrow. Keep the correct country yellow; paint
        // the guess red.
        const guessed = resolveGuessedCountryInRegion(event.selectedValue, {
          allCountriesById,
          activeCountries,
          excludeIds: question.countryId ? [question.countryId] : [],
        });
        if (guessed) {
          clearWrongFlash();
          addRoundWrongCountry(guessed.id);
        }
        setHighlightCountryId(question.countryId);
        setLearnHighlightWrongReveal({
          correctId: question.countryId,
          guessedId: guessed?.id ?? null,
        });
        setLearnFeedbackLabelsById({});
        setLearnNeighborMapVisible(false);
        setLearnAreaCompareReveal(null);
        setLearnLandlockedReveal(null);
        setFeedback({ text: "", type: "" });
      } else if (
        question?.mapConfig?.display === "highlight" &&
        !question?.mapConfig?.keepOverlay
      ) {
        // Map-only continue: keep the correct country yellow, paint the guess
        // red (if resolvable in-region), and title both on the map.
        const guessed = resolveGuessedCountryInRegion(event.selectedValue, {
          allCountriesById,
          activeCountries,
          excludeIds: question.countryId ? [question.countryId] : [],
        });
        if (guessed) {
          clearWrongFlash();
          addRoundWrongCountry(guessed.id);
        }
        setHighlightCountryId(question.countryId);
        setLearnHighlightWrongReveal({
          correctId: question.countryId,
          guessedId: guessed?.id ?? null,
        });
        setLearnFeedbackLabelsById({});
        setLearnNeighborMapVisible(false);
        setLearnAreaCompareReveal(null);
        setLearnLandlockedReveal(null);
        setFeedback(outcomeFeedback({ correct: false }));
      } else {
        // Card keep the teach copy in continueMessage; toast is just the title.
        setLearnNeighborMapVisible(false);
        setLearnAreaCompareReveal(null);
        setLearnLandlockedReveal(null);
        setLearnHighlightWrongReveal(null);
        setFeedback(outcomeFeedback({ correct: false }));
      }
    },
    [
      activeCountries,
      addRoundWrongCountry,
      advanceLearnAfterAnswer,
      allCountries,
      allCountriesById,
      beginRoundScoring,
      clearWrongFlash,
      markRoundCorrect,
      markRoundIncorrect,
      sessionRef,
      setFeedback,
      setHighlightCountryId,
      setShowColorCountryIds,
      showLearnNeighborMapReveal,
      signedInRef,
    ]
  );

  const handleLearnMapClick = useCallback(
    (feature) => {
      if (gamePausedRef.current) {
        if (tutorialStepId === "map") return;
        setShowResumeConfirm(true);
        return;
      }
      if (!gameActiveRef.current || learnLockRef.current) return;

      const question = currentLearnQuestionRef.current;
      const emit = learnMapEmitRef.current;
      if (!question || question.answerType !== "map_click" || typeof emit !== "function") {
        return;
      }

      const clicked = countryFromFeature(feature, activeCountries);
      if (!clicked) return;

      const correctIds = Array.isArray(question.correctAnswer)
        ? question.correctAnswer
        : [question.correctAnswer];
      const correct = correctIds.includes(clicked.id);

      if (correct) {
        addFilledCountry(clicked.id);
        setFeedback(
          outcomeFeedback({
            correct: true,
            secondTry: learnMapMissedRef.current,
          })
        );
        emit({
          correct: true,
          responseTimeMs: Date.now() - learnQuestionStartRef.current,
          revealUsed: false,
          priorMiss: learnMapMissedRef.current,
          timedOut: false,
          selectedValue: clicked.id,
        });
        return;
      }

      // Soft miss: name the clicked country and offer Try again (no score yet).
      // Keep the miss painted red until this question ends.
      learnLockRef.current = true;
      learnMapMissedRef.current = true;
      addRoundWrongCountry(clicked.id);
      playIncorrectSound();
      setLearnRetryMessage(`Oops, that is ${clicked.name}.`);
      setLearnAwaitingRetry(true);
      setFeedback({ text: "Try again.", type: "wrong" });
    },
    [
      activeCountries,
      addFilledCountry,
      addRoundWrongCountry,
      gameActiveRef,
      gamePausedRef,
      setFeedback,
      tutorialStepId,
    ]
  );

  const startLearnEngineGame = useCallback(
    ({ mode, region, level, learningSessionSize, learn }) => {
      clearPendingGuestGame();
      setMasteryLoadWarning(false);

      if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
      if (learnAdvanceTimerRef.current) {
        clearTimeout(learnAdvanceTimerRef.current);
        learnAdvanceTimerRef.current = null;
      }
      clearColorFlash();
      clearWrongFlash();
      resetIdleState();

      sessionStatRecordsRef.current = new Map();
      pendingStatPromisesRef.current = [];
      preCreditedIdsRef.current = [];
      setMilestoneStats(undefined);

      learnLockRef.current = false;
      learnAnswersRef.current = [];
      learnMasteryBeforeRef.current = new Map(learn.masteryBefore);
      learnMasteryAfterRef.current = new Map();
      learnSeenFactsRef.current = {};
      learnMapEmitRef.current = null;
      learnIndexRef.current = 0;
      learnQuestionsRef.current = learn.questions;
      learnQuestionStartRef.current = Date.now();
      learnChallengeRef.current = normalizeChallenge(
        learn.challenge ?? createDefaultChallenge()
      );
      learnSampledRef.current = learn.sampled ?? [];
      learnMasteryStatsRef.current = learn.masteryStats ?? new Map();
      learnCategoryRef.current = mode;
      learnRegionRef.current = region;
      setLearnSummary(null);
      setLearnIndex(0);
      setLearnQuestions(learn.questions);

      startGameTimer();
      resetQueue();
      resetScoring();
      beginRoundScoring();
      startGameBoard([]);

      setSession({
        gameType: GAME_TYPES.LEARNING,
        mode,
        region,
        level,
        review: false,
        go: false,
        learningSessionSize,
        totalRounds: learn.questions.length,
        preCreditedCount: 0,
        reviewCountryIds: null,
        learningCountryIds: learn.queueIds,
      });
      setGameComplete(false);
      setGamePaused(false);
      setShowResumeConfirm(false);
      setGameActive(true);
      pendingOnboardingPromptRef.current = true;
      setOnboardingGateOpen(true);
      setLearnMorePanelOpen(false);

      // Prefetch seen facts so "correct → show an unseen fact" works. Fails soft.
      fetchSeenFacts(learn.queueIds).then((seen) => {
        learnSeenFactsRef.current = seen ?? {};
      });

      router.push(buildPlayingUrl());
      gameInHistoryRef.current = true;
    },
    [
      beginRoundScoring,
      clearColorFlash,
      clearWrongFlash,
      resetIdleState,
      resetQueue,
      resetScoring,
      router,
      startGameBoard,
      startGameTimer,
    ]
  );

  // Per-question board setup for the Learn engine: point the map at the current
  // country, reset per-question timing, and clear teach-step paints.
  useEffect(() => {
    if (!learnEngineActive || !currentLearnQuestion) return;
    const question = currentLearnQuestion;

    beginRoundScoring();
    // Clear neighbor/wrong paints; keep highlight for the sync effect below.
    startRoundBoard(true, { clearHighlight: false });
    learnLockRef.current = false;
    learnQuestionStartRef.current = Date.now();
    clearLearnContinueState();
    setFeedback({ text: "", type: "" });
    setRevealMode(false);

    setTarget(allCountriesById.get(question.countryId) ?? null);
  }, [
    learnEngineActive,
    currentLearnQuestion,
    allCountriesById,
    beginRoundScoring,
    clearLearnContinueState,
    setFeedback,
    setRevealMode,
    setTarget,
    startRoundBoard,
  ]);

  // Keep the yellow subject highlight in sync with the active Learn question.
  // Separate from the reset effect so startRoundBoard / continue clears can't
  // leave highlightCountryId stuck at null (Georgia language bug).
  useEffect(() => {
    if (!learnEngineActive) return;
    const question = currentLearnQuestion;
    if (!question) {
      setHighlightCountryId(null);
      return;
    }
    const revealsAnchor = question.mapConfig?.display === "highlight";
    setHighlightCountryId(revealsAnchor ? question.countryId : null);
  }, [
    learnEngineActive,
    currentLearnQuestion,
    setHighlightCountryId,
  ]);

  const handleSessionStart = useCallback(
    async (config) => {
      if (config.go) {
        await startGoSession(config.region ?? "world");
        return { ok: true };
      }

      if (config.gameType === GAME_TYPES.DISCOVER) {
        startDiscoverGame({ mode: config.mode, region: config.region });
        return { ok: true };
      }

      if (config.gameType === GAME_TYPES.LEARNING) {
        try {
          const learn = await buildLearnEngineData(config);
          if (!learn) {
            return { ok: false, reason: "no-eligible" };
          }

          startLearnEngineGame({
            mode: config.mode,
            region: config.region,
            level: config.level ?? GAME_LEVELS.FIND_FILL,
            learningSessionSize: "all",
            learn,
          });
          return { ok: true };
        } catch (error) {
          console.error("Failed to start learning session:", error);
          return {
            ok: false,
            reason: "error",
            message: error.message || "Could not start learning session.",
          };
        }
      }

      if (config.region === "world" && signedIn) {
        const world = await buildWorldTestCountries({
          mode: config.mode,
          level: config.level,
        });
        startGame({
          gameType: GAME_TYPES.TEST,
          mode: config.mode,
          region: config.region,
          level: config.level,
          countries: world.countries,
          preCreditedCountryIds: world.preCreditedCountryIds,
          showMasteryLoadWarning: world.masteryLoadFailed,
        });
        return { ok: true };
      }

      startGame(config);
      return { ok: true };
    },
    [
      buildLearnEngineData,
      buildWorldTestCountries,
      signedIn,
      startDiscoverGame,
      startGame,
      startGoSession,
      startLearnEngineGame,
    ]
  );

  const exitToStartScreen = useCallback(
    (url = "/") => {
      resetIdleState();
      setShowMenuConfirm(false);
      setLeaveConfirmUrl(null);
      setShowResumeConfirm(false);
      setGamePaused(false);
      if (nextRoundTimeoutRef.current) {
        clearTimeout(nextRoundTimeoutRef.current);
      }
      clearColorFlash();
      clearWrongFlash();
      if (learnAdvanceTimerRef.current) {
        clearTimeout(learnAdvanceTimerRef.current);
        learnAdvanceTimerRef.current = null;
      }
      resetGameTimer();
      setSession(null);
      setGameActive(false);
      setGameComplete(false);
      setMilestoneStats(undefined);
      setMasteryLoadWarning(false);
      setLearnQuestions(null);
      setLearnIndex(0);
      setLearnSummary(null);
      learnQuestionsRef.current = null;
      learnIndexRef.current = 0;
      learnLockRef.current = false;
      resetQueue();
      resetScoring();
      beginRoundScoring();
      resetBoard();
      wrongAttemptsRef.current = 0;
      setAnswerText("");
      setSpellingSuggestionText(null);
      suppressPlayCheckRef.current = true;
      gameInHistoryRef.current = false;
      router.replace(url);
    },
    [
      beginRoundScoring,
      clearColorFlash,
      clearWrongFlash,
      resetBoard,
      resetGameTimer,
      resetIdleState,
      resetQueue,
      resetScoring,
      router,
    ]
  );

  const handleBackToMenu = () => {
    exitToStartScreen("/");
  };

  const handleConfirmLeave = () => {
    exitToStartScreen(leaveConfirmUrl || "/");
  };

  const handleMenuClick = () => {
    if (!gameComplete) {
      setLeaveConfirmUrl(null);
      setShowMenuConfirm(true);
      return;
    }
    handleBackToMenu();
  };

  const dismissMenuConfirm = () => {
    setShowMenuConfirm(false);
    setLeaveConfirmUrl(null);
  };

  const requestLeaveTo = (url) => {
    if (!session) return;
    if (gameComplete) {
      exitToStartScreen(url);
      return;
    }
    setLeaveConfirmUrl(url);
    setShowMenuConfirm(true);
  };

  const handleMetaModeClick = () => {
    requestLeaveTo(buildStartScreenUrl({ step: START_STEPS.EXPLORE }));
  };

  const handleMetaRegionClick = () => {
    requestLeaveTo(
      buildStartScreenUrl({
        step: isGoGame ? START_STEPS.GO_REGION : START_STEPS.EXPLORE,
      })
    );
  };

  const handleMetaLevelClick = () => {
    if (!session?.mode || !session?.region || isGoGame) return;
    if (isDiscoverGame || isLearningGame) {
      requestLeaveTo(
        buildStartScreenUrl({
          step: START_STEPS.CHOOSE_TYPE,
          mode: session.mode,
          region: session.region,
        })
      );
      return;
    }
    requestLeaveTo(
      buildStartScreenUrl({
        step: START_STEPS.LEVEL,
        mode: session.mode,
        region: session.region,
        gameType: session.gameType ?? GAME_TYPES.TEST,
      })
    );
  };

  const handleHeaderHome = () => {
    if (session) {
      handleMenuClick();
      return;
    }
    router.replace("/");
  };

  handleBackToMenuRef.current = handleBackToMenu;

  useEffect(() => {
    const playing = isPlayingSearchParams(searchParams);
    // Only react when the URL actually transitions out of the playing state
    // (i.e. a back navigation). This ignores the initial start transition and
    // any render where `useSearchParams()` hasn't yet caught up to the freshly
    // pushed playing URL, which would otherwise pop the leave prompt on start.
    const leftPlaying = wasPlayingRef.current && !playing;
    wasPlayingRef.current = playing;

    if (!session || !gameInHistoryRef.current) return;
    if (playing || !leftPlaying) return;

    if (suppressPlayCheckRef.current) {
      suppressPlayCheckRef.current = false;
      return;
    }

    if (!gameComplete) {
      setShowMenuConfirm(true);
      router.replace(buildPlayingUrl());
      return;
    }

    handleBackToMenuRef.current();
  }, [searchParams, session, gameComplete, router]);

  const handleResumeGame = useCallback(() => {
    setShowResumeConfirm(false);
    setGamePaused(false);
    resumeGameTimer();
    scheduleIdlePrompt();
  }, [resumeGameTimer, scheduleIdlePrompt]);

  const handleTogglePause = useCallback(() => {
    if (gamePaused) {
      handleResumeGame();
      return;
    }

    clearIdleTimers();
    closeIdlePrompt();
    setShowResumeConfirm(false);
    setGamePaused(true);
    pauseGameTimer();
  }, [clearIdleTimers, closeIdlePrompt, gamePaused, handleResumeGame, pauseGameTimer]);

  const handlePausedMapInteraction = useCallback(() => {
    if (!gamePausedRef.current) return;
    setShowResumeConfirm(true);
  }, []);

  const startLearningAgain = useCallback(async () => {
    if (!session || !isLearningGame || isGoGame) return;

    const learn = await buildLearnEngineData({
      mode: session.mode,
      level: session.level,
      region: session.region,
      learningSessionSize: session.learningSessionSize,
    });
    if (!learn) return;

    startLearnEngineGame({
      mode: session.mode,
      region: session.region,
      level: session.level,
      learningSessionSize: session.learningSessionSize,
      learn,
    });
  }, [buildLearnEngineData, isGoGame, isLearningGame, session, startLearnEngineGame]);

  const handlePlayAgain = () => {
    if (!session) return;
    if (session.go) {
      exitToStartScreen(buildStartScreenUrl({ step: START_STEPS.GO_REGION }));
      return;
    }
    if (isLearningGame) {
      startLearningAgain();
      return;
    }
    if (session.review && session.reviewCountryIds?.length) {
      const regionPool = filterCountriesByRegion(allCountries, session.region);
      const reviewPool = regionPool.filter((country) =>
        session.reviewCountryIds.includes(country.id)
      );
      startGame({
        gameType: session.gameType ?? GAME_TYPES.TEST,
        mode: session.mode,
        region: session.region,
        level: session.level,
        countries: reviewPool,
        review: true,
        reviewCountryIds: session.reviewCountryIds,
      });
      return;
    }
    handleSessionStart(session);
  };

  const handleReviewIncorrect = () => {
    if (!session || incorrectTargetsRef.current.length === 0) return;

    const reviewPool = [...incorrectTargetsRef.current];
    startGame({
      mode: session.mode,
      region: session.region,
      level: session.level,
      gameType: session.gameType ?? GAME_TYPES.TEST,
      countries: reviewPool,
      review: true,
      reviewCountryIds: reviewPool.map((country) => country.id),
    });
  };

  const handleCorrectRound = useCallback(
    (target) => {
      const attemptsBeforeCorrect = wrongAttemptsRef.current;
      const outcome =
        attemptsBeforeCorrect === 0
          ? ROUND_OUTCOMES.FIRST_TRY_CORRECT
          : ROUND_OUTCOMES.SECOND_TRY_CORRECT;
      recordRoundOutcome(outcome);

      if (attemptsBeforeCorrect === 0) {
        setFeedback(outcomeFeedback({ correct: true }));
      } else {
        setFeedback(outcomeFeedback({ correct: true, secondTry: true }));
      }
      markRoundCorrect();
      playCorrectSound();

      if (
        session?.level === GAME_LEVELS.FIND_FILL ||
        session?.level === GAME_LEVELS.NAME_FILL
      ) {
        if (roundMarkedIncorrectRef.current) {
          addWrongCountry(target.id);
        } else {
          addFilledCountry(target.id);
        }
      }

      if (finishRound()) return;

      if (isFlashLevel && !(isFlagsMode && isNameGame)) {
        clearColorFlash();
        clearWrongFlash();
        setShowColorCountryIds([target.id]);
        scheduleNextRound(Math.max(COUNTRY_FLASH_MS, CORRECT_ROUND_DELAY_MS));
        return;
      }

      scheduleNextRound(CORRECT_ROUND_DELAY_MS);
    },
    [
      addFilledCountry,
      addWrongCountry,
      clearColorFlash,
      clearWrongFlash,
      finishRound,
      isFlashLevel,
      isFlagsMode,
      isNameGame,
      markRoundCorrect,
      roundMarkedIncorrectRef,
      scheduleNextRound,
      session?.level,
      setFeedback,
      setShowColorCountryIds,
      recordRoundOutcome,
    ]
  );

  const handleRevealRound = useCallback(
    (target) => {
      if (!revealStatRecordedRef.current) {
        revealStatRecordedRef.current = true;
        recordRoundOutcome(ROUND_OUTCOMES.NEEDED_REVEAL);
      }

      const revealDetail = isNameGame
        ? session?.mode === GAME_MODES.CAPITALS
          ? `${target.capital} is the capital of ${target.name}. Press Enter to continue.`
          : `That's ${target.name}. Press Enter to continue.`
        : "Please click the flashing red country.";

      const showReveal = () => {
        setRevealMode(true);

        if (isFindLevel(session?.level ?? 0)) {
          setHighlightCountryId(target.id);
          setShowColorCountryIds([]);
        } else if (session?.level === GAME_LEVELS.NAME_FLASH) {
          if (session?.mode !== GAME_MODES.FLAGS) {
            setShowColorCountryIds([target.id]);
          }
          setHighlightCountryId(null);
        } else if (session?.level === GAME_LEVELS.NAME_FILL) {
          addWrongCountry(target.id);
          setHighlightCountryId(null);
        } else {
          setHighlightCountryId(target.id);
        }

        if (target.isSmall && isFindLevel(session?.level ?? 0)) {
          setFlashSmallCountryId(target.id);
        } else {
          setFlashSmallCountryId(null);
        }

        setFeedback(
          outcomeFeedback({
            correct: false,
            detail: revealDetail,
          })
        );
      };

      if (session?.level === GAME_LEVELS.NAME_FLASH && session?.mode !== GAME_MODES.FLAGS) {
        triggerColorFlash(target.id, showReveal);
        return;
      }

      showReveal();
    },
    [
      addWrongCountry,
      isNameGame,
      recordRoundOutcome,
      session?.level,
      session?.mode,
      setFeedback,
      setFlashSmallCountryId,
      setHighlightCountryId,
      setRevealMode,
      setShowColorCountryIds,
      triggerColorFlash,
    ]
  );

  const handleCountryClick = useCallback(
    (feature) => {
      if (gamePausedRef.current) {
        if (tutorialStepId === "map") return;
        setShowResumeConfirm(true);
        return;
      }

      const target = targetCountryRef.current;
      if (!gameActiveRef.current || !target || !isFindLevel(session?.level ?? 0)) return;

      const clicked = countryFromFeature(feature, activeCountries);
      if (!clicked) return;

      if (isFindFlagsGame) {
        setFlagsClickHeader({
          name: clicked.name,
          iso3: clicked.id,
          tone: isCorrectCountry(clicked, target) ? "correct" : "wrong",
        });
      }

      if (isCorrectCountry(clicked, target)) {
        if (revealModeRef.current) {
          setHighlightCountryId(null);
          setFlashSmallCountryId(null);
          setRevealMode(false);

          if (session?.level === GAME_LEVELS.FIND_FILL) {
            addWrongCountry(target.id);
          }

          setFeedback({ text: "Got it!", type: "got-it" });

          if (finishRound()) return;
          scheduleNextRound(REVEAL_ROUND_DELAY_MS);
          return;
        }

        handleCorrectRound(target);
        return;
      }

      if (revealModeRef.current) return;

      wrongAttemptsRef.current += 1;
      const attempts = wrongAttemptsRef.current;

      if (session?.level === GAME_LEVELS.FIND_FILL) {
        triggerWrongFlash(clicked.id);
      }

      addRoundWrongCountry(clicked.id);

      if (attempts === 1) {
        markRoundIncorrect(target);
      }

      playIncorrectSound();

      if (attempts >= MAX_ATTEMPTS) {
        handleRevealRound(target);
      } else {
        setFeedback({ text: "Try again.", type: "wrong" });
      }
    },
    [
      activeCountries,
      addRoundWrongCountry,
      addWrongCountry,
      finishRound,
      gamePausedRef,
      handleCorrectRound,
      handleRevealRound,
      markRoundIncorrect,
      revealModeRef,
      scheduleNextRound,
      session?.level,
      setFeedback,
      setFlashSmallCountryId,
      setHighlightCountryId,
      setRevealMode,
      targetCountryRef,
      isFindFlagsGame,
      triggerWrongFlash,
      tutorialStepId,
    ]
  );

  const handleDiscoverCountryClick = useCallback(
    (feature, context = {}) => {
      if (gamePausedRef.current) {
        if (tutorialStepId === "map") return;
        setShowResumeConfirm(true);
        return;
      }

      if (!gameActiveRef.current) return;

      const countryId = feature?.properties?.id ?? feature?.id ?? null;
      const territoryNote = matchDiscoverTerritoryNote({
        countryId,
        lngLat: context.lngLat,
        regionId: session?.region,
      });
      if (territoryNote) {
        setDiscoverTerritoryNote(territoryNote);
        setDiscoverCountrySheetOpen(false);
        return;
      }

      // Ignore other out-of-region land clicks.
      if (context.inactive) return;

      const clicked = countryFromFeature(feature, activeCountries);
      if (!clicked) return;

      const isNewDiscovery = !filledCountryIdSet.has(clicked.id);

      setTarget(clicked);
      addFilledCountry(clicked.id);
      setHighlightCountryId(null);
      setFlashSmallCountryId(null);
      setFeedback({ text: "", type: "" });
      setDiscoverCountrySheetOpen(true);

      if (isNewDiscovery) {
        setDiscoverAnimatingLabel((current) => {
          if (current) {
            setDiscoverLabelsById((labels) => ({
              ...labels,
              [current.countryId]: current,
            }));
          }
          return {
            countryId: clicked.id,
            ...getDiscoverLabelContent(clicked, session?.mode),
          };
        });
      }

      if (pronunciationAllowed && clicked.id && session?.mode === GAME_MODES.COUNTRIES) {
        playCountryPronunciation(clicked.id);
      } else if (
        pronunciationAllowed &&
        clicked.id &&
        session?.mode === GAME_MODES.CAPITALS &&
        clicked.capital?.trim()
      ) {
        playCapitalPronunciation(clicked.id);
      } else if (pronunciationAllowed && clicked.id && session?.mode === GAME_MODES.FLAGS) {
        playCountryPronunciation(clicked.id);
      }
    },
    [
      activeCountries,
      addFilledCountry,
      filledCountryIdSet,
      gamePausedRef,
      pronunciationAllowed,
      session?.mode,
      session?.region,
      setFeedback,
      setFlashSmallCountryId,
      setHighlightCountryId,
      setTarget,
      tutorialStepId,
    ]
  );

  const activeCountriesById = useMemo(
    () => Object.fromEntries(activeCountries.map((country) => [country.id, country])),
    [activeCountries]
  );
  // Area-compare / highlight-wrong teach: always derive titles from the reveal
  // so an edge country (e.g. Japan) can't lose its name if layout raced the camera.
  const learnMapLabelsById = useMemo(() => {
    const labels = { ...learnFeedbackLabelsById };

    if (learnAreaCompareReveal) {
      const { largerId, smallerId } = learnAreaCompareReveal;
      const formatAreaLabel = (country) => {
        if (!country?.name) return null;
        if (typeof country.area !== "number") return country.name;
        return `${country.name} · ${country.area.toLocaleString()} km²`;
      };
      for (const id of [largerId, smallerId]) {
        if (!id) continue;
        const country =
          activeCountriesById[id] ?? allCountriesById.get(id) ?? null;
        const text = formatAreaLabel(country);
        if (!text) continue;
        labels[id] = {
          kind: "text",
          text,
          countryId: id,
          emphasized: true,
          alwaysShow: true,
        };
      }
    }

    if (learnHighlightWrongReveal) {
      const { correctId, guessedId } = learnHighlightWrongReveal;
      for (const [id, emphasized] of [
        [correctId, true],
        [guessedId, false],
      ]) {
        if (!id) continue;
        const country =
          activeCountriesById[id] ?? allCountriesById.get(id) ?? null;
        if (!country?.name) continue;
        labels[id] = {
          kind: "text",
          text: country.name,
          countryId: id,
          emphasized,
          alwaysShow: true,
        };
      }
    }

    return labels;
  }, [
    learnAreaCompareReveal,
    learnHighlightWrongReveal,
    learnFeedbackLabelsById,
    activeCountriesById,
    allCountriesById,
  ]);
  const hasLearnMapLabels = Object.keys(learnMapLabelsById).length > 0;
  // Learn teach labels may name a peer that isn't in the active filter — keep
  // those countries projectable so title/area text can still render.
  const learnLabelCountriesById = useMemo(() => {
    if (!hasLearnMapLabels) return activeCountriesById;
    const next = { ...activeCountriesById };
    for (const id of Object.keys(learnMapLabelsById)) {
      if (next[id]) continue;
      const country = allCountriesById.get(id);
      if (country) next[id] = country;
    }
    return next;
  }, [
    activeCountriesById,
    allCountriesById,
    hasLearnMapLabels,
    learnMapLabelsById,
  ]);
  const needsMapProjection = isDiscoverGame || learnEngineActive;
  // Neighbor teach: derive border paints from the question (same pattern as
  // mapHighlightCountryId) so a board clear / camera settle can't leave India
  // & co. unlabeled-only gray while Bangladesh stays white.
  const learnNeighborPaintIds = useMemo(() => {
    if (!learnNeighborRevealActive || !currentLearnQuestion?.countryId) return [];
    return getNeighborIdsForQuestion(currentLearnQuestion, allCountriesById).filter((id) =>
      activeCountries.some((country) => country.id === id)
    );
  }, [
    learnNeighborRevealActive,
    currentLearnQuestion,
    allCountriesById,
    activeCountries,
  ]);
  // Exclude missed / distractor reds so the teach override can't re-green them.
  const learnNeighborGreenIds = useMemo(() => {
    if (!learnNeighborRevealActive) return [];
    const wrongSet = new Set(mapWrongCountryIds);
    return learnNeighborPaintIds.filter((id) => !wrongSet.has(id));
  }, [learnNeighborRevealActive, learnNeighborPaintIds, mapWrongCountryIds]);
  const mapFilledCountryIds = learnNeighborRevealActive
    ? learnNeighborGreenIds
    : filledCountryIds;
  // Learn only uses showColor for the neighbor-teach step. Gate it on that flag so
  // a stale id list can't leave the "Y" country painted after Continue.
  const mapShowColorCountryIds = learnNeighborRevealActive
    ? learnNeighborGreenIds
    : learnEngineActive
      ? []
      : showColorCountryIds;

  const handleMapViewChange = useCallback(() => {
    setMapViewRevision((revision) => revision + 1);
  }, []);

  // Discover labels subscribe here so pan frames don't re-render GeographyGame.
  const discoverMapMoveHandlerRef = useRef(null);
  const handleMapMove = useCallback(() => {
    discoverMapMoveHandlerRef.current?.();
  }, []);

  const handleDiscoverCountryHover = useCallback((countryId) => {
    setDiscoverHoveredCountryId(countryId);
  }, []);

  const registerMapProject = useCallback((projectFn) => {
    mapProjectRef.current = projectFn;
    setMapViewRevision((revision) => revision + 1);
  }, []);

  const projectCountry = useCallback((country) => {
    const api = mapProjectRef.current;
    if (!api) return null;
    if (typeof api === "function") return api(country);
    return api.projectPoint?.(country) ?? null;
  }, []);

  const projectDiscoverAnchor = useCallback((country, viewportRect) => {
    const api = mapProjectRef.current;
    if (!api || typeof api === "function") return null;
    // No centroid fallback — off-screen countries must not get a label.
    return api.projectDiscoverAnchor?.(country, viewportRect) ?? null;
  }, []);

  const projectCountryBounds = useCallback((country) => {
    const api = mapProjectRef.current;
    if (!api || typeof api === "function") return null;
    return api.projectBounds?.(country) ?? null;
  }, []);

  const getDiscoverLabelScale = useCallback(() => {
    const api = mapProjectRef.current;
    if (!api || typeof api === "function") return 1;
    return api.getDiscoverLabelScale?.() ?? 1;
  }, []);

  const handleDiscoverLabelLanded = useCallback((label) => {
    setDiscoverLabelsById((labels) => ({
      ...labels,
      [label.countryId]: label,
    }));
    setDiscoverAnimatingLabel((current) =>
      current?.countryId === label.countryId ? null : current
    );
  }, []);

  useEffect(() => {
    if (!isDiscoverGame || !gameActive || discoverCompleteShownRef.current) return;
    if (activeCountries.length === 0) return;

    const allDiscovered = activeCountries.every((country) =>
      filledCountryIdSet.has(country.id)
    );
    if (!allDiscovered) return;

    discoverCompleteShownRef.current = true;
    setDiscoverCompleteModalOpen(true);
    setDiscoverCountrySheetOpen(false);
  }, [activeCountries, filledCountryIdSet, gameActive, isDiscoverGame]);

  const handleKeepDiscovering = useCallback(() => {
    setDiscoverCompleteModalOpen(false);
    setDiscoverCountrySheetOpen(false);
  }, []);

  const handleDiscoverStartTest = useCallback(() => {
    if (!session?.mode || !session?.region) return;

    setDiscoverCompleteModalOpen(false);
    setDiscoverCountrySheetOpen(false);
    setShowMenuConfirm(false);
    startGame({
      gameType: GAME_TYPES.TEST,
      mode: session.mode,
      region: session.region,
      level: GAME_LEVELS.FIND_FILL,
    });
  }, [session?.mode, session?.region, startGame]);

  const handleAnswerSubmit = useCallback(() => {
    if (gamePausedRef.current) {
      setShowResumeConfirm(true);
      return;
    }

    const target = targetCountryRef.current;
    if (!gameActiveRef.current || !target || !session || !isNameLevel(session.level)) {
      return;
    }

    if (revealModeRef.current) {
      setHighlightCountryId(null);
      setFlashSmallCountryId(null);
      setRevealMode(false);
      setFeedback({ text: "", type: "" });

      if (finishRound()) return;
      scheduleNextRound(REVEAL_ROUND_DELAY_MS);
      return;
    }

    if (isCorrectTextAnswer(answerText, target, session.mode)) {
      setSpellingSuggestionText(null);
      handleCorrectRound(target);
      return;
    }

    const suggestion = getSpellingSuggestion(answerText, target, session.mode);
    setAnswerText("");
    setSpellingSuggestionText(suggestion);

    wrongAttemptsRef.current += 1;
    const attempts = wrongAttemptsRef.current;

    if (attempts === 1) {
      markRoundIncorrect(target);
    }

    playIncorrectSound();

    if (attempts >= MAX_ATTEMPTS) {
      setSpellingSuggestionText(null);
      handleRevealRound(target);
    } else {
      setFeedback({ text: "Try again.", type: "wrong" });
    }
  }, [
    answerText,
    finishRound,
    gameActiveRef,
    gamePausedRef,
    handleCorrectRound,
    handleRevealRound,
    markRoundIncorrect,
    revealModeRef,
    scheduleNextRound,
    session,
    setFeedback,
    setFlashSmallCountryId,
    setHighlightCountryId,
    setRevealMode,
    targetCountryRef,
  ]);

  const handleAnswerKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAnswerSubmit();
    }
  };

  const handleSpellingSuggestionClick = () => {
    if (!spellingSuggestionText) return;
    setAnswerText(spellingSuggestionText);
    setSpellingSuggestionText(null);
    requestAnimationFrame(() => answerInputRef.current?.focus());
  };

  const handleAnswerInputChange = (event) => {
    setAnswerText(event.target.value);
    setSpellingSuggestionText(null);
  };

  const ready = allCountries.length > 0 && hasToken && !loadError;

  const promptText = !hasToken
    ? "Add NEXT_PUBLIC_MAPBOX_TOKEN to a .env file (see .env.example)"
    : loadError
      ? loadError
      : isDiscoverGame
        ? getDiscoverInstructionText(session?.mode)
        : session?.mode === GAME_MODES.CAPITALS
          ? targetCountry?.capital
          : session?.mode === GAME_MODES.FLAGS
            ? null
            : targetCountry?.name;

  const showFlagPrompt =
    !isDiscoverGame &&
    !learnEngineActive &&
    isFlagsMode &&
    targetCountry?.iso2 &&
    !gameComplete &&
    (isNameGame || isFindLevel(session?.level ?? 0));

  const flagPromptAlt =
    revealMode ||
    feedback.type === "correct" ||
    feedback.type === "second-try" ||
    feedback.type === "got-it" ||
    feedback.type === "reveal" ||
    feedback.type === "incorrect"
      ? targetCountry?.name ?? ""
      : "Flag — identify this country";

  const mapInteractionEnabled =
    gameActive &&
    (!gamePaused || tutorialStepId === "map") &&
    (learnEngineActive
      ? isLearnMapClickQuestion
      : isDiscoverGame || (session?.level != null && isFindLevel(session.level)));

  // Learn: map-click / neighbor / area-compare / highlight prompts may pan/zoom
  // so the learner can inspect the region (e.g. "what country is highlighted").
  // Landlocked teach stays locked — the answer is yes/no, not map reading.
  const mapNavigationEnabled =
    !learnEngineActive ||
    isDiscoverGame ||
    (learnUsesMap && !learnLandlockedRevealActive);

  const mapLevel =
    isDiscoverGame || learnEngineActive ? GAME_LEVELS.FIND_FILL : session?.level;

  const mapCountryClickHandler = isDiscoverGame
    ? handleDiscoverCountryClick
    : learnEngineActive
      ? handleLearnMapClick
      : handleCountryClick;

  const promptWrong =
    feedback.type === "wrong" ||
    feedback.type === "reveal" ||
    feedback.type === "incorrect" ||
    feedback.type === "got-it";

  const showTargetPronunciation =
    targetCountry?.id &&
    ((session?.mode === GAME_MODES.COUNTRIES && promptText === targetCountry.name) ||
      (session?.mode === GAME_MODES.CAPITALS &&
        targetCountry.capital &&
        promptText === targetCountry.capital));

  const targetPronunciationKind =
    session?.mode === GAME_MODES.CAPITALS
      ? PRONUNCIATION_KINDS.CAPITAL
      : PRONUNCIATION_KINDS.COUNTRY;

  const renderGamePrompt = (className, { showFlagInPrompt = false, compactInput = false } = {}) => {
    if (isDiscoverGame) {
      return (
        <div className={cn(className ?? prompt, promptWrong && "text-error")}>
          {getDiscoverInstructionText(session?.mode)}
        </div>
      );
    }

    return (
    <div className={promptFeedback({ wrong: promptWrong, className })}>
      {isNameGame ? (
        <div className={answerPrompt}>
          <input
            ref={answerInputRef}
            type="text"
            className={compactInput ? gamePromptMobileInput : answerInput}
            value={answerText}
            placeholder={
              session.mode === GAME_MODES.CAPITALS
                ? "Type the capital…"
                : "Type the country…"
            }
            aria-label={
              session.mode === GAME_MODES.CAPITALS
                ? "Capital answer"
                : session.mode === GAME_MODES.FLAGS
                  ? "Country answer — identify the flag"
                  : "Country answer"
            }
            autoComplete="off"
            spellCheck={false}
            disabled={!gameActive || gamePaused}
            onChange={handleAnswerInputChange}
            onKeyDown={handleAnswerKeyDown}
          />
          {spellingSuggestionText && (
            <p className={spellingSuggestion}>
              Did you mean{" "}
              <button
                type="button"
                className={spellingSuggestionLink}
                onClick={handleSpellingSuggestionClick}
              >
                {spellingSuggestionText}
              </button>
              ?
            </p>
          )}
        </div>
      ) : isFindFlagsGame ? (
        flagsClickHeader ? (
          <CountryPromptLabel
            text={flagsClickHeader.name}
            iso3={flagsClickHeader.iso3}
            toneClassName={
              flagsClickHeader.tone === "correct" ? "prompt-correct" : "prompt-wrong"
            }
            pronunciationDisabled={!pronunciationAllowed}
          />
        ) : showFlagPrompt ? (
          <span className="sr-only">{flagPromptAlt}</span>
        ) : null
      ) : showFlagInPrompt && showFlagPrompt ? (
        <FlagPrompt
          iso2={targetCountry.iso2}
          size="card"
          className="mx-auto"
          alt={flagPromptAlt}
        />
      ) : isFlagsMode ? null : showTargetPronunciation ? (
        <CountryPromptLabel
          text={promptText}
          iso3={targetCountry.id}
          kind={targetPronunciationKind}
          pronunciationDisabled={!pronunciationAllowed}
        />
      ) : (
        promptText
      )}
    </div>
    );
  };

  const showMobilePrompt =
    !gameComplete &&
    !learnEngineActive &&
    !isDiscoverGame &&
    (isNameGame ||
      (isFindFlagsGame && flagsClickHeader) ||
      showFlagPrompt ||
      Boolean(promptText));

  return (
    <div className={gameShell}>
      <AppHeader onHomeClick={handleHeaderHome} />

      {!session ? (
        !hasToken || loadError ? (
          <div className={startScreen}>
            <p className={startSubtitle}>{promptText}</p>
          </div>
        ) : (
          <StartScreen
            onStart={handleSessionStart}
            gameReady={ready}
            countries={regionMapCountries}
          />
        )
      ) : (
        <>
          {masteryLoadWarning && (
            <div
              className="flex shrink-0 items-start justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-text max-md:px-3"
              role="status"
            >
              <p className="m-0 text-amber-100">
                Couldn&apos;t load mastery data — playing the full World Test.
              </p>
              <button
                type="button"
                className={cn(
                  "shrink-0 rounded-sm border-0 bg-transparent px-3 py-2 text-lg leading-none text-text-muted cursor-pointer hover:text-text",
                  focusRing
                )}
                onClick={() => setMasteryLoadWarning(false)}
                aria-label="Dismiss mastery load notice"
              >
                ×
              </button>
            </div>
          )}
          <header
            className={cn(
              gameHeader,
              isDiscoverGame ? gameHeaderDiscoverMobile : gameHeaderMobileDefault
            )}
          >
            <div
              className={
                isDiscoverGame ? gameHeaderLeftDiscoverMobile : gameHeaderLeft
              }
            >
              {isDiscoverGame && (
                <div className="md:hidden">
                  <GameTutorialButton
                    onClick={() => openGameTutorial({ manual: true })}
                  />
                </div>
              )}
              <div className={cn(gameMeta, isDiscoverGame && "max-md:hidden")}>
                <button
                  type="button"
                  className={gameMetaTagButton}
                  onClick={handleMetaModeClick}
                  aria-label={`Change mode (currently ${modeLabel})`}
                >
                  {modeLabel}
                </button>
                <button
                  type="button"
                  className={gameMetaTagButton}
                  onClick={handleMetaRegionClick}
                  aria-label={`Change region (currently ${regionLabel})`}
                >
                  {regionLabel}
                </button>
                {isDiscoverGame ? (
                  <button
                    type="button"
                    className={gameMetaTagButton}
                    onClick={handleMetaLevelClick}
                    aria-label="Change game type (currently Discover)"
                  >
                    {getGameTypeLabel(GAME_TYPES.DISCOVER)}
                  </button>
                ) : (
                  levelLabel && (
                    <button
                      type="button"
                      className={gameMetaTagButton}
                      onClick={handleMetaLevelClick}
                      aria-label={`Change level (currently ${levelLabel})`}
                    >
                      {levelLabel}
                    </button>
                  )
                )}
                {session.review && (
                  <span className={cn(gameMetaTag, "max-sm:hidden")}>Review</span>
                )}
                {isLearningGame && (
                  <span className={cn(gameMetaTag, "max-sm:hidden")}>Learning</span>
                )}
              </div>
            </div>

            {!gameComplete && !learnEngineActive && (
              <div
                ref={assignGamePromptAnchorRef}
                className={
                  isDiscoverGame
                    ? gameHeaderCenterDiscoverMobile
                    : gameHeaderCenter
                }
              >
                {renderGamePrompt(
                  isDiscoverGame ? gameHeaderDiscoverPrompt : undefined
                )}
              </div>
            )}

            <div
              className={
                isDiscoverGame
                  ? gameHeaderRightDiscoverMobile
                  : gameHeaderRightMobilePlay
              }
            >
              {!gameComplete && (
                <div className={cn(gameHeaderActions, "max-md:justify-self-start")}>
                  {!isDiscoverGame && (
                    <>
                      <span className={cn(gameTimer, "max-md:hidden")}>
                        {formatElapsedTime(elapsedMs)}
                      </span>
                      <div
                        className={cn(gameProgress, "max-md:hidden")}
                        role="progressbar"
                        aria-valuenow={queuePosition}
                        aria-valuemin={0}
                        aria-valuemax={totalRounds}
                        aria-label={`Game progress: ${queuePosition} of ${totalRounds}`}
                      >
                        <div
                          className={gameProgressFill}
                          style={{ width: `${queueProgress * 100}%` }}
                        />
                      </div>
                    </>
                  )}
                  <div className={gameControls} ref={gameControlsRef}>
                    <span className={cn(isDiscoverGame && "max-md:hidden")}>
                      <GameTutorialButton
                        onClick={() => openGameTutorial({ manual: true })}
                      />
                    </span>
                    <SoundVolumeButton />
                    {!isDiscoverGame && (
                      <button
                        type="button"
                        className={gameControlBtn}
                        onClick={handleTogglePause}
                        aria-label={gamePaused ? "Resume game" : "Pause game"}
                        title={gamePaused ? "Resume" : "Pause"}
                      >
                        {gamePaused ? (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                          </svg>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${gameControlBtn} ${gameControlBtnStop}`}
                      onClick={handleMenuClick}
                      aria-label="Stop game"
                      title="Stop"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                        <rect x="6" y="6" width="12" height="12" rx="1" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
              {!isDiscoverGame && !gameComplete && (
                <span className={gameHeaderTimerMobile} aria-live="off">
                  {formatElapsedTime(elapsedMs)}
                </span>
              )}
              {!isDiscoverGame && (
                <div
                  className={cn(gameHeaderStats, "max-md:justify-self-end")}
                  ref={gameHeaderStatsRef}
                >
                  <div className={scoreboard}>
                    <span className={scoreCorrect}>
                      <span className="max-md:hidden">correct: </span>
                      <span className="md:hidden" aria-hidden="true">
                        ✓{" "}
                      </span>
                      {displayedCorrect}/{totalRounds}
                    </span>
                    <span className={scoreIncorrect}>
                      <span className="max-md:hidden">incorrect: </span>
                      <span className="md:hidden" aria-hidden="true">
                        ✗{" "}
                      </span>
                      {wrongCount}/{totalRounds}
                    </span>
                  </div>
                  {!gameComplete && (
                    <div
                      className={cn(gameProgress, "md:hidden")}
                      role="progressbar"
                      aria-valuenow={queuePosition}
                      aria-valuemin={0}
                      aria-valuemax={totalRounds}
                      aria-label={`Game progress: ${queuePosition} of ${totalRounds}`}
                    >
                      <div
                        className={gameProgressFill}
                        style={{ width: `${queueProgress * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>
          {(isOceaniaRegion || hasToken) && !gameComplete && (
            <div className={mapStage} ref={mapContainerRef}>
              <div className={mapOverlayStack}>
                {showMobilePrompt && (
                  <div ref={assignMobilePromptRef} className={gamePromptMobileFloat}>
                    {renderGamePrompt(gamePromptMobileCard, {
                      showFlagInPrompt: true,
                      compactInput: true,
                    })}
                  </div>
                )}
                {/* Learn card hosts its own toast under the question; map-stack
                    toast covers test mode + map-only learn continue steps. */}
                {(!learnEngineActive || learnMapOnlyContinue) && (
                  <div className={mapFeedbackAnchor}>
                    <MapFeedback
                      text={feedback.text}
                      type={feedback.type}
                      detail={feedback.detail}
                    />
                  </div>
                )}
                {/* Desktop: Continue sits directly under the feedback banner on
                    neighbor teach steps so it isn't lost at the bottom of a tall
                    map. Landlocked uses its own top column (below). Mobile keeps
                    the bottom Continue chrome. */}
                {learnEngineActive &&
                  learnMapOnlyContinue &&
                  !gameComplete &&
                  !learnLandlockedTopMessage &&
                  !learnMapContinueTopPrompt && (
                    <div className="pointer-events-none hidden w-full flex-col items-center gap-3 md:flex">
                      {currentLearnQuestion?.continueNote && (
                        <p className="pointer-events-none m-0 max-w-md rounded-xl border border-border bg-surface/95 px-4 py-3 text-center text-sm leading-snug text-text-muted shadow-xl backdrop-blur">
                          {currentLearnQuestion.continueNote}
                        </p>
                      )}
                      <button
                        type="button"
                        className={cn(primaryBtn, "pointer-events-auto max-w-xs shadow-xl")}
                        onClick={handleLearnContinue}
                        autoFocus
                      >
                        Continue
                      </button>
                    </div>
                  )}
              </div>
              {isOceaniaRegion ? (
                <PacificMap
                  activeCountries={activeCountries}
                  inactiveCountries={inactiveCountries}
                  countryColorMap={countryColorMap}
                  gameActive={mapInteractionEnabled}
                  level={mapLevel}
                  wrongCountryIds={mapWrongCountryIds}
                  flashWrongCountryIds={flashWrongCountryIds}
                  showColorCountryIds={mapShowColorCountryIds}
                  filledCountryIds={mapFilledCountryIds}
                  highlightTargetCountryId={highlightTargetCountryId}
                  highlightCountryId={mapHighlightCountryId}
                  highlightTone={learnHighlightTone}
                  flashSmallCountryId={flashSmallCountryId}
                  onCountryClick={mapCountryClickHandler}
                  onCountryHover={isDiscoverGame ? handleDiscoverCountryHover : undefined}
                  onRegisterMapProject={needsMapProjection ? registerMapProject : undefined}
                  onMapViewChange={needsMapProjection ? handleMapViewChange : undefined}
                  onMapMove={needsMapProjection ? handleMapMove : undefined}
                  mapControlsRef={pacificControlsRef}
                  forceShowSmallCountryCircles={tutorialOpen}
                  hideCountryOutlines={hideCountryOutlines}
                />
              ) : (
                <MapboxMap
                  geojson={activeGeojson}
                  inactiveGeojson={inactiveGeojson}
                  smallCountriesGeojson={activeSmallCountriesGeojson}
                  gameActive={mapInteractionEnabled}
                  mapNavigationEnabled={mapNavigationEnabled}
                  level={mapLevel}
                  wrongCountryIds={mapWrongCountryIds}
                  flashWrongCountryIds={flashWrongCountryIds}
                  showColorCountryIds={mapShowColorCountryIds}
                  filledCountryIds={mapFilledCountryIds}
                  highlightTargetCountryId={highlightTargetCountryId}
                  highlightCountryId={mapHighlightCountryId}
                  highlightTone={learnHighlightTone}
                  flashSmallCountryId={flashSmallCountryId}
                  mapView={mapViewForRender}
                  forceShowSmallCountryCircles={tutorialOpen}
                  allowInactiveCountryClicks={isDiscoverGame}
                  hideCountryOutlines={hideCountryOutlines}
                  onCountryClick={mapCountryClickHandler}
                  onCountryHover={isDiscoverGame ? handleDiscoverCountryHover : undefined}
                  onRegisterMapProject={needsMapProjection ? registerMapProject : undefined}
                  onMapViewChange={needsMapProjection ? handleMapViewChange : undefined}
                  onMapMove={needsMapProjection ? handleMapMove : undefined}
                />
              )}
              {gamePaused &&
                !gameComplete &&
                !isDiscoverGame &&
                !tutorialOpen &&
                !modeIntroOpen && (
                <button
                  type="button"
                  className={mapPauseOverlay}
                  onClick={handlePausedMapInteraction}
                  aria-label="Game paused. Click to resume."
                />
              )}
              {showFlagPrompt && (
                <div className={cn(flagCard, "max-md:hidden")}>
                  <FlagPrompt
                    iso2={targetCountry.iso2}
                    size="card"
                    alt={flagPromptAlt}
                  />
                </div>
              )}
              {showLearnMorePanel && (
                <MapCountryInfoPanels
                  panelRef={learnMorePanelRef}
                  country={targetCountry}
                  allCountries={allCountries}
                  mode={session.mode}
                  level={session.level}
                  revealMode={isDiscoverGame || revealMode}
                  isDiscover={isDiscoverGame}
                  open={learnMorePanelOpen}
                  onToggle={toggleLearnMorePanel}
                  onClose={closeInfoPanels}
                />
              )}
              {isDiscoverGame && (
                <DiscoverCountrySheet
                  country={targetCountry}
                  open={discoverCountrySheetOpen}
                  onClose={closeDiscoverCountrySheet}
                />
              )}
              {learnEngineActive &&
                currentLearnQuestion &&
                !gameComplete &&
                !learnMapOnlyContinue &&
                !modeIntroOpen &&
                !tutorialOpen && (
                <LearnRoundOverlay
                  question={currentLearnQuestion}
                  variant={learnUsesMap ? "top" : "center"}
                  onAnswer={handleLearnAnswer}
                  onSelectFeedback={handleLearnSelectFeedback}
                  resolveCountry={resolveLearnCountry}
                  speedBaselineMs={null}
                  awaitingContinue={learnAwaitingContinue}
                  continueMessage={learnContinueMessage}
                  continueLabel="Continue"
                  onContinue={handleLearnContinue}
                  awaitingRetry={learnAwaitingRetry}
                  retryMessage={learnRetryMessage}
                  onTryAgain={handleLearnTryAgain}
                  feedbackText={feedback.text || null}
                  feedbackType={feedback.type || null}
                  feedbackDetail={feedback.detail || null}
                  emaScore={
                    learnMasteryAfterRef.current.get(
                      currentLearnQuestion.countryId
                    ) ??
                    learnMasteryBeforeRef.current.get(
                      currentLearnQuestion.countryId
                    ) ??
                    null
                  }
                  onMapClickReady={(emit) => {
                    learnMapEmitRef.current = emit;
                  }}
                />
              )}
              {learnEngineActive && learnMapOnlyContinue && !gameComplete && (
                <>
                  {learnLandlockedTopMessage && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-col items-center gap-3 px-3 pt-3">
                      <p className="m-0 max-w-md rounded-xl border border-amber-300/45 bg-gradient-to-br from-amber-900/95 to-orange-800/90 px-4 py-3 text-center text-sm font-semibold leading-snug text-amber-50 shadow-[0_10px_40px_rgba(245,158,11,0.28),0_0_0_1px_rgba(255,255,255,0.06)_inset] backdrop-blur">
                        {learnLandlockedTopMessage}
                      </p>
                      {/* Desktop: Continue directly under the landlocked banner. */}
                      <div className="hidden w-full flex-col items-center gap-3 md:flex">
                        {currentLearnQuestion?.continueNote && (
                          <p className="pointer-events-none m-0 max-w-md rounded-xl border border-border bg-surface/95 px-4 py-3 text-center text-sm leading-snug text-text-muted shadow-xl backdrop-blur">
                            {currentLearnQuestion.continueNote}
                          </p>
                        )}
                        <button
                          type="button"
                          className={cn(primaryBtn, "pointer-events-auto max-w-xs shadow-xl")}
                          onClick={handleLearnContinue}
                          autoFocus
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  )}
                  {learnMapContinueTopPrompt && (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 pt-3">
                      <div className="flex max-w-lg items-center gap-2.5 rounded-xl border border-border bg-surface/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur">
                        <p className="m-0 min-w-0 flex-1 text-center text-base font-semibold leading-snug text-text">
                          {learnMapContinueTopPrompt}
                        </p>
                        <button
                          type="button"
                          className={cn(
                            "pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 text-white",
                            "cursor-pointer bg-[image:var(--accent-gradient)] shadow-[var(--shadow-accent)]",
                            "transition-[transform,box-shadow,background] duration-150 ease-out",
                            "enabled:hover:-translate-y-px enabled:hover:bg-[image:var(--accent-gradient-hover)]",
                            "enabled:active:translate-y-0",
                            focusRing
                          )}
                          onClick={handleLearnContinue}
                          aria-label="Continue"
                          autoFocus
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="20"
                            height="20"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M5 12h12M13 6l6 6-6 6"
                              stroke="currentColor"
                              strokeWidth="2.25"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {/* Mobile bottom Continue (desktop uses the top placements above). */}
                  {(currentLearnQuestion?.continueNote ||
                    !learnMapContinueTopPrompt) && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 md:hidden">
                      {currentLearnQuestion?.continueNote && (
                        <p className="pointer-events-none m-0 max-w-md rounded-xl border border-border bg-surface/95 px-4 py-3 text-center text-sm leading-snug text-text-muted shadow-xl backdrop-blur">
                          {currentLearnQuestion.continueNote}
                        </p>
                      )}
                      {!learnMapContinueTopPrompt && (
                        <button
                          type="button"
                          className={cn(primaryBtn, "pointer-events-auto max-w-xs shadow-xl")}
                          onClick={handleLearnContinue}
                          autoFocus
                        >
                          Continue
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {(isDiscoverGame || hasLearnMapLabels) && (
                <DiscoverMapLabels
                  mapContainerRef={mapContainerRef}
                  headerAnchorRef={discoverHeaderAnchorRef}
                  mobileAnchorRef={discoverMobileAnchorRef}
                  labelsById={isDiscoverGame ? discoverLabelsById : learnMapLabelsById}
                  animatingLabel={isDiscoverGame ? discoverAnimatingLabel : null}
                  countriesById={
                    isDiscoverGame ? activeCountriesById : learnLabelCountriesById
                  }
                  projectCountry={projectCountry}
                  projectDiscoverAnchor={projectDiscoverAnchor}
                  projectCountryBounds={projectCountryBounds}
                  getDiscoverLabelScale={getDiscoverLabelScale}
                  mapViewRevision={mapViewRevision}
                  mapMoveHandlerRef={discoverMapMoveHandlerRef}
                  hoveredCountryId={isDiscoverGame ? discoverHoveredCountryId : null}
                  learnMorePanelRef={learnMorePanelRef}
                  learnMorePanelActive={Boolean(
                    showLearnMorePanel && learnMorePanelOpen
                  )}
                  onLabelLanded={handleDiscoverLabelLanded}
                />
              )}
            </div>
          )}
          <GameCompleteModal
            open={gameComplete}
            score={displayedCorrect}
            rightCount={displayedCorrect}
            wrongCount={wrongCount}
            total={totalRounds}
            mode={session.mode}
            region={session.region}
            level={session.level}
            modeLabel={modeLabel}
            regionLabel={regionLabel}
            levelLabel={levelLabel}
            totalElapsedMs={finalElapsedMs}
            isReview={session.review}
            isLearning={isLearningGame}
            isGo={isGoGame}
            learnSummary={learnSummary}
            milestoneStats={milestoneStats}
            graduatedCountryNames={newlyGraduatedNames}
            guestSyncState={guestSyncState}
            canReviewIncorrect={isTestGame && !session.review && wrongCount > 0}
            onReviewIncorrect={handleReviewIncorrect}
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToMenu}
          />
          <IdlePromptModal open={idlePromptOpen} onContinue={handleIdleContinue} />
          <DiscoverTerritoryModal
            open={Boolean(discoverTerritoryNote)}
            note={discoverTerritoryNote}
            onClose={closeDiscoverTerritoryNote}
          />
          <GameModeIntro
            open={modeIntroOpen}
            title={modeIntro.title}
            paragraphs={modeIntro.paragraphs}
            onClose={closeModeIntro}
          />
          <GameTutorial
            open={tutorialOpen}
            steps={tutorialSteps}
            targets={tutorialTargetRefs}
            isMobile={isMobile}
            onClose={closeGameTutorial}
            onStepChange={(step) => setTutorialStepId(step?.id ?? null)}
          />
          {showResumeConfirm && (
            <div className={modalOverlay}>
              <div
                ref={resumeDialogRef}
                className={modalCard}
                role="dialog"
                aria-modal="true"
                aria-labelledby="resume-confirm-title"
              >
                <h2 id="resume-confirm-title" className={modalTitle}>
                  Resume game?
                </h2>
                <p className={modalSubtitle}>
                  The game is paused. Do you want to resume?
                </p>
                <div className={modalActions}>
                  <button type="button" className={primaryBtn} onClick={handleResumeGame}>
                    Resume
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => setShowResumeConfirm(false)}
                  >
                    Stay paused
                  </button>
                </div>
              </div>
            </div>
          )}
          {showMenuConfirm && (
            <div className={modalOverlay}>
              <div
                ref={menuDialogRef}
                className={modalCard}
                role="dialog"
                aria-modal="true"
                aria-labelledby="menu-confirm-title"
              >
                <h2 id="menu-confirm-title" className={modalTitle}>
                  Leave this game?
                </h2>
                <p className={modalSubtitle}>
                  {leaveConfirmUrl
                    ? "Are you sure you want to leave this game? Your progress in this game will be lost."
                    : isDiscoverGame
                      ? "Jump into a Find it · Level 1 quiz, keep exploring, or return to the menu."
                      : "Are you sure you want to go back to menu? Your progress in this game will be lost."}
                </p>
                <div className={modalActions}>
                  {isDiscoverGame && !leaveConfirmUrl && (
                    <button
                      type="button"
                      className={primaryBtn}
                      onClick={handleDiscoverStartTest}
                    >
                      Ready to test yourself?
                    </button>
                  )}
                  <button
                    type="button"
                    className={
                      isDiscoverGame && !leaveConfirmUrl ? secondaryBtn : primaryBtn
                    }
                    onClick={handleConfirmLeave}
                  >
                    {leaveConfirmUrl ? "Yes, go back" : "Yes, go to menu"}
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={dismissMenuConfirm}
                  >
                    Keep playing
                  </button>
                </div>
              </div>
            </div>
          )}
          {discoverCompleteModalOpen && (
            <DiscoverCompleteModal
              open={discoverCompleteModalOpen}
              countryCount={activeCountries.length}
              regionLabel={regionLabel}
              modeLabel={modeLabel}
              testLevelLabel={getLevelLabel(GAME_LEVELS.FIND_FILL)}
              onKeepDiscovering={handleKeepDiscovering}
              onStartTest={handleDiscoverStartTest}
            />
          )}
        </>
      )}
    </div>
  );
}
