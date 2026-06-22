"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import CountryReferencePanel from "@/components/CountryReferencePanel";
import CountryHintsPanel from "@/components/CountryHintsPanel";
import FlagPrompt from "@/components/FlagPrompt";
import GameCompleteModal from "@/components/GameCompleteModal";
import IdlePromptModal from "@/components/IdlePromptModal";
import MapFeedback from "@/components/MapFeedback";
import MapboxMap from "@/components/MapboxMap";
import PacificMap from "@/components/PacificMap";
import StartScreen from "@/components/StartScreen";
import { CORRECT_ROUND_DELAY_MS, IDLE_PROMPT_MS, IDLE_RETURN_MS, MAX_ATTEMPTS, REVEAL_ROUND_DELAY_MS } from "@/lib/constants";
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
  const [targetCountry, setTargetCountry] = useState(null);
  const [rightCount, setRightCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [revealMode, setRevealMode] = useState(false);
  const [feedback, setFeedback] = useState({ text: "", type: "" });
  const [highlightCountryId, setHighlightCountryId] = useState(null);
  const [flashSmallCountryId, setFlashSmallCountryId] = useState(null);
  const [wrongCountryIds, setWrongCountryIds] = useState([]);
  const [roundWrongCountryIds, setRoundWrongCountryIds] = useState([]);
  const [flashWrongCountryIds, setFlashWrongCountryIds] = useState([]);
  const [filledCountryIds, setFilledCountryIds] = useState([]);
  const [showColorCountryIds, setShowColorCountryIds] = useState([]);
  const [answerInput, setAnswerInput] = useState("");
  const [spellingSuggestion, setSpellingSuggestion] = useState(null);
  const [showMenuConfirm, setShowMenuConfirm] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finalElapsedMs, setFinalElapsedMs] = useState(0);
  const [flagsClickHeader, setFlagsClickHeader] = useState(null);
  const [referencePanelOpen, setReferencePanelOpen] = useState(false);
  const [hintsPanelOpen, setHintsPanelOpen] = useState(false);
  const [idlePromptOpen, setIdlePromptOpen] = useState(false);
  const [gamePaused, setGamePaused] = useState(false);
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);

  const countryQueueRef = useRef([]);
  const queueIndexRef = useRef(0);
  const rightCountRef = useRef(0);
  const wrongCountRef = useRef(0);
  const gameActiveRef = useRef(false);
  const targetCountryRef = useRef(null);
  const revealModeRef = useRef(false);
  const wrongAttemptsRef = useRef(0);
  const roundMarkedIncorrectRef = useRef(false);
  const nextRoundTimeoutRef = useRef(null);
  const colorFlashTimeoutRef = useRef(null);
  const wrongFlashTimeoutRef = useRef(null);
  const answerInputRef = useRef(null);
  const incorrectTargetsRef = useRef([]);
  const gameStartTimeRef = useRef(null);
  const timerPausedMsRef = useRef(0);
  const timerPauseStartedAtRef = useRef(null);
  const idlePromptTimeoutRef = useRef(null);
  const idleReturnTimeoutRef = useRef(null);
  const idlePromptOpenRef = useRef(false);
  const handleBackToMenuRef = useRef(() => {});
  const gameInHistoryRef = useRef(false);
  const suppressPlayCheckRef = useRef(false);
  const roundStartTimeRef = useRef(null);
  const revealStatRecordedRef = useRef(false);
  const gamePausedRef = useRef(false);

  const signedIn = authStatus === "authenticated" && authSession?.user;

  gameActiveRef.current = gameActive;
  gamePausedRef.current = gamePaused;
  targetCountryRef.current = targetCountry;
  revealModeRef.current = revealMode;
  rightCountRef.current = rightCount;
  wrongCountRef.current = wrongCount;
  idlePromptOpenRef.current = idlePromptOpen;

  const getElapsedMs = useCallback(() => {
    if (gameStartTimeRef.current == null) return 0;
    let pausedMs = timerPausedMsRef.current;
    if (timerPauseStartedAtRef.current != null) {
      pausedMs += Date.now() - timerPauseStartedAtRef.current;
    }
    return Math.max(0, Date.now() - gameStartTimeRef.current - pausedMs);
  }, []);

  const clearIdleTimers = useCallback(() => {
    if (idlePromptTimeoutRef.current) {
      clearTimeout(idlePromptTimeoutRef.current);
      idlePromptTimeoutRef.current = null;
    }
    if (idleReturnTimeoutRef.current) {
      clearTimeout(idleReturnTimeoutRef.current);
      idleReturnTimeoutRef.current = null;
    }
  }, []);

  const resetTimerPause = useCallback(() => {
    timerPausedMsRef.current = 0;
    timerPauseStartedAtRef.current = null;
  }, []);

  const pauseGameTimer = useCallback(() => {
    if (timerPauseStartedAtRef.current != null) return;
    timerPauseStartedAtRef.current = Date.now();
  }, []);

  const resumeGameTimer = useCallback(() => {
    if (timerPauseStartedAtRef.current == null) return;
    timerPausedMsRef.current += Date.now() - timerPauseStartedAtRef.current;
    timerPauseStartedAtRef.current = null;
  }, []);

  const resetIdleState = useCallback(() => {
    clearIdleTimers();
    setIdlePromptOpen(false);
    idlePromptOpenRef.current = false;
    resetTimerPause();
  }, [clearIdleTimers, resetTimerPause]);

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

  useEffect(() => {
    if (!session || !gameActive || gameComplete) return;

    const tick = () => {
      setElapsedMs(getElapsedMs());
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [session, gameActive, gameComplete, getElapsedMs]);

  const activeCountries = useMemo(() => {
    if (!session) return [];
    return filterCountriesByRegion(allCountries, session.region);
  }, [allCountries, session]);

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
        setReferencePanelOpen((open) => !open);
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
  ]);

  const preCreditedCount = session?.preCreditedCount ?? 0;
  const displayedCorrect = rightCount + preCreditedCount;
  const totalRounds = session?.totalRounds ?? activeCountries.length;

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

  const finishGame = useCallback(() => {
    const elapsed = getElapsedMs();
    setFinalElapsedMs(elapsed);
    setElapsedMs(elapsed);
    setGameActive(false);
    gameActiveRef.current = false;
    setGameComplete(true);
    setFeedback({ text: "", type: "" });
    setHighlightCountryId(null);
    setFlashSmallCountryId(null);
    setWrongCountryIds([]);
    setRoundWrongCountryIds([]);
    setFlashWrongCountryIds([]);
    setFilledCountryIds([]);
    setShowColorCountryIds([]);
    setRevealMode(false);
    revealModeRef.current = false;
  }, [getElapsedMs]);

  const finishRound = useCallback(() => {
    const total = countryQueueRef.current.length;
    const completed = rightCountRef.current + wrongCountRef.current;
    if (completed >= total) {
      finishGame();
      return true;
    }
    return false;
  }, [finishGame]);

  const markRoundIncorrect = useCallback(() => {
    if (roundMarkedIncorrectRef.current) return;
    roundMarkedIncorrectRef.current = true;
    wrongCountRef.current += 1;
    setWrongCount(wrongCountRef.current);

    const target = targetCountryRef.current;
    if (
      target &&
      !incorrectTargetsRef.current.some((country) => country.id === target.id)
    ) {
      incorrectTargetsRef.current = [...incorrectTargetsRef.current, target];
    }
  }, []);

  const markRoundCorrect = useCallback(() => {
    if (roundMarkedIncorrectRef.current) return;
    rightCountRef.current += 1;
    setRightCount(rightCountRef.current);
  }, []);

  const recordRoundOutcome = useCallback(
    (outcome) => {
      const target = targetCountryRef.current;
      if (!signedIn || !target || !session) return;

      const responseTimeMs =
        outcome === ROUND_OUTCOMES.NEEDED_REVEAL || roundStartTimeRef.current == null
          ? undefined
          : Date.now() - roundStartTimeRef.current;

      recordCountryStat({
        countryId: target.id,
        mode: session.mode,
        level: session.level,
        outcome,
        responseTimeMs,
        gameType: session.review
          ? GAME_TYPE_FOR_STATS.REVIEW
          : (session.gameType ?? GAME_TYPES.TEST),
      }).catch((error) => {
        console.error("Failed to record country stat:", error);
      });
    },
    [session, signedIn]
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
        setFlashWrongCountryIds((current) =>
          current.length === 1 && current[0] === countryId ? [] : current
        );
        wrongFlashTimeoutRef.current = null;
      }, WRONG_CLICK_FLASH_MS);
    },
    [clearWrongFlash]
  );

  const triggerColorFlash = useCallback(
    (countryId, onComplete) => {
      clearColorFlash();
      clearWrongFlash();
      setShowColorCountryIds([countryId]);

      colorFlashTimeoutRef.current = setTimeout(() => {
        setShowColorCountryIds((current) =>
          current.length === 1 && current[0] === countryId ? [] : current
        );
        colorFlashTimeoutRef.current = null;
        onComplete?.();
      }, COUNTRY_FLASH_MS);
    },
    [clearColorFlash]
  );

  const updateShowColorForRound = useCallback((target, level, mode) => {
    if (level === GAME_LEVELS.NAME_FLASH && target && mode !== GAME_MODES.FLAGS) {
      setShowColorCountryIds([target.id]);
      return;
    }
    setShowColorCountryIds([]);
  }, []);

  const startRound = useCallback(() => {
    clearColorFlash();
    clearWrongFlash();
    setHighlightCountryId(null);
    setFlashSmallCountryId(null);
    setRevealMode(false);
    revealModeRef.current = false;
    wrongAttemptsRef.current = 0;
    roundMarkedIncorrectRef.current = false;
    revealStatRecordedRef.current = false;
    roundStartTimeRef.current = Date.now();
    setRoundWrongCountryIds([]);
    if (!isProgressiveFillLevel(session?.level ?? 0)) {
      setWrongCountryIds([]);
    }
    setFlashWrongCountryIds([]);
    setAnswerInput("");
    setSpellingSuggestion(null);
    setFlagsClickHeader(null);

    const next = countryQueueRef.current[queueIndexRef.current] ?? null;
    queueIndexRef.current += 1;
    targetCountryRef.current = next;
    setTargetCountry(next);
    setFeedback({ text: "", type: "" });

    if (session?.level) {
      updateShowColorForRound(next, session.level, session.mode);
    } else {
      setShowColorCountryIds([]);
    }

    if (isNameLevel(session?.level ?? 0)) {
      requestAnimationFrame(() => answerInputRef.current?.focus());
    }
  }, [clearColorFlash, clearWrongFlash, session?.level, session?.mode, updateShowColorForRound]);

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

      gameStartTimeRef.current = Date.now();
      setElapsedMs(0);
      setFinalElapsedMs(0);

      countryQueueRef.current = shuffleCountries(pool);
      queueIndexRef.current = 0;
      incorrectTargetsRef.current = [];

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
      setShowStopConfirm(false);
      setRightCount(0);
      setWrongCount(0);
      rightCountRef.current = 0;
      wrongCountRef.current = 0;
      setFeedback({ text: "", type: "" });
      setWrongCountryIds([]);
      setRoundWrongCountryIds([]);
      setFlashWrongCountryIds([]);
      // Pre-credited (already mastered) countries show as filled from the start.
      setFilledCountryIds(preCredited);

      // Everything was already mastered — nothing left to quiz.
      if (pool.length === 0) {
        setGameActive(false);
        gameActiveRef.current = false;
        setGameComplete(true);
        setFinalElapsedMs(0);
        setTargetCountry(null);
        targetCountryRef.current = null;
        setRevealMode(false);
        revealModeRef.current = false;
        setHighlightCountryId(null);
        setFlashSmallCountryId(null);
        return;
      }

      setGameActive(true);
      gameActiveRef.current = true;

      const first = countryQueueRef.current[0] ?? null;
      queueIndexRef.current = 1;
      targetCountryRef.current = first;
      setTargetCountry(first);
      setRevealMode(false);
      revealModeRef.current = false;
      setHighlightCountryId(null);
      setFlashSmallCountryId(null);
      wrongAttemptsRef.current = 0;
      roundMarkedIncorrectRef.current = false;
      revealStatRecordedRef.current = false;
      roundStartTimeRef.current = Date.now();
      setAnswerInput("");
      setSpellingSuggestion(null);
      setReferencePanelOpen(getReferencePanelDefaultOpen());
      updateShowColorForRound(first, level, mode);

      if (isNameLevel(level)) {
        requestAnimationFrame(() => answerInputRef.current?.focus());
      }

      router.push(buildPlayingUrl());
      gameInHistoryRef.current = true;
    },
    [allCountries, clearColorFlash, clearWrongFlash, resetIdleState, router, updateShowColorForRound]
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
    setShowStopConfirm(false);
    setGamePaused(false);
    if (nextRoundTimeoutRef.current) {
      clearTimeout(nextRoundTimeoutRef.current);
    }
    clearColorFlash();
    clearWrongFlash();
    gameStartTimeRef.current = null;
    setElapsedMs(0);
    setFinalElapsedMs(0);
    setSession(null);
    setGameActive(false);
    gameActiveRef.current = false;
    setGameComplete(false);
    setTargetCountry(null);
    targetCountryRef.current = null;
    setRightCount(0);
    setWrongCount(0);
    rightCountRef.current = 0;
    wrongCountRef.current = 0;
    setFeedback({ text: "", type: "" });
    setHighlightCountryId(null);
    setFlashSmallCountryId(null);
    setWrongCountryIds([]);
    setRoundWrongCountryIds([]);
    setFlashWrongCountryIds([]);
    setFilledCountryIds([]);
    setShowColorCountryIds([]);
    setRevealMode(false);
    revealModeRef.current = false;
    wrongAttemptsRef.current = 0;
    roundMarkedIncorrectRef.current = false;
    countryQueueRef.current = [];
    queueIndexRef.current = 0;
    incorrectTargetsRef.current = [];
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
    if (!session || !gameInHistoryRef.current) return;
    if (isPlayingSearchParams(searchParams)) return;

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

  const dismissIdlePrompt = useCallback(() => {
    if (idleReturnTimeoutRef.current) {
      clearTimeout(idleReturnTimeoutRef.current);
      idleReturnTimeoutRef.current = null;
    }
    setIdlePromptOpen(false);
    idlePromptOpenRef.current = false;
    resumeGameTimer();
  }, [resumeGameTimer]);

  const scheduleIdlePrompt = useCallback(() => {
    clearIdleTimers();
    idlePromptTimeoutRef.current = setTimeout(() => {
      pauseGameTimer();
      setIdlePromptOpen(true);
      idlePromptOpenRef.current = true;
      idleReturnTimeoutRef.current = setTimeout(() => {
        setIdlePromptOpen(false);
        idlePromptOpenRef.current = false;
        handleBackToMenuRef.current();
      }, IDLE_RETURN_MS);
    }, IDLE_PROMPT_MS);
  }, [clearIdleTimers, pauseGameTimer]);

  const handleIdleContinue = useCallback(() => {
    dismissIdlePrompt();
    scheduleIdlePrompt();
  }, [dismissIdlePrompt, scheduleIdlePrompt]);

  useEffect(() => {
    if (!session || !gameActive || gameComplete || gamePaused) {
      clearIdleTimers();
      if (gamePaused) {
        setIdlePromptOpen(false);
        idlePromptOpenRef.current = false;
      }
      if (!session || !gameActive || gameComplete) {
        setIdlePromptOpen(false);
        idlePromptOpenRef.current = false;
      }
      return;
    }

    const onActivity = () => {
      if (idlePromptOpenRef.current) {
        dismissIdlePrompt();
      }
      scheduleIdlePrompt();
    };

    const events = ["pointerdown", "keydown", "touchstart"];
    for (const eventName of events) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    scheduleIdlePrompt();

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, onActivity);
      }
      clearIdleTimers();
    };
  }, [
    session,
    gameActive,
    gameComplete,
    scheduleIdlePrompt,
    dismissIdlePrompt,
    clearIdleTimers,
    gamePaused,
  ]);

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
    setIdlePromptOpen(false);
    idlePromptOpenRef.current = false;
    setShowResumeConfirm(false);
    setGamePaused(true);
    pauseGameTimer();
  }, [clearIdleTimers, gamePaused, handleResumeGame, pauseGameTimer]);

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
          setWrongCountryIds((current) =>
            current.includes(target.id) ? current : [...current, target.id]
          );
        } else {
          setFilledCountryIds((current) =>
            current.includes(target.id) ? current : [...current, target.id]
          );
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
      clearColorFlash,
      clearWrongFlash,
      finishRound,
      isFlashLevel,
      isFlagsMode,
      isNameGame,
      markRoundCorrect,
      scheduleNextRound,
      session?.level,
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
        revealModeRef.current = true;

        if (isFindLevel(session?.level ?? 0)) {
          setHighlightCountryId(target.id);
          setShowColorCountryIds([]);
        } else if (session?.level === GAME_LEVELS.NAME_FLASH) {
          if (session?.mode !== GAME_MODES.FLAGS) {
            setShowColorCountryIds([target.id]);
          }
          setHighlightCountryId(null);
        } else if (session?.level === GAME_LEVELS.NAME_FILL) {
          setWrongCountryIds((current) =>
            current.includes(target.id) ? current : [...current, target.id]
          );
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
    [isFlashLevel, isNameGame, recordRoundOutcome, session?.level, session?.mode, triggerColorFlash]
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
          revealModeRef.current = false;

          if (session?.level === GAME_LEVELS.FIND_FILL) {
            setWrongCountryIds((current) =>
              current.includes(target.id) ? current : [...current, target.id]
            );
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

      setRoundWrongCountryIds((current) =>
        current.includes(clicked.id) ? current : [...current, clicked.id]
      );

      if (attempts === 1) {
        markRoundIncorrect();
      }

      if (attempts >= MAX_ATTEMPTS) {
        handleRevealRound(target);
      } else {
        setFeedback({ text: "Try again.", type: "wrong" });
      }
    },
    [
      activeCountries,
      finishRound,
      handleCorrectRound,
      handleRevealRound,
      markRoundIncorrect,
      scheduleNextRound,
      session?.level,
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
      revealModeRef.current = false;
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
      markRoundIncorrect();
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
    handleCorrectRound,
    handleRevealRound,
    markRoundIncorrect,
    scheduleNextRound,
    session,
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
    <div className="game">
      <AppHeader onHomeClick={handleHeaderHome} />

      {!session ? (
        !hasToken || loadError ? (
          <div className="start-screen">
            <p className="start-subtitle">{promptText}</p>
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
          <header className="game-header">
            <div className="game-header-left">
              <div className="game-meta">
                <span className="game-meta-tag">{modeLabel}</span>
                <span className="game-meta-tag">{regionLabel}</span>
                <span className="game-meta-tag">{levelLabel}</span>
                {session.review && (
                  <span className="game-meta-tag">Review</span>
                )}
                {isLearningGame && (
                  <span className="game-meta-tag">Learning</span>
                )}
              </div>
            </div>

            {!gameComplete && (
              <div
                className={`prompt game-header-center ${
                  feedback.type === "wrong" ||
                  feedback.type === "reveal" ||
                  feedback.type === "got-it"
                    ? "prompt-wrong"
                    : ""
                }`}
              >
                {isNameGame ? (
                  <div className="answer-prompt">
                    <input
                      ref={answerInputRef}
                      type="text"
                      className="answer-input"
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
                      <p className="spelling-suggestion">
                        Did you mean{" "}
                        <button
                          type="button"
                          className="spelling-suggestion-link"
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

            <div className="game-header-right">
              {!gameComplete && (
                <div className="game-controls">
                  <button
                    type="button"
                    className="game-control-btn"
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
                    className="game-control-btn game-control-btn--stop"
                    onClick={() => setShowStopConfirm(true)}
                    aria-label="Stop game"
                    title="Stop"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  </button>
                </div>
              )}
              <div className="scoreboard">
                {!gameComplete && (
                  <span className="game-timer">{formatElapsedTime(elapsedMs)}</span>
                )}
                <span className="score-correct">
                  correct: {displayedCorrect}/{totalRounds}
                </span>
                <span className="score-incorrect">
                  incorrect: {wrongCount}/{totalRounds}
                </span>
              </div>
            </div>
          </header>
          {(isOceaniaRegion || hasToken) && !gameComplete && (
            <div className="map-stage">
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
                  className="map-pause-overlay"
                  onClick={handlePausedMapInteraction}
                  aria-label="Game paused. Click to resume."
                />
              )}
              {showFlagPrompt && (
                <div className="flag-card" aria-hidden="true">
                  <FlagPrompt iso2={targetCountry.iso2} size="card" />
                </div>
              )}
              {targetCountry && (
                <div className="map-side-panels">
                  <CountryReferencePanel
                    country={targetCountry}
                    mode={session.mode}
                    level={session.level}
                    revealMode={revealMode}
                    open={referencePanelOpen}
                    onToggle={() => setReferencePanelOpen((isOpen) => !isOpen)}
                  />
                  <CountryHintsPanel
                    country={targetCountry}
                    allCountries={allCountries}
                    open={hintsPanelOpen}
                    onToggle={() => setHintsPanelOpen((isOpen) => !isOpen)}
                  />
                </div>
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
            canReviewIncorrect={isTestGame && !session.review && wrongCount > 0}
            onReviewIncorrect={handleReviewIncorrect}
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToMenu}
          />
          <IdlePromptModal open={idlePromptOpen} onContinue={handleIdleContinue} />
          {showResumeConfirm && (
            <div className="modal-overlay">
              <div
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="resume-confirm-title"
              >
                <h2 id="resume-confirm-title" className="modal-title">
                  Resume game?
                </h2>
                <p className="modal-subtitle">
                  The game is paused. Do you want to resume?
                </p>
                <div className="modal-actions">
                  <button type="button" className="primary-btn" onClick={handleResumeGame}>
                    Resume
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setShowResumeConfirm(false)}
                  >
                    Stay paused
                  </button>
                </div>
              </div>
            </div>
          )}
          {showStopConfirm && (
            <div className="modal-overlay">
              <div
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="stop-confirm-title"
              >
                <h2 id="stop-confirm-title" className="modal-title">
                  Exit game?
                </h2>
                <p className="modal-subtitle">
                  Do you want to exit game? Your progress won&apos;t be saved.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleBackToMenu}
                  >
                    Exit game
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={() => setShowStopConfirm(false)}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}
          {showMenuConfirm && (
            <div className="modal-overlay">
              <div
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="menu-confirm-title"
              >
                <h2 id="menu-confirm-title" className="modal-title">
                  Leave this game?
                </h2>
                <p className="modal-subtitle">
                  Are you sure you want to go back to menu? Your progress in this
                  game will be lost.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleBackToMenu}
                  >
                    Yes, go to menu
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
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
