"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import RegionMapPicker from "@/components/RegionMapPicker";
import SpinningGlobe from "@/components/SpinningGlobe";
import { fetchWeakCountryStats } from "@/lib/countryStats";
import { GAME_TYPES, LEARNING_SESSION_SIZES } from "@/lib/gameTypes";
import { getLevelLabel, LEVEL_SECTIONS } from "@/lib/levels";
import { GAME_MODES, REGIONS, getModeLabel } from "@/lib/regions";

export default function StartScreen({ onStart, disabled, countries = [] }) {
  const { data: session, status } = useSession();
  const [selectedGameType, setSelectedGameType] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(null);
  const [selectedSessionSize, setSelectedSessionSize] = useState(null);
  const [step, setStep] = useState("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [weakCount, setWeakCount] = useState(null);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakError, setWeakError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [weakReloadKey, setWeakReloadKey] = useState(0);
  const pendingExploreAdvanceRef = useRef(false);

  const signedIn = status === "authenticated" && session?.user;
  const isLearning = selectedGameType === GAME_TYPES.LEARNING;

  // Advance from the Explore (mode + region) step once both are chosen.
  useEffect(() => {
    if (step !== "explore" || !pendingExploreAdvanceRef.current) return;
    if (!selectedMode || !selectedRegion || disabled) return;

    pendingExploreAdvanceRef.current = false;
    setStep("chooseType");
  }, [step, selectedMode, selectedRegion, disabled]);

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

  const resetToHome = () => {
    pendingExploreAdvanceRef.current = false;
    setStep("home");
    setSelectedGameType(null);
    setSelectedMode(null);
    setSelectedRegion(null);
    setSelectedLevel(null);
    setSelectedSessionSize(null);
    setWeakCount(null);
    setWeakError(null);
  };

  const handleGo = async () => {
    if (disabled || starting) return;
    setStarting(true);
    try {
      await onStart({ go: true });
    } finally {
      setStarting(false);
    }
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

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    pendingExploreAdvanceRef.current = true;
  };

  const handleRegionSelect = (regionId) => {
    setSelectedRegion(regionId);
    pendingExploreAdvanceRef.current = true;
  };

  const getSectionSubtitle = (section) => {
    if (selectedMode === GAME_MODES.FLAGS) {
      if (section.id === "find") {
        return "Given a flag, click the country on the map.";
      }
      if (section.id === "name") {
        return "Given a flag, type the country's name into the box.";
      }
    }
    return section.subtitle;
  };

  if (step === "learningSize") {
    const learningLocked = weakCount === 0;
    const regionLabel = REGIONS.find((region) => region.id === selectedRegion)?.label;

    return (
      <div className="start-screen">
        <h1 className="start-title">Learning session</h1>
        <p className="start-subtitle">
          {getModeLabel(selectedMode)} · {regionLabel} ·{" "}
          {getLevelLabel(selectedLevel)}
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
          {isLearning ? "Learn · " : "Test · "}
          {getModeLabel(selectedMode)} ·{" "}
          {REGIONS.find((region) => region.id === selectedRegion)?.label}
        </p>

        <div className="start-level-sections">
          {LEVEL_SECTIONS.map((section) => (
            <div key={section.id} className="start-level-section">
              <div className="start-level-section-header">
                <h2 className="start-level-section-title">{section.title}</h2>
                {getSectionSubtitle(section) && (
                  <p className="start-level-section-desc">{getSectionSubtitle(section)}</p>
                )}
              </div>
              <div className="start-section start-level-list">
                {section.levels.map((option) => (
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
            </div>
          ))}
        </div>

        <button
          type="button"
          className="secondary-btn start-back-btn"
          onClick={() => setStep("chooseType")}
        >
          Back
        </button>
      </div>
    );
  }

  if (step === "chooseType") {
    const regionLabel = REGIONS.find((region) => region.id === selectedRegion)?.label;
    const learnDisabled = disabled || !signedIn;

    return (
      <div className="start-screen">
        <h1 className="start-title">Test or Learn?</h1>
        <p className="start-subtitle">
          {getModeLabel(selectedMode)} · {regionLabel}
        </p>

        <div className="start-section start-game-type-list">
          <button
            type="button"
            className="choice-btn choice-btn-level"
            disabled={disabled}
            onClick={() => {
              setSelectedGameType(GAME_TYPES.TEST);
              setSelectedLevel(null);
              setStep("level");
            }}
          >
            <span className="choice-btn-level-title">Test</span>
            <span className="choice-btn-level-desc">Full quiz — builds your learning list.</span>
          </button>
          <button
            type="button"
            className="choice-btn choice-btn-level"
            disabled={learnDisabled}
            onClick={() => {
              setSelectedGameType(GAME_TYPES.LEARNING);
              setSelectedLevel(null);
              setStep("level");
            }}
          >
            <span className="choice-btn-level-title">Learn</span>
            <span className="choice-btn-level-desc">Drill the ones you miss most.</span>
          </button>
        </div>

        {!signedIn && status !== "loading" && (
          <div className="start-message">
            <p>Sign in to use Learn — your progress is tracked per country.</p>
            <button type="button" className="primary-btn" onClick={() => setAuthOpen(true)}>
              Sign in
            </button>
          </div>
        )}

        <button
          type="button"
          className="secondary-btn start-back-btn"
          onClick={() => setStep("explore")}
        >
          Back
        </button>

        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  if (step === "explore") {
    return (
      <div className="start-screen start-screen--explore">
        <h1 className="start-title">Explore</h1>
        <p className="start-subtitle">Pick what to practice and where.</p>

        <div className="start-section start-section--wide">
          <div className="start-row start-mode-row">
            <button
              type="button"
              className={`choice-btn ${selectedMode === GAME_MODES.COUNTRIES ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => handleModeSelect(GAME_MODES.COUNTRIES)}
            >
              Countries
            </button>
            <button
              type="button"
              className={`choice-btn ${selectedMode === GAME_MODES.CAPITALS ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => handleModeSelect(GAME_MODES.CAPITALS)}
            >
              Capitals
            </button>
            <button
              type="button"
              className={`choice-btn ${selectedMode === GAME_MODES.FLAGS ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => handleModeSelect(GAME_MODES.FLAGS)}
            >
              Flags
            </button>
          </div>

          <RegionMapPicker
            countries={countries}
            selectedRegion={selectedRegion}
            onSelect={handleRegionSelect}
            disabled={disabled}
          />
        </div>

        <button
          type="button"
          className="secondary-btn start-back-btn"
          onClick={resetToHome}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="start-screen start-screen--with-globe">
      <SpinningGlobe />
      <div className="start-screen-content">
        <h1 className="start-title">Geography Game</h1>

        <div className="start-home-actions">
          <button
            type="button"
            className="go-btn"
            disabled={disabled || starting}
            onClick={handleGo}
          >
            <span className="go-btn-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className="go-btn-label">{starting ? "Starting…" : "Go!"}</span>
            <span className="go-btn-sub">Do 10 today.</span>
          </button>

          <button
            type="button"
            className="choice-btn choice-btn-level explore-btn"
            disabled={disabled}
            onClick={() => setStep("explore")}
          >
            <span className="choice-btn-level-title">Explore</span>
            <span className="choice-btn-level-desc">
              Choose countries, capitals, or flags by region.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
