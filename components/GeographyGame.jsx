"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import MapCountryInfoPanels from "@/components/MapCountryInfoPanels";
import FlagPrompt from "@/components/FlagPrompt";
import GameTutorial from "@/components/GameTutorial";
import GameTutorialButton from "@/components/GameTutorialButton";
import DiscoverCompleteModal from "@/components/DiscoverCompleteModal";
import DiscoverMapLabels from "@/components/DiscoverMapLabels";
import GameCompleteModal from "@/components/GameCompleteModal";
import IdlePromptModal from "@/components/IdlePromptModal";
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
import { buildLearningQueue } from "@/lib/learning";
import { getGameTourId } from "@/lib/gameTutorial";
import { getGameTutorialSteps } from "@/lib/gameTutorialSteps";
import { useMobileViewport } from "@/lib/hooks/useMobileViewport";
import {
  hasCompletedGameTour,
  markGameTourCompleted,
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
import { buildPlayingUrl, isPlayingSearchParams } from "@/lib/startNavigation";
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
  const [loadError, setLoadError] = useState(null);
  const [session, setSession] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [spellingSuggestionText, setSpellingSuggestionText] = useState(null);
  const [showMenuConfirm, setShowMenuConfirm] = useState(false);
  const [flagsClickHeader, setFlagsClickHeader] = useState(null);
  const [referencePanelOpen, setReferencePanelOpen] = useState(false);
  const [hintsPanelOpen, setHintsPanelOpen] = useState(false);
  const [discoverLabelsById, setDiscoverLabelsById] = useState({});
  const [discoverAnimatingLabel, setDiscoverAnimatingLabel] = useState(null);
  const [mapViewRevision, setMapViewRevision] = useState(0);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialManualOpen, setTutorialManualOpen] = useState(false);
  const [tutorialStepId, setTutorialStepId] = useState(null);
  const [masteryLoadWarning, setMasteryLoadWarning] = useState(false);

  const mapContainerRef = useRef(null);
  const gamePromptAnchorRef = useRef(null);
  const mobilePromptRef = useRef(null);
  const gameControlsRef = useRef(null);
  const gameHeaderStatsRef = useRef(null);
  const pacificControlsRef = useRef(null);
  const tutorialAutoShownRef = useRef(null);
  const discoverHeaderAnchorRef = useRef(null);
  const discoverMobileAnchorRef = useRef(null);
  const mapProjectRef = useRef(null);

  const closeInfoPanels = useCallback(() => {
    setReferencePanelOpen(false);
    setHintsPanelOpen(false);
  }, []);

  const openReferencePanel = useCallback(() => {
    setHintsPanelOpen(false);
    setReferencePanelOpen(true);
  }, []);

  const openHintsPanel = useCallback(() => {
    setReferencePanelOpen(false);
    setHintsPanelOpen(true);
  }, []);

  const toggleReferencePanel = useCallback(() => {
    setReferencePanelOpen((open) => {
      if (open) return false;
      setHintsPanelOpen(false);
      return true;
    });
  }, []);

  const toggleHintsPanel = useCallback(() => {
    setHintsPanelOpen((open) => {
      if (open) return false;
      setReferencePanelOpen(false);
      return true;
    });
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
      .then(({ countries }) => setAllCountries(countries))
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
    };
  }, []);

  const activeCountries = useMemo(() => {
    if (!session) return [];
    return filterCountriesByRegion(allCountries, session.region);
  }, [allCountries, session]);

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

  const inactiveGeojson = useMemo(
    () => buildInactiveGeojson(allCountries, session?.region),
    [allCountries, session?.region]
  );

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
  const isFindGame = Boolean(
    session?.level && isFindLevel(session.level) && !isDiscoverGame
  );
  const isNameGame = session?.level ? isNameLevel(session.level) : false;
  const tourId = useMemo(() => getGameTourId(session), [session]);
  const pronunciationAllowed =
    !tutorialOpen && (!tourId || hasCompletedGameTour(tourId));
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

  const openGameTutorial = useCallback(
    ({ manual = false } = {}) => {
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
      setGamePaused(false);
      resumeGameTimer();
      if (tourId && (completed || (!wasManual && skipped))) {
        markGameTourCompleted(tourId);
      }
    },
    [resumeGameTimer, tourId, tutorialManualOpen]
  );

  useEffect(() => {
    if (!session) {
      tutorialAutoShownRef.current = null;
    }
  }, [session]);

  useEffect(() => {
    if (!session || !gameActive || gameComplete || tutorialOpen) return;
    if (!tourId || hasCompletedGameTour(tourId)) return;
    if (tutorialAutoShownRef.current === tourId) return;

    tutorialAutoShownRef.current = tourId;
    openGameTutorial({ manual: false });
  }, [session, gameActive, gameComplete, tourId, tutorialOpen, openGameTutorial]);

  const findRoundPronouncedTargetRef = useRef(null);

  useEffect(() => {
    if (!gameActive || gameComplete || isDiscoverGame || !targetCountry?.id) {
      return;
    }
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
    if (!gameActive || gameComplete || !targetCountry) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (hintsPanelOpen) {
          setHintsPanelOpen(false);
          return;
        }
        if (referencePanelOpen) {
          setReferencePanelOpen(false);
        }
        return;
      }

      const isReferenceShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "i" || event.key === "I");

      if (isReferenceShortcut) {
        event.preventDefault();
        toggleReferencePanel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    gameActive,
    gameComplete,
    hintsPanelOpen,
    referencePanelOpen,
    targetCountry,
    toggleReferencePanel,
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
      if (!signedIn || !target || !session) return;

      const responseTimeMs =
        outcome === ROUND_OUTCOMES.NEEDED_REVEAL || roundStartTimeRef.current == null
          ? undefined
          : Date.now() - roundStartTimeRef.current;

      const promise = recordCountryStat({
        countryId: target.id,
        mode: session.mode,
        level: session.level,
        outcome,
        responseTimeMs,
        gameType: session.review
          ? GAME_TYPE_FOR_STATS.REVIEW
          : (session.gameType ?? GAME_TYPES.TEST),
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
    [session, signedIn, targetCountryRef]
  );

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

      const first = advanceQueue();
      wrongAttemptsRef.current = 0;
      revealStatRecordedRef.current = false;
      roundStartTimeRef.current = Date.now();
      setAnswerText("");
      setSpellingSuggestionText(null);
      setReferencePanelOpen(getReferencePanelDefaultOpen());
      setHintsPanelOpen(false);
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
      setTarget(null);
      setHighlightCountryId(null);
      setFlashSmallCountryId(null);
      setFlagsClickHeader(null);
      setReferencePanelOpen(false);
      setHintsPanelOpen(false);
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

  const buildLearningCountries = useCallback(
    async ({ mode, level, region, learningSessionSize }) => {
      const data = await fetchWeakCountryStats({ mode, level, region });
      if ((data.weakCount ?? 0) === 0) return null;

      const queueIds = buildLearningQueue(
        data.stats,
        learningSessionSize ?? data.weakCount
      );
      const regionPool = filterCountriesByRegion(allCountries, region);
      const countries = queueIds
        .map((id) => regionPool.find((country) => country.id === id))
        .filter(Boolean);

      if (countries.length === 0) return null;
      return { countries, queueIds };
    },
    [allCountries]
  );

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
          const learning = await buildLearningCountries(config);
          if (!learning) {
            return { ok: false, reason: "no-eligible" };
          }

          startGame({
            gameType: GAME_TYPES.LEARNING,
            mode: config.mode,
            region: config.region,
            level: config.level,
            countries: learning.countries,
            learningCountryIds: learning.queueIds,
            learningSessionSize: config.learningSessionSize,
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
    [buildLearningCountries, buildWorldTestCountries, signedIn, startDiscoverGame, startGame, startGoSession]
  );

  const handleBackToMenu = () => {
    resetIdleState();
    setShowMenuConfirm(false);
    setShowResumeConfirm(false);
    setGamePaused(false);
    if (nextRoundTimeoutRef.current) {
      clearTimeout(nextRoundTimeoutRef.current);
    }
    clearColorFlash();
    clearWrongFlash();
    resetGameTimer();
    setSession(null);
    setGameActive(false);
    setGameComplete(false);
    setMilestoneStats(undefined);
    setMasteryLoadWarning(false);
    resetQueue();
    resetScoring();
    beginRoundScoring();
    resetBoard();
    wrongAttemptsRef.current = 0;
    setAnswerText("");
    setSpellingSuggestionText(null);
    suppressPlayCheckRef.current = true;
    gameInHistoryRef.current = false;
    router.replace("/");
  };

  const handleMenuClick = () => {
    if (!gameComplete) {
      setShowMenuConfirm(true);
      return;
    }
    handleBackToMenu();
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
    if (!session || !isLearningGame) return;

    const learning = await buildLearningCountries({
      mode: session.mode,
      level: session.level,
      region: session.region,
      learningSessionSize: session.learningSessionSize,
    });
    if (!learning) return;

    startGame({
      gameType: GAME_TYPES.LEARNING,
      mode: session.mode,
      region: session.region,
      level: session.level,
      countries: learning.countries,
      learningCountryIds: learning.queueIds,
      learningSessionSize: session.learningSessionSize,
    });
  }, [buildLearningCountries, isLearningGame, session, startGame]);

  const handlePlayAgain = () => {
    if (!session) return;
    if (session.go) {
      startGoSession(session.region ?? "world");
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
    (feature) => {
      if (gamePausedRef.current) {
        if (tutorialStepId === "map") return;
        setShowResumeConfirm(true);
        return;
      }

      if (!gameActiveRef.current) return;

      const clicked = countryFromFeature(feature, activeCountries);
      if (!clicked) return;

      const isNewDiscovery = !filledCountryIdSet.has(clicked.id);

      setTarget(clicked);
      addFilledCountry(clicked.id);
      setHighlightCountryId(null);
      setFlashSmallCountryId(null);
      setFeedback({ text: "", type: "" });

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

  const registerMapProject = useCallback((projectFn) => {
    mapProjectRef.current = projectFn;
    setMapViewRevision((revision) => revision + 1);
  }, []);

  const projectCountry = useCallback((country) => {
    return mapProjectRef.current?.(country) ?? null;
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
  }, [activeCountries, filledCountryIdSet, gameActive, isDiscoverGame]);

  const handleKeepDiscovering = useCallback(() => {
    setDiscoverCompleteModalOpen(false);
  }, []);

  const handleDiscoverStartTest = useCallback(() => {
    if (!session?.mode || !session?.region) return;

    setDiscoverCompleteModalOpen(false);
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
    (isDiscoverGame || (session?.level != null && isFindLevel(session.level)));

  const mapLevel = isDiscoverGame ? GAME_LEVELS.FIND_FILL : session?.level;

  const mapCountryClickHandler = isDiscoverGame
    ? handleDiscoverCountryClick
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
            countries={allCountries}
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
                <span className={gameMetaTag}>{modeLabel}</span>
                <span className={gameMetaTag}>{regionLabel}</span>
                {isDiscoverGame ? (
                  <span className={gameMetaTag}>{getGameTypeLabel(GAME_TYPES.DISCOVER)}</span>
                ) : (
                  levelLabel && <span className={gameMetaTag}>{levelLabel}</span>
                )}
                {session.review && (
                  <span className={cn(gameMetaTag, "max-sm:hidden")}>Review</span>
                )}
                {isLearningGame && (
                  <span className={cn(gameMetaTag, "max-sm:hidden")}>Learning</span>
                )}
              </div>
            </div>

            {!gameComplete && (
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
                  onRegisterMapProject={isDiscoverGame ? registerMapProject : undefined}
                  onMapViewChange={isDiscoverGame ? handleMapViewChange : undefined}
                  mapControlsRef={pacificControlsRef}
                  forceShowSmallCountryCircles={tutorialOpen}
                />
              ) : (
                <MapboxMap
                  geojson={activeGeojson}
                  inactiveGeojson={inactiveGeojson}
                  smallCountriesGeojson={activeSmallCountriesGeojson}
                  gameActive={mapInteractionEnabled}
                  level={mapLevel}
                  wrongCountryIds={mapWrongCountryIds}
                  flashWrongCountryIds={flashWrongCountryIds}
                  showColorCountryIds={showColorCountryIds}
                  filledCountryIds={filledCountryIds}
                  highlightTargetCountryId={highlightTargetCountryId}
                  highlightCountryId={isDiscoverGame ? null : highlightCountryId}
                  flashSmallCountryId={flashSmallCountryId}
                  mapView={mapView}
                  forceShowSmallCountryCircles={tutorialOpen}
                  onCountryClick={mapCountryClickHandler}
                  onRegisterMapProject={isDiscoverGame ? registerMapProject : undefined}
                  onMapViewChange={isDiscoverGame ? handleMapViewChange : undefined}
                />
              )}
              {gamePaused && !gameComplete && !isDiscoverGame && !tutorialOpen && (
                <button
                  type="button"
                  className={mapPauseOverlay}
                  onClick={handlePausedMapInteraction}
                  aria-label="Game paused. Click to resume."
                />
              )}
              {showFlagPrompt && (
                <div className={cn(flagCard, "max-md:hidden")} aria-hidden="true">
                  <FlagPrompt iso2={targetCountry.iso2} size="card" />
                </div>
              )}
              {targetCountry && (
                <MapCountryInfoPanels
                  country={targetCountry}
                  allCountries={allCountries}
                  mode={session.mode}
                  level={session.level}
                  revealMode={isDiscoverGame || revealMode}
                  referenceOpen={referencePanelOpen}
                  hintsOpen={hintsPanelOpen}
                  onReferenceToggle={toggleReferencePanel}
                  onHintsToggle={toggleHintsPanel}
                  onCloseAll={closeInfoPanels}
                  onOpenReference={openReferencePanel}
                  onOpenHints={openHintsPanel}
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
                  mapViewRevision={mapViewRevision}
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
            milestoneStats={milestoneStats}
            canReviewIncorrect={isTestGame && !session.review && wrongCount > 0}
            onReviewIncorrect={handleReviewIncorrect}
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToMenu}
          />
          <IdlePromptModal open={idlePromptOpen} onContinue={handleIdleContinue} />
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
                  {isDiscoverGame
                    ? "Jump into a Find it · Level 1 quiz, keep exploring, or return to the menu."
                    : "Are you sure you want to go back to menu? Your progress in this game will be lost."}
                </p>
                <div className={modalActions}>
                  {isDiscoverGame && (
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
                    className={isDiscoverGame ? secondaryBtn : primaryBtn}
                    onClick={handleBackToMenu}
                  >
                    Yes, go to menu
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => setShowMenuConfirm(false)}
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
