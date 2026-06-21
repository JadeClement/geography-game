"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import GameCompleteModal from "@/components/GameCompleteModal";
import MapFeedback from "@/components/MapFeedback";
import MapboxMap from "@/components/MapboxMap";
import StartScreen from "@/components/StartScreen";
import { CORRECT_ROUND_DELAY_MS, MAX_ATTEMPTS, REVEAL_ROUND_DELAY_MS } from "@/lib/constants";
import { fetchWeakCountryStats, recordCountryStat, ROUND_OUTCOMES } from "@/lib/countryStats";
import {
  countryFromFeature,
  isCorrectCountry,
  isCorrectTextAnswer,
  loadCountriesGeoJSON,
  shuffleCountries,
} from "@/lib/countries";
import { getSpellingSuggestion } from "@/lib/spelling";
import { enrichGeojsonWithColors, getCountryColorMap } from "@/lib/countryColors";
import { getBoundsFromCountries, buildSmallCountriesGeoJSON } from "@/lib/geometry";
import { GAME_TYPES } from "@/lib/gameTypes";
import { buildLearningQueue } from "@/lib/learning";
import {
  COUNTRY_FLASH_MS,
  GAME_LEVELS,
  getLevelLabel,
  isFindLevel,
  isNameLevel,
  isProgressiveFillLevel,
  usesColorFlash,
  WRONG_CLICK_FLASH_MS,
} from "@/lib/levels";
import {
  GAME_MODES,
  REGIONS,
  buildGameGeojson,
  buildInactiveGeojson,
  filterCountriesByRegion,
} from "@/lib/regions";
import { formatElapsedTime } from "@/lib/time";
import { useSession } from "next-auth/react";

export default function GeographyGame() {
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
  const roundStartTimeRef = useRef(null);
  const revealStatRecordedRef = useRef(false);

  const signedIn = authStatus === "authenticated" && authSession?.user;

  gameActiveRef.current = gameActive;
  targetCountryRef.current = targetCountry;
  revealModeRef.current = revealMode;
  rightCountRef.current = rightCount;
  wrongCountRef.current = wrongCount;

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
      if (gameStartTimeRef.current != null) {
        setElapsedMs(Date.now() - gameStartTimeRef.current);
      }
    };

    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [session, gameActive, gameComplete]);

  const activeCountries = useMemo(() => {
    if (!session) return [];
    return filterCountriesByRegion(allCountries, session.region);
  }, [allCountries, session]);

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

  const mapBounds = useMemo(() => {
    if (!session) return null;
    return getBoundsFromCountries(activeCountries, session.region);
  }, [activeCountries, session]);

  const regionLabel =
    REGIONS.find((region) => region.id === session?.region)?.label ?? "";
  const modeLabel = session?.mode === GAME_MODES.CAPITALS ? "Capitals" : "Countries";
  const levelLabel = session?.level ? getLevelLabel(session.level) : "";
  const isTestGame = session?.gameType !== GAME_TYPES.LEARNING;
  const isLearningGame = session?.gameType === GAME_TYPES.LEARNING;

  const isNameGame = session?.level ? isNameLevel(session.level) : false;
  const isFlashLevel = session?.level ? usesColorFlash(session.level) : false;

  const highlightTargetCountryId =
    session?.level === GAME_LEVELS.NAME_FILL && targetCountry && !revealMode && !gameComplete
      ? targetCountry.id
      : null;

  const finishGame = useCallback(() => {
    const elapsed =
      gameStartTimeRef.current != null ? Date.now() - gameStartTimeRef.current : 0;
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
  }, []);

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

  const updateShowColorForRound = useCallback(
    (target, level) => {
      if (level === GAME_LEVELS.NAME_FLASH && target) {
        setShowColorCountryIds([target.id]);
        return;
      }
      setShowColorCountryIds([]);
    },
    []
  );

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

    const next = countryQueueRef.current[queueIndexRef.current] ?? null;
    queueIndexRef.current += 1;
    targetCountryRef.current = next;
    setTargetCountry(next);
    setFeedback({ text: "", type: "" });

    if (session?.level) {
      updateShowColorForRound(next, session.level);
    } else {
      setShowColorCountryIds([]);
    }

    if (isNameLevel(session?.level ?? 0)) {
      requestAnimationFrame(() => answerInputRef.current?.focus());
    }
  }, [clearColorFlash, clearWrongFlash, session?.level, updateShowColorForRound]);

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
    }) => {
      const pool = countries ?? filterCountriesByRegion(allCountries, region);
      if (pool.length === 0) return;

      if (nextRoundTimeoutRef.current) {
        clearTimeout(nextRoundTimeoutRef.current);
      }
      clearColorFlash();
      clearWrongFlash();

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
        learningSessionSize,
        totalRounds: pool.length,
        reviewCountryIds: review ? countryIds : null,
        learningCountryIds: gameType === GAME_TYPES.LEARNING ? countryIds : null,
      });
      setGameActive(true);
      gameActiveRef.current = true;
      setGameComplete(false);
      setRightCount(0);
      setWrongCount(0);
      rightCountRef.current = 0;
      wrongCountRef.current = 0;
      setFeedback({ text: "", type: "" });
      setWrongCountryIds([]);
      setRoundWrongCountryIds([]);
      setFlashWrongCountryIds([]);
      setFilledCountryIds([]);

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
      updateShowColorForRound(first, level);

      if (isNameLevel(level)) {
        requestAnimationFrame(() => answerInputRef.current?.focus());
      }
    },
    [allCountries, clearColorFlash, clearWrongFlash, updateShowColorForRound]
  );

  const beginSession = useCallback(
    (config) => {
      startGame(config);
    },
    [startGame]
  );

  const handleSessionStart = useCallback(
    async (config) => {
      if (config.gameType === GAME_TYPES.LEARNING) {
        const data = await fetchWeakCountryStats({
          mode: config.mode,
          level: config.level,
          region: config.region,
        });

        if ((data.weakCount ?? 0) === 0) {
          return;
        }

        const queueIds = buildLearningQueue(data.stats, config.learningSessionSize);
        const regionPool = filterCountriesByRegion(allCountries, config.region);
        const countries = queueIds
          .map((id) => regionPool.find((country) => country.id === id))
          .filter(Boolean);

        if (countries.length === 0) return;

        startGame({
          gameType: GAME_TYPES.LEARNING,
          mode: config.mode,
          region: config.region,
          level: config.level,
          countries,
          learningCountryIds: queueIds,
          learningSessionSize: config.learningSessionSize,
        });
        return;
      }

      beginSession(config);
    },
    [allCountries, beginSession, startGame]
  );

  const handleBackToMenu = () => {
    setShowMenuConfirm(false);
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
  };

  const handleMenuClick = () => {
    if (!gameComplete) {
      setShowMenuConfirm(true);
      return;
    }
    handleBackToMenu();
  };

  const startLearningAgain = useCallback(async () => {
    if (!session || !isLearningGame) return;

    const data = await fetchWeakCountryStats({
      mode: session.mode,
      level: session.level,
      region: session.region,
    });

    if ((data.weakCount ?? 0) === 0) return;

    const queueIds = buildLearningQueue(
      data.stats,
      session.learningSessionSize ?? data.weakCount
    );
    const regionPool = filterCountriesByRegion(allCountries, session.region);
    const countries = queueIds
      .map((id) => regionPool.find((country) => country.id === id))
      .filter(Boolean);

    if (countries.length === 0) return;

    startGame({
      gameType: GAME_TYPES.LEARNING,
      mode: session.mode,
      region: session.region,
      level: session.level,
      countries,
      learningCountryIds: queueIds,
      learningSessionSize: session.learningSessionSize,
    });
  }, [allCountries, isLearningGame, session, startGame]);

  const handlePlayAgain = () => {
    if (!session) return;
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
    beginSession(session);
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

      if (isFlashLevel) {
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
          setShowColorCountryIds([target.id]);
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

      if (session?.level === GAME_LEVELS.NAME_FLASH) {
        triggerColorFlash(target.id, showReveal);
        return;
      }

      showReveal();
    },
    [isFlashLevel, isNameGame, recordRoundOutcome, session?.level, session?.mode, triggerColorFlash]
  );

  const handleCountryClick = useCallback(
    (feature) => {
      const target = targetCountryRef.current;
      if (!gameActiveRef.current || !target || !isFindLevel(session?.level ?? 0)) return;

      const clicked = countryFromFeature(feature, activeCountries);
      if (!clicked) return;

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
      triggerWrongFlash,
    ]
  );

  const handleAnswerSubmit = useCallback(() => {
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
        : targetCountry?.name;

  return (
    <div className="game">
      <AppHeader />

      {!session ? (
        !hasToken || loadError ? (
          <div className="start-screen">
            <p className="start-subtitle">{promptText}</p>
          </div>
        ) : (
          <StartScreen onStart={handleSessionStart} disabled={!ready} />
        )
      ) : (
        <>
          <header className="game-header">
            <div className="game-header-left">
              <button type="button" className="menu-btn" onClick={handleMenuClick}>
                Menu
              </button>
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
                      disabled={!gameActive}
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
                ) : (
                  promptText
                )}
              </div>
            )}

            <div className="game-header-right">
              <div className="scoreboard">
                {!gameComplete && (
                  <span className="game-timer">{formatElapsedTime(elapsedMs)}</span>
                )}
                <span className="score-correct">
                  correct: {rightCount}/{session.totalRounds ?? activeCountries.length}
                </span>
                <span className="score-incorrect">
                  incorrect: {wrongCount}/{session.totalRounds ?? activeCountries.length}
                </span>
              </div>
            </div>
          </header>
          {hasToken && !gameComplete && (
            <div className="map-stage">
              <MapboxMap
                geojson={activeGeojson}
                inactiveGeojson={inactiveGeojson}
                smallCountriesGeojson={activeSmallCountriesGeojson}
                gameActive={gameActive && isFindLevel(session.level)}
                level={session.level}
                wrongCountryIds={mapWrongCountryIds}
                flashWrongCountryIds={flashWrongCountryIds}
                showColorCountryIds={showColorCountryIds}
                filledCountryIds={filledCountryIds}
                highlightTargetCountryId={highlightTargetCountryId}
                highlightCountryId={highlightCountryId}
                flashSmallCountryId={flashSmallCountryId}
                fitBounds={mapBounds}
                onCountryClick={handleCountryClick}
              />
              <MapFeedback text={feedback.text} type={feedback.type} />
            </div>
          )}
          <GameCompleteModal
            open={gameComplete}
            score={rightCount}
            rightCount={rightCount}
            wrongCount={wrongCount}
            total={session.totalRounds ?? activeCountries.length}
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
