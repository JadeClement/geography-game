"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import AuthModal from "@/components/AuthModal";
import { fetchWeakCountryStats } from "@/lib/countryStats";
import { GAME_TYPES, LEARNING_SESSION_SIZES } from "@/lib/gameTypes";
import { LEVEL_OPTIONS } from "@/lib/levels";
import { GAME_MODES, REGIONS } from "@/lib/regions";

export default function StartScreen({ onStart, disabled }) {
  const { data: session, status } = useSession();
  const [selectedGameType, setSelectedGameType] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedSessionSize, setSelectedSessionSize] = useState(null);
  const [step, setStep] = useState("gameType");
  const [authOpen, setAuthOpen] = useState(false);
  const [weakCount, setWeakCount] = useState(null);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakError, setWeakError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [weakReloadKey, setWeakReloadKey] = useState(0);

  const signedIn = status === "authenticated" && session?.user;
  const isLearning = selectedGameType === GAME_TYPES.LEARNING;

  useEffect(() => {
    if (
      step !== "learningSize" ||
      !isLearning ||
      !signedIn ||
      !selectedMode ||
      !selectedRegion ||
      !selectedLevel
    ) {
      return;
    }

    let cancelled = false;
    setWeakLoading(true);
    setWeakError(null);

    fetchWeakCountryStats({
      mode: selectedMode,
      level: selectedLevel,
      region: selectedRegion,
    })
      .then((data) => {
        if (!cancelled) {
          setWeakCount(data.weakCount ?? 0);
          setWeakLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWeakError(error.message || "Could not load learning data.");
          setWeakLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [step, isLearning, signedIn, selectedMode, selectedRegion, selectedLevel, weakReloadKey]);

  const resetToGameType = () => {
    setStep("gameType");
    setSelectedGameType(null);
    setSelectedMode(null);
    setSelectedRegion(null);
    setSelectedLevel(null);
    setSelectedSessionSize(null);
    setWeakCount(null);
    setWeakError(null);
  };

  const handleTestStart = (level) => {
    if (selectedMode && selectedRegion && !disabled) {
      onStart({
        gameType: GAME_TYPES.TEST,
        mode: selectedMode,
        region: selectedRegion,
        level,
      });
    }
  };

  const handleLearningStart = async () => {
    if (
      !selectedMode ||
      !selectedRegion ||
      !selectedLevel ||
      !selectedSessionSize ||
      disabled ||
      starting
    ) {
      return;
    }

    setStarting(true);
    try {
      await onStart({
        gameType: GAME_TYPES.LEARNING,
        mode: selectedMode,
        region: selectedRegion,
        level: selectedLevel,
        learningSessionSize: selectedSessionSize,
      });
    } finally {
      setStarting(false);
    }
  };

  const canContinueSetup = selectedMode && selectedRegion && !disabled;

  if (step === "learningSize") {
    const learningLocked = weakCount === 0;
    const regionLabel = REGIONS.find((region) => region.id === selectedRegion)?.label;

    return (
      <div className="start-screen">
        <h1 className="start-title">Learning session</h1>
        <p className="start-subtitle">
          {selectedMode === GAME_MODES.CAPITALS ? "Capitals" : "Countries"} · {regionLabel} ·{" "}
          {LEVEL_OPTIONS.find((option) => option.level === selectedLevel)?.title}
        </p>

        {weakLoading && <p className="start-subtitle">Checking your learning list…</p>}
        {weakError && (
          <div className="start-message error">
            <p>{weakError}</p>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setWeakReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {!weakLoading && !weakError && learningLocked && (
          <p className="start-message">
            Play Test mode first to build your learning list. Learning focuses on countries you
            have missed at least once.
          </p>
        )}

        {!weakLoading && !weakError && !learningLocked && (
          <div className="start-section start-level-list">
            <p className="start-subtitle">
              {weakCount} {weakCount === 1 ? "country" : "countries"} in your learning list
            </p>
            {LEARNING_SESSION_SIZES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`choice-btn choice-btn-level ${
                  selectedSessionSize === option.id ? "selected" : ""
                }`}
                disabled={disabled || starting}
                onClick={() => setSelectedSessionSize(option.id)}
              >
                <span className="choice-btn-level-title">{option.label}</span>
              </button>
            ))}
            <button
              type="button"
              className="primary-btn start-continue-btn"
              disabled={!selectedSessionSize || disabled || starting}
              onClick={handleLearningStart}
            >
              {starting ? "Starting…" : "Start learning"}
            </button>
          </div>
        )}

        <button
          type="button"
          className="secondary-btn start-back-btn"
          onClick={() => setStep("level")}
        >
          Back
        </button>
      </div>
    );
  }

  if (step === "level") {
    return (
      <div className="start-screen">
        <h1 className="start-title">Choose a level</h1>
        <p className="start-subtitle">
          {isLearning ? "Learning · " : "Test · "}
          {selectedMode === GAME_MODES.CAPITALS ? "Capitals" : "Countries"} ·{" "}
          {REGIONS.find((region) => region.id === selectedRegion)?.label}
        </p>

        <div className="start-section start-level-list">
          {LEVEL_OPTIONS.map((option) => (
            <button
              key={option.level}
              type="button"
              className={`choice-btn choice-btn-level ${
                isLearning && selectedLevel === option.level ? "selected" : ""
              }`}
              disabled={disabled}
              onClick={() => {
                if (isLearning) {
                  setSelectedLevel(option.level);
                  setSelectedSessionSize(null);
                  setStep("learningSize");
                  return;
                }
                handleTestStart(option.level);
              }}
            >
              <span className="choice-btn-level-title">{option.title}</span>
              <span className="choice-btn-level-desc">{option.description}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="secondary-btn start-back-btn"
          onClick={() => setStep("setup")}
        >
          Back
        </button>
      </div>
    );
  }

  if (step === "setup") {
    return (
      <div className="start-screen">
        <h1 className="start-title">
          {isLearning ? "Learning mode" : "Test mode"}
        </h1>
        <p className="start-subtitle">
          {isLearning
            ? "Practice countries you struggle with"
            : "Full region quiz — builds your learning list"}
        </p>

        {isLearning && !signedIn && status !== "loading" && (
          <div className="start-message">
            <p>Sign in to use Learning mode — your progress is tracked per country.</p>
            <button type="button" className="primary-btn" onClick={() => setAuthOpen(true)}>
              Sign in
            </button>
          </div>
        )}

        <div className="start-section">
          <div className="start-row">
            <button
              type="button"
              className={`choice-btn ${selectedMode === GAME_MODES.COUNTRIES ? "selected" : ""}`}
              disabled={disabled || (isLearning && !signedIn)}
              onClick={() => setSelectedMode(GAME_MODES.COUNTRIES)}
            >
              Countries
            </button>
            <button
              type="button"
              className={`choice-btn ${selectedMode === GAME_MODES.CAPITALS ? "selected" : ""}`}
              disabled={disabled || (isLearning && !signedIn)}
              onClick={() => setSelectedMode(GAME_MODES.CAPITALS)}
            >
              Capitals
            </button>
          </div>

          <div className="start-region-list">
            {REGIONS.map((region) => (
              <button
                key={region.id}
                type="button"
                className={`choice-btn choice-btn-region ${
                  selectedRegion === region.id ? "selected" : ""
                }`}
                disabled={disabled || (isLearning && !signedIn)}
                onClick={() => setSelectedRegion(region.id)}
              >
                {region.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="primary-btn start-continue-btn"
            disabled={!canContinueSetup || (isLearning && !signedIn)}
            onClick={() => setStep("level")}
          >
            Continue
          </button>
        </div>

        <button
          type="button"
          className="secondary-btn start-back-btn"
          onClick={resetToGameType}
        >
          Back
        </button>

        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  return (
    <div className="start-screen">
      <h1 className="start-title">Geography Game</h1>
      <p className="start-subtitle">Choose how you want to play</p>

      <div className="start-section start-game-type-list">
        <button
          type="button"
          className={`choice-btn choice-btn-level ${
            selectedGameType === GAME_TYPES.TEST ? "selected" : ""
          }`}
          disabled={disabled}
          onClick={() => {
            setSelectedGameType(GAME_TYPES.TEST);
            setStep("setup");
          }}
        >
          <span className="choice-btn-level-title">Test mode</span>
          <span className="choice-btn-level-desc">
            Full region quiz. Scores saved when signed in.
          </span>
        </button>
        <button
          type="button"
          className={`choice-btn choice-btn-level ${
            selectedGameType === GAME_TYPES.LEARNING ? "selected" : ""
          }`}
          disabled={disabled}
          onClick={() => {
            setSelectedGameType(GAME_TYPES.LEARNING);
            setStep("setup");
          }}
        >
          <span className="choice-btn-level-title">Learning mode</span>
          <span className="choice-btn-level-desc">
            Focus on countries you miss. Requires sign-in and Test history.
          </span>
        </button>
      </div>
    </div>
  );
}
