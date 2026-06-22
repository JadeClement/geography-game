"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import RegionMapPicker from "@/components/RegionMapPicker";
import StartBackButton from "@/components/StartBackButton";
import SpaceBackground from "@/components/SpaceBackground";
import SpinningGlobe from "@/components/SpinningGlobe";
import { fetchWeakCountryStats } from "@/lib/countryStats";
import { GAME_TYPES, LEARNING_SESSION_SIZES } from "@/lib/gameTypes";
import { getLevelLabel, LEVEL_SECTIONS } from "@/lib/levels";
import { GAME_MODES, REGIONS, getModeLabel } from "@/lib/regions";
import {
  START_STEPS,
  buildStartScreenUrl,
  normalizeStartScreenRoute,
  parseStartScreenSearchParams,
} from "@/lib/startNavigation";

function StartStepHeader({ title, subtitle }) {
  return (
    <div className="start-step-header">
      <h1 className="start-title">{title}</h1>
      {subtitle && <p className="start-subtitle">{subtitle}</p>}
    </div>
  );
}

export default function StartScreen({ onStart, disabled, countries = [] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [selectedSessionSize, setSelectedSessionSize] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [weakCount, setWeakCount] = useState(null);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakError, setWeakError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [weakReloadKey, setWeakReloadKey] = useState(0);
  const [exploreMode, setExploreMode] = useState(null);
  const [exploreRegion, setExploreRegion] = useState(null);
  const pendingExploreAdvanceRef = useRef(false);

  const route = normalizeStartScreenRoute(parseStartScreenSearchParams(searchParams));
  const { step, mode: selectedMode, region: selectedRegion, gameType: selectedGameType, level: selectedLevel } =
    route;

  const signedIn = status === "authenticated" && session?.user;
  const isLearning = selectedGameType === GAME_TYPES.LEARNING;

  const navigate = useCallback(
    (next, { replace = false } = {}) => {
      const url = buildStartScreenUrl(next);
      if (replace) router.replace(url);
      else router.push(url);
    },
    [router]
  );

  const goBack = () => router.back();

  const goBackToExplore = () => {
    pendingExploreAdvanceRef.current = false;
    navigate({ step: START_STEPS.EXPLORE }, { replace: true });
  };

  useEffect(() => {
    const parsed = parseStartScreenSearchParams(searchParams);
    const normalized = normalizeStartScreenRoute(parsed);
    const parsedUrl = buildStartScreenUrl(parsed);
    const normalizedUrl = buildStartScreenUrl(normalized);
    if (parsedUrl !== normalizedUrl) {
      router.replace(normalizedUrl);
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (step !== START_STEPS.EXPLORE) return;
    setExploreMode(null);
    setExploreRegion(null);
    pendingExploreAdvanceRef.current = false;
  }, [step]);

  // Advance from Explore once both mode and region are chosen.
  useEffect(() => {
    if (step !== START_STEPS.EXPLORE || !pendingExploreAdvanceRef.current) return;
    if (!exploreMode || !exploreRegion || disabled) return;

    pendingExploreAdvanceRef.current = false;
    navigate({
      step: START_STEPS.CHOOSE_TYPE,
      mode: exploreMode,
      region: exploreRegion,
    });
  }, [step, exploreMode, exploreRegion, disabled, navigate]);

  useEffect(() => {
    if (
      step !== START_STEPS.LEARNING_SIZE ||
      !isLearning ||
      !signedIn ||
      !selectedMode ||
      !selectedRegion ||
      selectedLevel == null
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
      selectedLevel == null ||
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
    setExploreMode(mode);
    pendingExploreAdvanceRef.current = true;
  };

  const handleRegionSelect = (regionId) => {
    setExploreRegion(regionId);
    pendingExploreAdvanceRef.current = true;
  };

  const getSectionSubtitle = (section) => {
    if (selectedMode === GAME_MODES.FLAGS) {
      if (section.id === "find") {
        return "Given a flag, click the country on the map.";
      }
      if (section.id === "name") {
        return "Given a flag, type the country's name.";
      }
    }
    return section.subtitle;
  };

  if (step === START_STEPS.LEARNING_SIZE) {
    const learningLocked = weakCount === 0;
    const regionLabel = REGIONS.find((region) => region.id === selectedRegion)?.label;

    return (
      <div className="start-screen start-screen--sub">
        <StartBackButton onClick={goBack} />
        <StartStepHeader
          title="Learning session"
          subtitle={`${getModeLabel(selectedMode)} · ${regionLabel} · ${getLevelLabel(selectedLevel)}`}
        />

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
      </div>
    );
  }

  if (step === START_STEPS.LEVEL) {
    return (
      <div className="start-screen start-screen--sub start-screen--level">
        <StartBackButton onClick={goBack} />
        <StartStepHeader
          title="Choose a level"
          subtitle={`${isLearning ? "Learn · " : "Test · "}${getModeLabel(selectedMode)} · ${
            REGIONS.find((region) => region.id === selectedRegion)?.label
          }`}
        />

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
                        setSelectedSessionSize(null);
                        navigate({
                          step: START_STEPS.LEARNING_SIZE,
                          mode: selectedMode,
                          region: selectedRegion,
                          gameType: GAME_TYPES.LEARNING,
                          level: option.level,
                        });
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
      </div>
    );
  }

  if (step === START_STEPS.CHOOSE_TYPE) {
    const regionLabel = REGIONS.find((region) => region.id === selectedRegion)?.label;
    const learnDisabled = disabled || !signedIn;

    return (
      <div className="start-screen start-screen--sub">
        <StartBackButton onClick={goBackToExplore} />
        <StartStepHeader
          title="Test or Learn?"
          subtitle={`${getModeLabel(selectedMode)} · ${regionLabel}`}
        />

        <div className="start-section start-game-type-list">
          <button
            type="button"
            className="choice-btn choice-btn-level"
            disabled={disabled}
            onClick={() => {
              navigate({
                step: START_STEPS.LEVEL,
                mode: selectedMode,
                region: selectedRegion,
                gameType: GAME_TYPES.TEST,
              });
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
              navigate({
                step: START_STEPS.LEVEL,
                mode: selectedMode,
                region: selectedRegion,
                gameType: GAME_TYPES.LEARNING,
              });
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

        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  if (step === START_STEPS.EXPLORE) {
    return (
      <div className="start-screen start-screen--sub start-screen--explore">
        <StartBackButton onClick={goBack} />
        <StartStepHeader
          title="Explore"
          subtitle="Pick what to practice and where."
        />

        <div className="start-section start-section--wide">
          <div className="start-row start-mode-row">
            <button
              type="button"
              className={`choice-btn ${exploreMode === GAME_MODES.COUNTRIES ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => handleModeSelect(GAME_MODES.COUNTRIES)}
            >
              Countries
            </button>
            <button
              type="button"
              className={`choice-btn ${exploreMode === GAME_MODES.CAPITALS ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => handleModeSelect(GAME_MODES.CAPITALS)}
            >
              Capitals
            </button>
            <button
              type="button"
              className={`choice-btn ${exploreMode === GAME_MODES.FLAGS ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => handleModeSelect(GAME_MODES.FLAGS)}
            >
              Flags
            </button>
          </div>

          <RegionMapPicker
            countries={countries}
            selectedRegion={exploreRegion}
            onSelect={handleRegionSelect}
            disabled={disabled}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="start-screen start-screen--with-globe">
      <SpaceBackground />
      <SpinningGlobe />
      <div className="start-screen-content">
        <h1 className="start-title">Worldly</h1>
        <p className="start-subtitle start-brand-subtitle">learning geography</p>

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
            onClick={() => navigate({ step: START_STEPS.EXPLORE })}
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
