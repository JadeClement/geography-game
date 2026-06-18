"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import GameCompleteModal from "@/components/GameCompleteModal";
import MapboxMap from "@/components/MapboxMap";
import StartScreen from "@/components/StartScreen";
import { MAX_ATTEMPTS } from "@/lib/constants";
import {
  countryFromFeature,
  isCorrectCountry,
  loadCountriesGeoJSON,
  shuffleCountries,
} from "@/lib/countries";
import { getBoundsFromCountries, buildSmallCountriesGeoJSON } from "@/lib/geometry";
import {
  GAME_MODES,
  REGIONS,
  buildGameGeojson,
  filterCountriesByRegion,
} from "@/lib/regions";

export default function GeographyGame() {
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

  const countryQueueRef = useRef([]);
  const queueIndexRef = useRef(0);
  const rightCountRef = useRef(0);
  const wrongCountRef = useRef(0);
  const gameActiveRef = useRef(false);
  const targetCountryRef = useRef(null);
  const revealModeRef = useRef(false);
  const wrongAttemptsRef = useRef(0);
  const nextRoundTimeoutRef = useRef(null);

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
    };
  }, []);

  const activeCountries = useMemo(() => {
    if (!session) return [];
    return filterCountriesByRegion(allCountries, session.region);
  }, [allCountries, session]);

  const activeGeojson = useMemo(
    () => buildGameGeojson(activeCountries),
    [activeCountries]
  );

  const activeSmallCountriesGeojson = useMemo(
    () => buildSmallCountriesGeoJSON(activeCountries),
    [activeCountries]
  );

  const mapBounds = useMemo(
    () => getBoundsFromCountries(activeCountries),
    [activeCountries]
  );

  const regionLabel =
    REGIONS.find((region) => region.id === session?.region)?.label ?? "";
  const modeLabel = session?.mode === GAME_MODES.CAPITALS ? "Capitals" : "Countries";

  const finishGame = useCallback(() => {
    setGameActive(false);
    gameActiveRef.current = false;
    setGameComplete(true);
    setFeedback({ text: "", type: "" });
    setHighlightCountryId(null);
    setFlashSmallCountryId(null);
    setRevealMode(false);
    revealModeRef.current = false;
  }, []);

  const completeRound = useCallback(
    (wasCorrect) => {
      const nextRight = wasCorrect ? rightCountRef.current + 1 : rightCountRef.current;
      const nextWrong = wasCorrect ? wrongCountRef.current : wrongCountRef.current + 1;
      const total = countryQueueRef.current.length;

      if (wasCorrect) {
        rightCountRef.current = nextRight;
        setRightCount(nextRight);
      } else {
        wrongCountRef.current = nextWrong;
        setWrongCount(nextWrong);
      }

      if (nextRight + nextWrong >= total) {
        finishGame();
        return true;
      }

      return false;
    },
    [finishGame]
  );

  const startRound = useCallback(() => {
    setHighlightCountryId(null);
    setFlashSmallCountryId(null);
    setRevealMode(false);
    revealModeRef.current = false;
    wrongAttemptsRef.current = 0;
    roundUsedRevealRef.current = false;

    const next = countryQueueRef.current[queueIndexRef.current] ?? null;
    queueIndexRef.current += 1;
    targetCountryRef.current = next;
    setTargetCountry(next);
    setFeedback({ text: "", type: "" });
  }, []);

  const scheduleNextRound = useCallback(
    (delay = 1200) => {
      if (nextRoundTimeoutRef.current) {
        clearTimeout(nextRoundTimeoutRef.current);
      }
      nextRoundTimeoutRef.current = setTimeout(() => {
        if (gameActiveRef.current) startRound();
      }, delay);
    },
    [startRound]
  );

  const beginSession = useCallback(
    ({ mode, region }) => {
      const pool = filterCountriesByRegion(allCountries, region);
      if (pool.length === 0) return;

      if (nextRoundTimeoutRef.current) {
        clearTimeout(nextRoundTimeoutRef.current);
      }

      countryQueueRef.current = shuffleCountries(pool);
      queueIndexRef.current = 0;

      setSession({ mode, region });
      setGameActive(true);
      gameActiveRef.current = true;
      setGameComplete(false);
      setRightCount(0);
      setWrongCount(0);
      setFeedback({ text: "", type: "" });

      const first = countryQueueRef.current[0] ?? null;
      queueIndexRef.current = 1;
      targetCountryRef.current = first;
      setTargetCountry(first);
      setRevealMode(false);
      revealModeRef.current = false;
      setHighlightCountryId(null);
      setFlashSmallCountryId(null);
      wrongAttemptsRef.current = 0;
    },
    [allCountries]
  );

  const handleSessionStart = useCallback(
    (config) => {
      beginSession(config);
    },
    [beginSession]
  );

  const handleBackToMenu = () => {
    if (nextRoundTimeoutRef.current) {
      clearTimeout(nextRoundTimeoutRef.current);
    }
    setSession(null);
    setGameActive(false);
    gameActiveRef.current = false;
    setGameComplete(false);
    setTargetCountry(null);
    targetCountryRef.current = null;
    setRightCount(0);
    setWrongCount(0);
    setFeedback({ text: "", type: "" });
    setHighlightCountryId(null);
    setFlashSmallCountryId(null);
    setRevealMode(false);
    revealModeRef.current = false;
    wrongAttemptsRef.current = 0;
    countryQueueRef.current = [];
    queueIndexRef.current = 0;
  };

  const handlePlayAgain = () => {
    if (!session) return;
    beginSession(session);
  };

  const handleCountryClick = useCallback(
    (feature) => {
      const target = targetCountryRef.current;
      if (!gameActiveRef.current || !target) return;

      const clicked = countryFromFeature(feature, activeCountries);
      if (!clicked) return;

      if (isCorrectCountry(clicked, target)) {
        if (revealModeRef.current) {
          setHighlightCountryId(null);
          setFlashSmallCountryId(null);
          setRevealMode(false);
          revealModeRef.current = false;
          setFeedback({ text: "Got it!", type: "reveal" });

          if (completeRound(false)) return;
          scheduleNextRound();
          return;
        }

        setFeedback({ text: "Correct!", type: "correct" });
        if (completeRound(true)) return;
        scheduleNextRound();
        return;
      }

      if (revealModeRef.current) return;

      wrongAttemptsRef.current += 1;
      const next = wrongAttemptsRef.current;
      if (target.isSmall) {
        setFlashSmallCountryId(target.id);
      }
      if (next >= MAX_ATTEMPTS) {
        setRevealMode(true);
        revealModeRef.current = true;
        setHighlightCountryId(target.id);
        if (target.isSmall) {
          setFlashSmallCountryId(target.id);
        }
        setFeedback({
          text: "Oops! Click the highlighted country.",
          type: "reveal",
        });
      } else {
        setFeedback({ text: "Oops! Try again.", type: "wrong" });
      }
    },
    [activeCountries, completeRound, scheduleNextRound]
  );

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
            <button type="button" className="menu-btn" onClick={handleBackToMenu}>
              Menu
            </button>
            <div className="game-meta">
              <span className="game-meta-tag">{modeLabel}</span>
              <span className="game-meta-tag">{regionLabel}</span>
            </div>
            {!gameComplete && <div className="prompt">{promptText}</div>}
            <div className="score" title="Correct · Needed help · Total in region">
              {rightCount} · {wrongCount} · {activeCountries.length}
            </div>
            {feedback.text && !gameComplete && (
              <div className={`feedback ${feedback.type}`}>{feedback.text}</div>
            )}
          </header>
          {hasToken && !gameComplete && (
            <MapboxMap
              geojson={activeGeojson}
              smallCountriesGeojson={activeSmallCountriesGeojson}
              gameActive={gameActive}
              highlightCountryId={highlightCountryId}
              flashSmallCountryId={flashSmallCountryId}
              fitBounds={mapBounds}
              onCountryClick={handleCountryClick}
            />
          )}
          <GameCompleteModal
            open={gameComplete}
            score={rightCount}
            rightCount={rightCount}
            wrongCount={wrongCount}
            mode={session.mode}
            region={session.region}
            modeLabel={modeLabel}
            regionLabel={regionLabel}
            onPlayAgain={handlePlayAgain}
            onBackToMenu={handleBackToMenu}
          />
        </>
      )}
    </div>
  );
}
