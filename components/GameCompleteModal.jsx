"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import AuthModal from "@/components/AuthModal";
import CelebrationOverlay from "@/components/CelebrationOverlay";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { detectMilestone } from "@/lib/milestones";
import { formatGameScore } from "@/lib/regions";
import { saveScore } from "@/lib/scores";
import { fetchAllMasteryStats } from "@/lib/countryStats";
import { loadCountriesGeoJSON } from "@/lib/countries";
import { getPendingGuestGame } from "@/lib/pendingGuestGame";
import {
  computeWorldlyBeforeAfter,
  getCrossedWorldlyMilestone,
} from "@/lib/worldlyScore";
import { formatElapsedTime } from "@/lib/time";
import { cn } from "@/lib/cn";
import {
  gameCompleteStats,
  gameTimer,
  gameTimerModal,
  modalActions,
  modalCard,
  modalGameContext,
  modalGameContextPart,
  modalMessage,
  modalOverlay,
  modalScore,
  modalTitle,
  primaryBtn,
  secondaryBtn,
} from "@/lib/ui";

const MASTERED_NOUNS = {
  countries: ["country", "countries"],
  capitals: ["capital", "capitals"],
  flags: ["flag", "flags"],
};

function buildGameContextSections({ isGo, isLearning, isReview, modeLabel, regionLabel, levelLabel }) {
  const sections = [];

  if (isGo) sections.push("Go");
  else if (isLearning) sections.push("Learning");
  else if (isReview) sections.push("Review");

  sections.push(`${modeLabel} of ${regionLabel}`);

  if (levelLabel) {
    const levelParts = levelLabel.split(" · ");
    if (levelParts.length > 1) {
      sections.push(levelParts[0], levelParts.slice(1).join(" · "));
    } else {
      sections.push(levelLabel);
    }
  }

  return sections;
}

export default function GameCompleteModal({
  open,
  score,
  rightCount,
  wrongCount,
  total,
  mode,
  region,
  level,
  modeLabel,
  regionLabel,
  levelLabel,
  totalElapsedMs = 0,
  isReview = false,
  isLearning = false,
  isGo = false,
  milestoneStats,
  graduatedCountryNames = [],
  guestSyncState = null,
  canReviewIncorrect = false,
  onReviewIncorrect,
  onPlayAgain,
  onBackToMenu,
}) {
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [saveState, setSaveState] = useState({ loading: false, result: null, error: null });
  const [streakMessage, setStreakMessage] = useState(null);
  const [milestone, setMilestone] = useState(null);
  const [worldly, setWorldly] = useState({ settled: false, crossing: null });
  const milestoneResolvedRef = useRef(false);
  const dialogRef = useFocusTrap(open);

  const signedIn = status === "authenticated" && session?.user;

  useEffect(() => {
    if (!open) {
      setSaveState({ loading: false, result: null, error: null });
      setStreakMessage(null);
      setMilestone(null);
      setWorldly({ settled: false, crossing: null });
      milestoneResolvedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (guestSyncState?.synced) {
      milestoneResolvedRef.current = false;
    }
  }, [guestSyncState?.synced]);

  // Compute the %Worldly score before/after this game and detect whether it
  // crossed a celebration boundary (25/50/75/90/100). Runs once the round's
  // stat saves have settled (mastery snapshot ready) so the fetch is current.
  useEffect(() => {
    if (!open) return undefined;
    if (!signedIn) {
      setWorldly({ settled: true, crossing: null });
      return undefined;
    }
    if (milestoneStats === undefined) return undefined;

    let cancelled = false;
    setWorldly({ settled: false, crossing: null });

    Promise.all([fetchAllMasteryStats(), loadCountriesGeoJSON()])
      .then(([masteryData, geo]) => {
        if (cancelled) return;
        const countryIds = geo.countries.map((country) => country.id);
        const { beforePercent, afterPercent } = computeWorldlyBeforeAfter({
          mastery: masteryData.mastery ?? {},
          countryIds,
          mode,
          level,
          statRecords: milestoneStats?.statRecords ?? {},
        });
        setWorldly({
          settled: true,
          crossing: getCrossedWorldlyMilestone(beforePercent, afterPercent),
        });
      })
      .catch(() => {
        if (!cancelled) setWorldly({ settled: true, crossing: null });
      });

    return () => {
      cancelled = true;
    };
  }, [open, signedIn, milestoneStats, mode, level]);

  // Detect a milestone once both the score save and the mastery snapshot have
  // settled, so the priority ordering uses complete data.
  useEffect(() => {
    if (!open || milestoneResolvedRef.current) return;

    const usingGuestSync = guestSyncState != null;
    const saveSettled =
      !signedIn ||
      isReview ||
      isLearning ||
      (usingGuestSync
        ? !guestSyncState.loading &&
          (guestSyncState.synced || Boolean(guestSyncState.error))
        : saveState.result != null || saveState.error != null);
    const masterySettled = milestoneStats !== undefined;
    if (!saveSettled || !masterySettled || !worldly.settled) return;

    const perfectGame =
      !isReview && !isLearning && total > 0 && rightCount === total && wrongCount === 0;

    const saveResult = usingGuestSync ? guestSyncState.result : saveState.result;

    milestoneResolvedRef.current = true;
    setMilestone(
      detectMilestone({
        saveResult,
        perfectGame,
        milestoneStats,
        worldlyMilestone: worldly.crossing,
        regionLabel,
        modeLabel,
      })
    );
  }, [
    open,
    signedIn,
    isReview,
    isLearning,
    saveState.result,
    saveState.error,
    guestSyncState,
    milestoneStats,
    worldly.settled,
    worldly.crossing,
    total,
    rightCount,
    wrongCount,
    regionLabel,
    modeLabel,
  ]);

  useEffect(() => {
    if (!open || !signedIn) return;

    let cancelled = false;

    // The practice session for today was already recorded server-side while
    // playing, so this reflects the post-game ("after") streak. Compare it with
    // the last value we showed to detect when the streak just incremented.
    fetch("/api/streak")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const current = data.currentStreak || 0;
        if (current <= 0) return;

        let previous = null;
        try {
          const stored = window.localStorage.getItem("worldly:lastStreakSeen");
          previous = stored == null ? null : Number(stored);
        } catch {
          previous = null;
        }

        if (previous == null || current > previous) {
          setStreakMessage(`🔥 ${current} day streak!`);
        }

        try {
          window.localStorage.setItem("worldly:lastStreakSeen", String(current));
        } catch {
          // Ignore storage errors — the message is a non-critical nicety.
        }
      })
      .catch(() => {
        // Network error — just don't show the streak message.
      });

    return () => {
      cancelled = true;
    };
  }, [open, signedIn]);

  useEffect(() => {
    if (!open || !signedIn || isReview || isLearning) return;
    if (getPendingGuestGame()) return;

    let cancelled = false;

    async function attemptSave() {
      setSaveState({ loading: true, result: null, error: null });
      try {
        const result = await saveScore({
          mode,
          region,
          score,
          level,
        });
        if (!cancelled) {
          setSaveState({ loading: false, result, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setSaveState({
            loading: false,
            result: null,
            error: error.message || "Could not save score.",
          });
        }
      }
    }

    attemptSave();
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, isReview, isLearning, mode, region, score, level]);

  if (!open) return null;

  const handleAuthSuccess = () => {
    setAuthOpen(false);
  };

  const activeSaveState = guestSyncState ?? saveState;

  const saveMessage = () => {
    if (!signedIn) {
      return "Sign in or create an account to save your score and track progress.";
    }
    if (activeSaveState.loading) {
      return guestSyncState ? "Saving your game progress…" : "Saving your score…";
    }
    if (activeSaveState.error) {
      return activeSaveState.error;
    }
    if (activeSaveState.result?.isPersonalBest) {
      return activeSaveState.result.previousBest == null
        ? "Score saved — your first result for this game!"
        : `New personal best! Previous best: ${formatGameScore(activeSaveState.result.previousBest, region)}`;
    }
    if (activeSaveState.result && !activeSaveState.result.isPersonalBest) {
      return `Your best for this game is still ${formatGameScore(activeSaveState.result.previousBest, region)}.`;
    }
    return null;
  };

  const message = saveMessage();

  function getMasteredAnnouncement() {
    const count = graduatedCountryNames.length;
    const [singular, plural] = MASTERED_NOUNS[mode] ?? MASTERED_NOUNS.countries;
    const noun = count === 1 ? singular : plural;
    return `You mastered ${count} ${noun} this game!`;
  }

  const contextSections = buildGameContextSections({
    isGo,
    isLearning,
    isReview,
    modeLabel,
    regionLabel,
    levelLabel,
  });

  function getCompletionHeading() {
    if (isGo) {
      const pct = total > 0 ? rightCount / total : 0;
      if (pct === 1) return "Perfect!";
      if (pct >= 0.8) return "Nice work!";
      if (pct >= 0.5) return "Keep it up!";
      return "Keep going!";
    }
    if (isLearning) return "Learning complete!";
    if (isReview) return "Review complete!";
    const pct = total > 0 ? rightCount / total : 0;
    if (pct === 1) return "Perfect!";
    if (pct >= 0.8) return "Nice work!";
    if (pct >= 0.5) return "Keep it up!";
    return "Keep practicing";
  }

  return (
    <>
      <div className={modalOverlay}>
        <div
          ref={dialogRef}
          className={cn(modalCard, "max-w-md")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-complete-title"
        >
          <h2 id="game-complete-title" className={modalTitle}>
            {getCompletionHeading()}
          </h2>
          <p className={modalScore}>
            You scored {rightCount}/{total}
          </p>
          <p className={modalGameContext}>
            {contextSections.map((section, index) => (
              <span key={section + index} className={modalGameContextPart}>
                {index > 0 ? " · " : null}
                {section}
              </span>
            ))}
          </p>
          <div className={gameCompleteStats}>
            <span className={cn(gameTimer, gameTimerModal)}>
              🕐 {formatElapsedTime(totalElapsedMs)}
            </span>
          </div>

          {message && !isReview && !isLearning && (
            <p
              className={modalMessage({
                success: activeSaveState.result?.isPersonalBest,
                error: Boolean(activeSaveState.error),
              })}
            >
              {message}
            </p>
          )}

          {streakMessage && (
            <p className={modalMessage({ className: "text-center font-semibold" })}>
              {streakMessage}
            </p>
          )}

          {graduatedCountryNames.length > 0 && (
            <p className={modalMessage({ success: true, className: "text-center font-semibold" })}>
              🎓 {getMasteredAnnouncement()}
            </p>
          )}

          <div className={modalActions}>
            {!signedIn && (
              <button
                type="button"
                className={primaryBtn}
                onClick={() => setAuthOpen(true)}
              >
                Sign in / Create account
              </button>
            )}
            {signedIn && (
              <Link href="/results" className={secondaryBtn}>
                View results
              </Link>
            )}
            {canReviewIncorrect && (
              <button
                type="button"
                className={primaryBtn}
                onClick={onReviewIncorrect}
              >
                Review incorrect answers ({wrongCount})
              </button>
            )}
            <button type="button" className={secondaryBtn} onClick={onPlayAgain}>
              {isGo ? "Go again!" : isLearning ? "Practice again" : "Play again"}
            </button>
            <button type="button" className={secondaryBtn} onClick={onBackToMenu}>
              Back to menu
            </button>
          </div>
        </div>
      </div>

      <CelebrationOverlay
        milestone={milestone}
        onDismiss={() => setMilestone(null)}
      />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
