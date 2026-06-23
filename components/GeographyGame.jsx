"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import MapCountryInfoPanels from "@/components/MapCountryInfoPanels";
import FlagPrompt from "@/components/FlagPrompt";
import GameCompleteModal from "@/components/GameCompleteModal";
import IdlePromptModal from "@/components/IdlePromptModal";
import MapFeedback from "@/components/MapFeedback";
import MapboxMap from "@/components/MapboxMap";
import PacificMap from "@/components/PacificMap";
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
import { GAME_TYPES } from "@/lib/gameTypes";
import { GAME_TYPE_FOR_STATS } from "@/lib/mastery";
import { buildLearningQueue } from "@/lib/learning";
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
  gameHeaderRight,
  gameHeaderStats,
  gameMeta,
  gameMetaTag,
  gameProgress,
  gameProgressFill,
  gameShell,
  gameTimer,
  mapPauseOverlay,
  mapStage,
  modalActions,
  modalCard,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
  promptFeedback,
  scoreboard,
  scoreCorrect,
  scoreIncorrect,
  secondaryBtn,
  spellingSuggestion,
  spellingSuggestionLink,
  startScreen,
  startSubtitle,
} from "@/lib/ui";
import { useSyncRef } from "@/lib/hooks/useSyncRef";
import { useGameTimer } from "@/lib/hooks/useGameTimer";
import { useRoundScoring } from "@/lib/hooks/useRoundScoring";
import { useCountryQueue } from "@/lib/hooks/useCountryQueue";
import { useIdleDetection } from "@/lib/hooks/useIdleDetection";
import { useGameBoard } from "@/lib/hooks/useGameBoard";
import { useSession } from "next-auth/react";

// Number of countries in a "Go" quick-review session.
const GO_SESSION_SIZE = 10;

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
  const [allCountries, setAllCountries] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [session, setSession] = useState(null);
  const [gameActive, setGameActive] = useState(false);
  const [gameComplete, setGameComplete] = useState(false);
  const [answerInput, setAnswerInput] = useState("");
  const [spellingSuggestion, setSpellingSuggestion] = useState(null);
  const [showMenuConfirm, setShowMenuConfirm] = useState(false);
  const [flagsClickHeader, setFlagsClickHeader] = useState(null);
  const [referencePanelOpen, setReferencePanelOpen] = useState(false);
  const [hintsPanelOpen, setHintsPanelOpen] = useState(false);

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
  const [gamePaused, setGamePaused] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  // Snapshot of mastery before/after the just-finished game, used to detect
  // milestones in the complete modal. `undefined` until the game finishes.
  const [milestoneStats, setMilestoneStats] = useState(undefined);

  // Game stopwatch (runs only while a game is active and not finished).
  const timer = useGameTimer(Boolean(session) && gameActive && !gameComplete);
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
    active: Boolean(session) && gameActive && !gameComplete,
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
      .catch(() => setLoadError("Failed to load country data."));
  }, []);

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
  const isTestGame = session?.gameType !== GAME_TYPES.LEARNING;
  const isLearningGame = session?.gameType === GAME_TYPES.LEARNING;

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
  const isNameGame = session?.level ? isNameLevel(session.level) : false;
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
    Promise.allSettled(pending).then(buildMilestoneStats);
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
    setAnswerInput("");
    setSpellingSuggestion(null);
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
    }) => {
      const pool = countries ?? filterCountriesByRegion(allCountries, region);
      const preCredited = preCreditedCountryIds ?? [];
      const totalRounds = pool.length + preCredited.length;
      if (totalRounds === 0) return;

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
      setAnswerInput("");
      setSpellingSuggestion(null);
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

  const beginSession = useCallback(
    (config) => {
      startGame(config);
    },
    [startGame]
  );

  // "Go": a quick 10-country review of your weakest countries worldwide
  // (Countries · Find it · Level 1). Falls back to random countries when there
  // is no weak data or the player is signed out.
  const startGoSession = useCallback(async () => {
    const worldPool = filterCountriesByRegion(allCountries, "world");
    if (worldPool.length === 0) return;

    let chosen = [];
    if (signedIn) {
      try {
        const data = await fetchWeakCountryStats({
          mode: GAME_MODES.COUNTRIES,
          level: GAME_LEVELS.FIND_FILL,
          region: "world",
        });
        if ((data.weakCount ?? 0) > 0) {
          const ids = buildLearningQueue(data.stats, Math.min(GO_SESSION_SIZE, data.weakCount));
          chosen = ids
            .map((id) => worldPool.find((country) => country.id === id))
            .filter(Boolean);
        }
      } catch (error) {
        console.error("Go: failed to load weak countries", error);
      }
    }

    if (chosen.length < GO_SESSION_SIZE) {
      const have = new Set(chosen.map((country) => country.id));
      const fillers = shuffleCountries(
        worldPool.filter((country) => !have.has(country.id))
      ).slice(0, GO_SESSION_SIZE - chosen.length);
      chosen = [...chosen, ...fillers];
    }

    chosen = chosen.slice(0, GO_SESSION_SIZE);
    if (chosen.length === 0) return;

    startGame({
      gameType: GAME_TYPES.LEARNING,
      mode: GAME_MODES.COUNTRIES,
      region: "world",
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
        };
      } catch (error) {
        console.error("Failed to load mastery for World Test:", error);
        return { countries: worldPool, preCreditedCountryIds: [] };
      }
    },
    [allCountries]
  );

  const handleSessionStart = useCallback(
    async (config) => {
      if (config.go) {
        await startGoSession();
        return;
      }

      if (config.gameType === GAME_TYPES.LEARNING) {
        const learning = await buildLearningCountries(config);
        if (!learning) return;

        startGame({
          gameType: GAME_TYPES.LEARNING,
          mode: config.mode,
          region: config.region,
          level: config.level,
          countries: learning.countries,
          learningCountryIds: learning.queueIds,
          learningSessionSize: config.learningSessionSize,
        });
        return;
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
        });
        return;
      }

      beginSession(config);
    },
    [beginSession, buildLearningCountries, buildWorldTestCountries, signedIn, startGame, startGoSession]
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
    resetQueue();
    resetScoring();
    beginRoundScoring();
    resetBoard();
    wrongAttemptsRef.current = 0;
    setAnswerInput("");
    setSpellingSuggestion(null);
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
      startGoSession();
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
    ]
  );

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

    if (isCorrectTextAnswer(answerInput, target, session.mode)) {
      setSpellingSuggestion(null);
      handleCorrectRound(target);
      return;
    }

    const suggestion = getSpellingSuggestion(answerInput, target, session.mode);
    setAnswerInput("");
    setSpellingSuggestion(suggestion);

    wrongAttemptsRef.current += 1;
    const attempts = wrongAttemptsRef.current;

    if (attempts === 1) {
      markRoundIncorrect(target);
    }

    if (attempts >= MAX_ATTEMPTS) {
      setSpellingSuggestion(null);
      handleRevealRound(target);
    } else {
      setFeedback({ text: "Try again.", type: "wrong" });
    }
  }, [
    answerInput,
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
    if (!spellingSuggestion) return;
    setAnswerInput(spellingSuggestion);
    setSpellingSuggestion(null);
    requestAnimationFrame(() => answerInputRef.current?.focus());
  };

  const handleAnswerInputChange = (event) => {
    setAnswerInput(event.target.value);
    setSpellingSuggestion(null);
  };

  const ready = allCountries.length > 0 && hasToken && !loadError;

  const promptText = !hasToken
    ? "Add NEXT_PUBLIC_MAPBOX_TOKEN to a .env file (see .env.example)"
    : loadError
      ? loadError
      : session?.mode === GAME_MODES.CAPITALS
        ? targetCountry?.capital
        : session?.mode === GAME_MODES.FLAGS
          ? null
          : targetCountry?.name;

  const showFlagPrompt =
    isFlagsMode && targetCountry?.iso2 && !gameComplete && (isNameGame || isFindLevel(session?.level ?? 0));

  const mapInteractionEnabled =
    gameActive && !gamePaused && session?.level != null && isFindLevel(session.level);

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
            disabled={!ready}
            countries={allCountries}
          />
        )
      ) : (
        <>
          <header className={gameHeader}>
            <div className={gameHeaderLeft}>
              <div className={gameMeta}>
                <span className={gameMetaTag}>{modeLabel}</span>
                <span className={gameMetaTag}>{regionLabel}</span>
                <span className={gameMetaTag}>{levelLabel}</span>
                {session.review && (
                  <span className={cn(gameMetaTag, "max-sm:hidden")}>Review</span>
                )}
                {isLearningGame && (
                  <span className={cn(gameMetaTag, "max-sm:hidden")}>Learning</span>
                )}
              </div>
            </div>

            {!gameComplete && (
              <div
                className={promptFeedback({
                  wrong:
                    feedback.type === "wrong" ||
                    feedback.type === "reveal" ||
                    feedback.type === "got-it",
                  className: gameHeaderCenter,
                })}
              >
                {isNameGame ? (
                  <div className={answerPrompt}>
                    <input
                      ref={answerInputRef}
                      type="text"
                      className={answerInput}
                      value={answerInput}
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
                    {spellingSuggestion && (
                      <p className={spellingSuggestion}>
                        Did you mean{" "}
                        <button
                          type="button"
                          className={spellingSuggestionLink}
                          onClick={handleSpellingSuggestionClick}
                        >
                          {spellingSuggestion}
                        </button>
                        ?
                      </p>
                    )}
                  </div>
                ) : isFindFlagsGame ? (
                  flagsClickHeader ? (
                    <span
                      className={
                        flagsClickHeader.tone === "correct"
                          ? "prompt-correct"
                          : "prompt-wrong"
                      }
                    >
                      {flagsClickHeader.name}
                    </span>
                  ) : null
                ) : isFlagsMode ? null : (
                  promptText
                )}
              </div>
            )}

            <div className={gameHeaderRight}>
              {!gameComplete && (
                <div className={gameHeaderActions}>
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
                  <div className={gameControls}>
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
              <div className={gameHeaderStats}>
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
            </div>
          </header>
          {(isOceaniaRegion || hasToken) && !gameComplete && (
            <div className={mapStage}>
              {isOceaniaRegion ? (
                <PacificMap
                  activeCountries={activeCountries}
                  inactiveCountries={inactiveCountries}
                  countryColorMap={countryColorMap}
                  gameActive={mapInteractionEnabled}
                  level={session.level}
                  wrongCountryIds={mapWrongCountryIds}
                  flashWrongCountryIds={flashWrongCountryIds}
                  showColorCountryIds={showColorCountryIds}
                  filledCountryIds={filledCountryIds}
                  highlightTargetCountryId={highlightTargetCountryId}
                  highlightCountryId={highlightCountryId}
                  flashSmallCountryId={flashSmallCountryId}
                  onCountryClick={handleCountryClick}
                />
              ) : (
                <MapboxMap
                  geojson={activeGeojson}
                  inactiveGeojson={inactiveGeojson}
                  smallCountriesGeojson={activeSmallCountriesGeojson}
                  gameActive={mapInteractionEnabled}
                  level={session.level}
                  wrongCountryIds={mapWrongCountryIds}
                  flashWrongCountryIds={flashWrongCountryIds}
                  showColorCountryIds={showColorCountryIds}
                  filledCountryIds={filledCountryIds}
                  highlightTargetCountryId={highlightTargetCountryId}
                  highlightCountryId={highlightCountryId}
                  flashSmallCountryId={flashSmallCountryId}
                  mapView={mapView}
                  onCountryClick={handleCountryClick}
                />
              )}
              {gamePaused && !gameComplete && (
                <button
                  type="button"
                  className={mapPauseOverlay}
                  onClick={handlePausedMapInteraction}
                  aria-label="Game paused. Click to resume."
                />
              )}
              {showFlagPrompt && (
                <div className={flagCard} aria-hidden="true">
                  <FlagPrompt iso2={targetCountry.iso2} size="card" />
                </div>
              )}
              {targetCountry && (
                <MapCountryInfoPanels
                  country={targetCountry}
                  allCountries={allCountries}
                  mode={session.mode}
                  level={session.level}
                  revealMode={revealMode}
                  referenceOpen={referencePanelOpen}
                  hintsOpen={hintsPanelOpen}
                  onReferenceToggle={toggleReferencePanel}
                  onHintsToggle={toggleHintsPanel}
                  onCloseAll={closeInfoPanels}
                  onOpenReference={openReferencePanel}
                  onOpenHints={openHintsPanel}
                />
              )}
              <MapFeedback text={feedback.text} type={feedback.type} />
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
          {showResumeConfirm && (
            <div className={modalOverlay}>
              <div
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
                className={modalCard}
                role="dialog"
                aria-modal="true"
                aria-labelledby="menu-confirm-title"
              >
                <h2 id="menu-confirm-title" className={modalTitle}>
                  Leave this game?
                </h2>
                <p className={modalSubtitle}>
                  Are you sure you want to go back to menu? Your progress in this
                  game will be lost.
                </p>
                <div className={modalActions}>
                  <button
                    type="button"
                    className={primaryBtn}
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
        </>
      )}
    </div>
  );
}
