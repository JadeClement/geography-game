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
import { LEVEL_SECTIONS } from "@/lib/levels";
import { GAME_MODES, REGIONS, getModeLabel } from "@/lib/regions";
import {
  DEFAULT_LEARN_LEVEL,
  START_STEPS,
  buildStartScreenUrl,
  normalizeStartScreenRoute,
  parseStartScreenSearchParams,
} from "@/lib/startNavigation";
import { cn } from "@/lib/cn";
import { buildHomeGreeting } from "@/lib/homeGreeting";
import {
  choiceBtnLevel,
  choiceBtnLevelDesc,
  choiceBtnLevelTitle,
  exploreBtn,
  exploreBtnDesc,
  gameTypeBtnDiscover,
  gameTypeBtnLearn,
  gameTypeBtnTest,
  goBtn,
  goBtnIcon,
  goBtnLabel,
  goBtnSub,
  primaryBtn,
  secondaryBtn,
  startBrandSubtitle,
  startGameTypeList,
  startGlobeSpacer,
  startHeroTitleGroup,
  startHomeActions,
  startHomeGreeting,
  startLevelList,
  startLevelBtn,
  startLevelSection,
  startLevelSectionDesc,
  startLevelSectionHeader,
  startLevelSectionList,
  startLevelSections,
  startLevelSectionTitle,
  startMessage,
  startMessageError,
  startModeBtn,
  startModeRow,
  startRow,
  startScreen,
  startScreenContent,
  startScreenExplore,
  startScreenSub,
  startScreenWithGlobe,
  startSection,
  startExploreSection,
  startSectionWide,
  startStepHeader,
  startSubtitle,
  startTitle,
  startTitleGlobe,
} from "@/lib/ui";

function StartStepHeader({ title, subtitle }) {
  return (
    <div className={startStepHeader}>
      <h1 className={startTitle}>{title}</h1>
      {subtitle && <p className={startSubtitle}>{subtitle}</p>}
    </div>
  );
}

export default function StartScreen({ onStart, gameReady = false, countries = [] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [selectedSessionSize, setSelectedSessionSize] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authPendingLearn, setAuthPendingLearn] = useState(false);
  const [weakCount, setWeakCount] = useState(null);
  const [weakLoading, setWeakLoading] = useState(false);
  const [weakError, setWeakError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [weakReloadKey, setWeakReloadKey] = useState(0);
  const [exploreMode, setExploreMode] = useState(null);
  const [exploreRegion, setExploreRegion] = useState(null);
  const [homeGreeting, setHomeGreeting] = useState(null);
  const pendingExploreAdvanceRef = useRef(false);

  const route = normalizeStartScreenRoute(parseStartScreenSearchParams(searchParams));
  const { step, mode: selectedMode, region: selectedRegion, gameType: selectedGameType, level: selectedLevel } =
    route;

  const signedIn = status === "authenticated" && session?.user;
  const isLearning = selectedGameType === GAME_TYPES.LEARNING;

  useEffect(() => {
    if (!signedIn) {
      setHomeGreeting(null);
      return;
    }
    setHomeGreeting(buildHomeGreeting(session.user));
  }, [signedIn, session?.user?.name, session?.user?.username]);

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
    if (!exploreMode || !exploreRegion) return;

    pendingExploreAdvanceRef.current = false;
    navigate({
      step: START_STEPS.CHOOSE_TYPE,
      mode: exploreMode,
      region: exploreRegion,
    });
  }, [step, exploreMode, exploreRegion, navigate]);

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

  const handleGo = () => {
    if (!gameReady || starting) return;
    navigate({ step: START_STEPS.GO_REGION });
  };

  const handleGoRegionSelect = async (regionId) => {
    if (!gameReady || starting) return;
    setStarting(true);
    try {
      await onStart({ go: true, region: regionId });
    } finally {
      setStarting(false);
    }
  };

  const handleTestStart = (level) => {
    if (selectedMode && selectedRegion && gameReady) {
      onStart({
        gameType: GAME_TYPES.TEST,
        mode: selectedMode,
        region: selectedRegion,
        level,
      });
    }
  };

  const handleDiscoverStart = () => {
    if (selectedMode && selectedRegion && gameReady) {
      onStart({
        gameType: GAME_TYPES.DISCOVER,
        mode: selectedMode,
        region: selectedRegion,
      });
    }
  };

  const handleLearningStart = async () => {
    if (
      !selectedMode ||
      !selectedRegion ||
      selectedLevel == null ||
      !selectedSessionSize ||
      !gameReady ||
      starting
    ) {
      return;
    }

    setStarting(true);
    try {
      const result = await onStart({
        gameType: GAME_TYPES.LEARNING,
        mode: selectedMode,
        region: selectedRegion,
        level: selectedLevel,
        learningSessionSize: selectedSessionSize,
      });
      if (result?.ok === false) {
        if (result.reason === "no-eligible") {
          setWeakError(
            "No countries to practice yet. Play Test mode first to build your learning queue."
          );
        } else {
          setWeakError(result.message || "Could not start learning session. Please try again.");
        }
      }
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
      <div className={cn(startScreen, startScreenSub)}>
        <StartBackButton onClick={goBack} />
        <StartStepHeader
          title="Learning session"
          subtitle={`${getModeLabel(selectedMode)} · ${regionLabel}`}
        />

        {weakLoading && <p className={startSubtitle}>Checking your learning list…</p>}
        {weakError && (
          <div className={startMessageError()}>
            <p>{weakError}</p>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setWeakReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </div>
        )}

        {!weakLoading && !weakError && learningLocked && (
          <p className={startMessage}>
            Play Test mode first to build your learning list. Learning focuses on countries you
            have missed at least once.
          </p>
        )}

        {!weakLoading && !weakError && !learningLocked && (
          <div className={cn(startSection, startLevelList)}>
            <p className={startSubtitle}>
              {weakCount} {weakCount === 1 ? "country" : "countries"} in your learning list
            </p>
            {LEARNING_SESSION_SIZES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={choiceBtnLevel({
                  selected: selectedSessionSize === option.id,
                  disabled: !gameReady || starting,
                })}
                disabled={!gameReady || starting}
                onClick={() => setSelectedSessionSize(option.id)}
              >
                <span className={choiceBtnLevelTitle}>{option.label}</span>
              </button>
            ))}
            <button
              type="button"
              className={cn(primaryBtn, "mt-1 w-full")}
              disabled={!selectedSessionSize || !gameReady || starting}
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
      <div className={cn(startScreen, startScreenSub)}>
        <StartBackButton onClick={goBack} />
        <StartStepHeader
          title="Choose a level"
          subtitle={`Test · ${getModeLabel(selectedMode)} · ${
            REGIONS.find((region) => region.id === selectedRegion)?.label
          }`}
        />

        <div className={startLevelSections}>
          {LEVEL_SECTIONS.map((section) => (
            <div key={section.id} className={startLevelSection}>
              <div className={startLevelSectionHeader}>
                <h2 className={startLevelSectionTitle}>{section.title}</h2>
                {getSectionSubtitle(section) && (
                  <p className={startLevelSectionDesc}>{getSectionSubtitle(section)}</p>
                )}
              </div>
              <div className={cn(startSection, startLevelSectionList, startLevelList)}>
                {section.levels.map((option) => (
                  <button
                    key={option.level}
                    type="button"
                    className={cn(
                      choiceBtnLevel({ disabled: !gameReady }),
                      startLevelBtn,
                    )}
                    disabled={!gameReady}
                    onClick={() => handleTestStart(option.level)}
                  >
                    <span className={choiceBtnLevelTitle}>{option.title}</span>
                    <span className={choiceBtnLevelDesc}>{option.description}</span>
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

    // Learn skips the level step — the mixed-question engine ignores the level,
    // so we go straight to picking the session size with the canonical level.
    const goToLearningSize = () => {
      setSelectedSessionSize(null);
      navigate({
        step: START_STEPS.LEARNING_SIZE,
        mode: selectedMode,
        region: selectedRegion,
        gameType: GAME_TYPES.LEARNING,
        level: DEFAULT_LEARN_LEVEL,
      });
    };

    const handleLearnSelect = () => {
      if (!signedIn) {
        setAuthPendingLearn(true);
        setAuthOpen(true);
        return;
      }
      goToLearningSize();
    };

    const handleAuthClose = () => {
      setAuthOpen(false);
      setAuthPendingLearn(false);
    };

    const handleAuthSuccess = () => {
      if (authPendingLearn && selectedMode && selectedRegion) {
        goToLearningSize();
      }
      setAuthPendingLearn(false);
    };

    return (
      <div className={cn(startScreen, startScreenSub)}>
        <StartBackButton onClick={goBackToExplore} />
        <StartStepHeader
          title="Discover, Test, or Learn?"
          subtitle={`${getModeLabel(selectedMode)} · ${regionLabel}`}
        />

        <div className={cn(startSection, startGameTypeList)}>
          <button
            type="button"
            className={choiceBtnLevel({ disabled: !gameReady, className: gameTypeBtnDiscover })}
            disabled={!gameReady}
            onClick={handleDiscoverStart}
          >
            <span className={choiceBtnLevelTitle}>Discover</span>
            <span className={choiceBtnLevelDesc}>Tap countries to see their names. No score.</span>
          </button>
          <button
            type="button"
            className={choiceBtnLevel({ className: gameTypeBtnTest })}
            onClick={() => {
              navigate({
                step: START_STEPS.LEVEL,
                mode: selectedMode,
                region: selectedRegion,
                gameType: GAME_TYPES.TEST,
              });
            }}
          >
            <span className={choiceBtnLevelTitle}>Test</span>
            <span className={choiceBtnLevelDesc}>Full quiz — builds your learning list.</span>
          </button>
          <button
            type="button"
            className={choiceBtnLevel({ className: gameTypeBtnLearn })}
            onClick={handleLearnSelect}
          >
            <span className={choiceBtnLevelTitle}>Learn</span>
            <span className={choiceBtnLevelDesc}>Build knowledge with varied questions.</span>
          </button>
        </div>

        <AuthModal
          open={authOpen}
          onClose={handleAuthClose}
          onSuccess={handleAuthSuccess}
          signInSubtitle="Please sign in to use Learn."
        />
      </div>
    );
  }

  if (step === START_STEPS.GO_REGION) {
    return (
      <div className={cn(startScreen, startScreenSub, startScreenExplore)}>
        <StartBackButton onClick={() => navigate({ step: START_STEPS.HOME }, { replace: true })} />
        <StartStepHeader
          title="Pick a region"
          subtitle="10 countries from your learning list in this region."
        />

        <div className={startExploreSection}>
          {starting && <p className={startSubtitle}>Starting…</p>}
          <RegionMapPicker
            countries={countries}
            selectedRegion={null}
            onSelect={handleGoRegionSelect}
            disabled={!gameReady || starting}
          />
        </div>
      </div>
    );
  }

  if (step === START_STEPS.EXPLORE) {
    return (
      <div className={cn(startScreen, startScreenSub, startScreenExplore)}>
        <StartBackButton onClick={goBack} />
        <StartStepHeader
          title="Explore"
          subtitle="Choose what to practice and where."
        />

        <div className={startExploreSection}>
          <div className={cn(startRow, startModeRow, "mx-auto w-full max-w-xl")}>
            <button
              type="button"
              className={startModeBtn({ selected: exploreMode === GAME_MODES.COUNTRIES })}
              onClick={() => handleModeSelect(GAME_MODES.COUNTRIES)}
            >
              Countries
            </button>
            <button
              type="button"
              className={startModeBtn({ selected: exploreMode === GAME_MODES.CAPITALS })}
              onClick={() => handleModeSelect(GAME_MODES.CAPITALS)}
            >
              Capitals
            </button>
            <button
              type="button"
              className={startModeBtn({ selected: exploreMode === GAME_MODES.FLAGS })}
              onClick={() => handleModeSelect(GAME_MODES.FLAGS)}
            >
              Flags
            </button>
          </div>

          <RegionMapPicker
            countries={countries}
            selectedRegion={exploreRegion}
            onSelect={handleRegionSelect}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(startScreen, startScreenWithGlobe)}>
      <SpaceBackground />
      <SpinningGlobe />
      {homeGreeting && <p className={startHomeGreeting}>{homeGreeting}</p>}
      <div className={startScreenContent}>
        <div className={startHeroTitleGroup}>
          <h1 className={startTitleGlobe}>Worldly</h1>
          <p className={cn(startSubtitle, startBrandSubtitle)}>learning geography</p>
        </div>

        <div className={startGlobeSpacer} aria-hidden="true" />

        <div className={startHomeActions}>
          <button
            type="button"
            className={goBtn}
            disabled={!gameReady || starting}
            onClick={handleGo}
          >
            <span className={goBtnIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <span className={goBtnLabel}>{starting ? "Starting…" : "Go!"}</span>
            <span className={goBtnSub}>Learn 10 countries today.</span>
          </button>

          <button
            type="button"
            className={choiceBtnLevel({ className: exploreBtn })}
            onClick={() => navigate({ step: START_STEPS.EXPLORE })}
          >
            <span className={choiceBtnLevelTitle}>Explore</span>
            <span className={exploreBtnDesc}>
              Choose countries, capitals, or flags by region.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
