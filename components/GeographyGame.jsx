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
import { matchDiscoverTerritoryNote } from "@/lib/discoverTerritories";
import MapFeedback from "@/components/MapFeedback";
import MapboxMap from "@/components/MapboxMap";
import PacificMap from "@/components/PacificMap";
import PronunciationButton from "@/components/PronunciationButton";
import SoundVolumeButton from "@/components/SoundVolumeButton";
import StartScreen from "@/components/StartScreen";
import { CORRECT_ROUND_DELAY_MS, MAX_ATTEMPTS, REVEAL_ROUND_DELAY_MS } from "@/lib/constants";
import {
  fetchMasteryStats,
  fetchWeakCountryStats,
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
import { getMapViewForRegion, buildSmallCountriesGeoJSON } from "@/lib/geometry";
import { GAME_TYPES, getGameTypeLabel } from "@/lib/gameTypes";
import { GAME_TYPE_FOR_STATS } from "@/lib/mastery";
import {
  appendGuestRound,
  clearPendingGuestGame,
  getPendingGuestGame,
  setPendingGuestScore,
  syncPendingGuestGame,
} from "@/lib/pendingGuestGame";
import { buildLearningQueue } from "@/lib/learning";
import { buildLearnSession } from "@/lib/learn/sessionSequencer";
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
  gameHeaderLeft,
  gameHeaderMobileFeedback,
  gameHeaderRight,
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
  mapStage,
  modalActions,
  modalCard,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
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
  const learnOverlayCardRef = useRef(null);
  const [learnOverlayCardHeight, setLearnOverlayCardHeight] = useState(0);

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
    addFilledCountry,
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
  // layout so the map stays visible; everything else is a centered card.
  const learnUsesMap = Boolean(currentLearnQuestion?.mapConfig);
  // Questions that reveal (highlight) their anchor country pin a card to the top
  // of the map. That card can sit on top of a country near the top of the region
  // (hiding the very thing being asked about), so we frame the region BELOW the
  // card by reserving its height as extra top padding on the map view.
  const learnHighlightRevealsAnchor =
    learnEngineActive && currentLearnQuestion?.mapConfig?.display === "highlight";
  const mapViewForRender = useMemo(() => {
    if (!mapView) return mapView;
    if (!learnHighlightRevealsAnchor || learnOverlayCardHeight <= 0) return mapView;
    const basePadding =
      typeof mapView.padding === "number" ? mapView.padding : 48;
    return {
      ...mapView,
      // Clear the top card (+ its gap) so the highlighted country never hides
      // behind it, while keeping the region framed like the opening view.
      padding: {
        top: learnOverlayCardHeight + basePadding,
        bottom: basePadding,
        left: basePadding,
        right: basePadding,
      },
    };
  }, [mapView, learnHighlightRevealsAnchor, learnOverlayCardHeight]);

  // Track the top question card's height so the map view above can reserve room
  // for it. Only relevant while a highlight question is showing its card.
  useEffect(() => {
    if (!learnHighlightRevealsAnchor) {
      setLearnOverlayCardHeight(0);
      return undefined;
    }
    const card = learnOverlayCardRef.current;
    if (!card || typeof ResizeObserver === "undefined") return undefined;
    const measure = () =>
      setLearnOverlayCardHeight(Math.round(card.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [learnHighlightRevealsAnchor, currentLearnQuestion?.id]);
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

  // Fetch weak countries, sample a queue, and build the ordered mixed-question
  // session. Returns null when there's nothing eligible to practice.
  const buildLearnEngineData = useCallback(
    async ({ mode, level, region, learningSessionSize }) => {
      const data = await fetchWeakCountryStats({ mode, level, region });
      if ((data.weakCount ?? 0) === 0) return null;

      const statsById = new Map((data.stats ?? []).map((stat) => [stat.countryId, stat]));
      const queueIds = buildLearningQueue(
        data.stats,
        learningSessionSize ?? data.weakCount
      );
      const regionPool = filterCountriesByRegion(allCountries, region);
      const regionById = new Map(regionPool.map((country) => [country.id, country]));
      const countries = queueIds.map((id) => regionById.get(id)).filter(Boolean);
      if (countries.length === 0) return null;

      const sampled = countries.map((country) => ({
        countryId: country.id,
        mastery: statsById.get(country.id)?.masteryScore ?? 0,
      }));

      const { questions, sessionMeta } = buildLearnSession({
        countries: sampled,
        category: mode,
        allCountries,
        masteryStats: statsById,
        sessionSize: learningSessionSize,
      });
      if (!Array.isArray(questions) || questions.length === 0) return null;

      return {
        countries,
        queueIds,
        questions,
        sessionMeta,
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

  // Pick a post-answer fact, mark it seen, then advance (via the mobile fact sheet
  // when present, otherwise a brief pause so the answer feedback is seen).
  // Advances to the next question after a brief pause so the answer feedback is
  // seen. (Between-question facts intentionally removed — facts stay in the Learn
  // More panel and the end-of-session recap.)
  const advanceLearnAfterAnswer = useCallback(() => {
    const idx = learnIndexRef.current;
    const questions = learnQuestionsRef.current ?? [];
    const isLast = idx >= questions.length - 1;

    learnAdvanceTimerRef.current = setTimeout(() => {
      learnLockRef.current = false;
      if (isLast) {
        finishLearnGame();
        return;
      }
      const nextIndex = idx + 1;
      learnIndexRef.current = nextIndex;
      setLearnIndex(nextIndex);
    }, 650);
  }, [finishLearnGame]);

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

      if (signedInRef.current) {
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

      advanceLearnAfterAnswer();
    },
    [
      advanceLearnAfterAnswer,
      allCountriesById,
      beginRoundScoring,
      markRoundCorrect,
      markRoundIncorrect,
      sessionRef,
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
        setFeedback({ text: "Correct!", type: "correct" });
      } else {
        triggerWrongFlash(clicked.id);
        setFeedback({ text: "Not quite.", type: "wrong" });
      }

      emit({
        correct,
        responseTimeMs: Date.now() - learnQuestionStartRef.current,
        revealUsed: false,
        timedOut: false,
        selectedValue: clicked.id,
      });
    },
    [
      activeCountries,
      addFilledCountry,
      gameActiveRef,
      gamePausedRef,
      setFeedback,
      triggerWrongFlash,
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
  // country, apply the anchor highlight (except the blank "find it" click, which
  // must not reveal its target), and reset per-question timing.
  useEffect(() => {
    if (!learnEngineActive || !currentLearnQuestion) return;
    const question = currentLearnQuestion;

    beginRoundScoring();
    learnLockRef.current = false;
    learnQuestionStartRef.current = Date.now();
    setFeedback({ text: "", type: "" });
    setShowColorCountryIds([]);
    setFlashSmallCountryId(null);
    setRevealMode(false);

    setTarget(allCountriesById.get(question.countryId) ?? null);

    // Any question whose map config asks for a "highlight" display wants its
    // anchor country shown (free recall, neighbor prompts, and the binary map
    // recognition question — where the highlight IS the question). Only the
    // "find it" blank-map click hides its target (display: "blank"), so it is
    // already excluded here.
    const revealsAnchor = question.mapConfig?.display === "highlight";
    setHighlightCountryId(revealsAnchor ? question.countryId : null);
  }, [
    learnEngineActive,
    currentLearnQuestion,
    allCountriesById,
    beginRoundScoring,
    setFeedback,
    setFlashSmallCountryId,
    setHighlightCountryId,
    setRevealMode,
    setShowColorCountryIds,
    setTarget,
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
            level: config.level,
            learningSessionSize: config.learningSessionSize,
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

      setFeedback({ text: "Correct!", type: "correct" });
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

      const revealMessage = isNameGame
        ? `The answer was ${session?.mode === GAME_MODES.CAPITALS ? target.capital : target.name}. Press Enter to continue.`
        : "Oops! Please click the flashing red country.";

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

        setFeedback({
          text: revealMessage,
          type: isNameGame ? "got-it" : "reveal",
        });
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
    feedback.type === "got-it" ||
    feedback.type === "reveal"
      ? targetCountry?.name ?? ""
      : "Flag — identify this country";

  const mapInteractionEnabled =
    gameActive &&
    (!gamePaused || tutorialStepId === "map") &&
    (learnEngineActive
      ? isLearnMapClickQuestion
      : isDiscoverGame || (session?.level != null && isFindLevel(session.level)));

  // Learn: any question that uses the map (mapConfig) may pan/zoom so the player
  // can find the highlighted country. Non-map questions keep navigation locked
  // (and get the blurred center overlay) so the map can't be used as a hint.
  const mapNavigationEnabled =
    !learnEngineActive || learnUsesMap || isDiscoverGame;

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
    feedback.type === "got-it";

  const mobileRoundFeedback =
    feedback.type === "correct" || feedback.type === "got-it"
      ? { label: "Correct", tone: "success" }
      : feedback.type === "wrong"
        ? { label: "Try again", tone: "error" }
        : feedback.type === "reveal"
          ? { label: "Incorrect", tone: "error" }
          : null;

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

  const renderGamePrompt = (className, { showFlagInPrompt = false, compactInput = false } = {}) => (
    <div className={promptFeedback({ wrong: promptWrong, className })}>
      {isDiscoverGame ? (
        getDiscoverInstructionText(session?.mode)
      ) : isNameGame ? (
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

  const showMobilePrompt =
    !gameComplete &&
    !learnEngineActive &&
    (isDiscoverGame ||
      isNameGame ||
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
          <header className={gameHeader}>
            <div className={gameHeaderLeft}>
              <div className={gameMeta}>
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
              <div ref={assignGamePromptAnchorRef} className={gameHeaderCenter}>
                {renderGamePrompt()}
              </div>
            )}

            <div
              className={cn(
                gameHeaderRight,
                mobileRoundFeedback ? "max-md:justify-normal" : "max-md:justify-between",
              )}
            >
              {!gameComplete && (
                <div className={gameHeaderActions}>
                  {!isDiscoverGame && (
                    <>
                      <span className={gameTimer}>{formatElapsedTime(elapsedMs)}</span>
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
                    <GameTutorialButton onClick={() => openGameTutorial({ manual: true })} />
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
              {!gameComplete && mobileRoundFeedback && (
                <div
                  className={gameHeaderMobileFeedback({ tone: mobileRoundFeedback.tone })}
                  role="status"
                  aria-live="polite"
                >
                  {mobileRoundFeedback.label}
                </div>
              )}
              {!isDiscoverGame && (
                <div className={gameHeaderStats} ref={gameHeaderStatsRef}>
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
              {showMobilePrompt && (
                <div ref={assignMobilePromptRef} className={gamePromptMobileFloat}>
                  {renderGamePrompt(gamePromptMobileCard, {
                    showFlagInPrompt: true,
                    compactInput: true,
                  })}
                </div>
              )}
              {isOceaniaRegion ? (
                <PacificMap
                  activeCountries={activeCountries}
                  inactiveCountries={inactiveCountries}
                  countryColorMap={countryColorMap}
                  gameActive={mapInteractionEnabled}
                  level={mapLevel}
                  wrongCountryIds={mapWrongCountryIds}
                  flashWrongCountryIds={flashWrongCountryIds}
                  showColorCountryIds={showColorCountryIds}
                  filledCountryIds={filledCountryIds}
                  highlightTargetCountryId={highlightTargetCountryId}
                  highlightCountryId={isDiscoverGame ? null : highlightCountryId}
                  flashSmallCountryId={flashSmallCountryId}
                  onCountryClick={mapCountryClickHandler}
                  onCountryHover={isDiscoverGame ? handleDiscoverCountryHover : undefined}
                  onRegisterMapProject={isDiscoverGame ? registerMapProject : undefined}
                  onMapViewChange={isDiscoverGame ? handleMapViewChange : undefined}
                  onMapMove={isDiscoverGame ? handleMapMove : undefined}
                  mapControlsRef={pacificControlsRef}
                  forceShowSmallCountryCircles={tutorialOpen}
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
                  showColorCountryIds={showColorCountryIds}
                  filledCountryIds={filledCountryIds}
                  highlightTargetCountryId={highlightTargetCountryId}
                  highlightCountryId={isDiscoverGame ? null : highlightCountryId}
                  flashSmallCountryId={flashSmallCountryId}
                  mapView={mapViewForRender}
                  forceShowSmallCountryCircles={tutorialOpen}
                  allowInactiveCountryClicks={isDiscoverGame}
                  onCountryClick={mapCountryClickHandler}
                  onCountryHover={isDiscoverGame ? handleDiscoverCountryHover : undefined}
                  onRegisterMapProject={isDiscoverGame ? registerMapProject : undefined}
                  onMapViewChange={isDiscoverGame ? handleMapViewChange : undefined}
                  onMapMove={isDiscoverGame ? handleMapMove : undefined}
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
              {learnEngineActive && currentLearnQuestion && !gameComplete && (
                <LearnRoundOverlay
                  question={currentLearnQuestion}
                  variant={learnUsesMap ? "top" : "center"}
                  cardRef={learnOverlayCardRef}
                  onAnswer={handleLearnAnswer}
                  resolveCountry={resolveLearnCountry}
                  speedBaselineMs={null}
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
              <div className={mapFeedbackAnchor}>
                <MapFeedback text={feedback.text} type={feedback.type} />
              </div>
              {isDiscoverGame && (
                <DiscoverMapLabels
                  mapContainerRef={mapContainerRef}
                  headerAnchorRef={discoverHeaderAnchorRef}
                  mobileAnchorRef={discoverMobileAnchorRef}
                  labelsById={discoverLabelsById}
                  animatingLabel={discoverAnimatingLabel}
                  countriesById={activeCountriesById}
                  projectCountry={projectCountry}
                  projectDiscoverAnchor={projectDiscoverAnchor}
                  projectCountryBounds={projectCountryBounds}
                  getDiscoverLabelScale={getDiscoverLabelScale}
                  mapViewRevision={mapViewRevision}
                  mapMoveHandlerRef={discoverMapMoveHandlerRef}
                  hoveredCountryId={discoverHoveredCountryId}
                  learnMorePanelRef={learnMorePanelRef}
                  learnMorePanelActive={Boolean(showLearnMorePanel)}
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
