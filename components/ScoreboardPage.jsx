"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import Input from "@/components/ui/Input";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { cn } from "@/lib/cn";
import {
  modalClose,
  modalOverlay,
  modalSubtitle,
  modalTitle,
  primaryBtn,
  sbAddBtn,
  sbAddWrap,
  sbAvatar,
  sbBadges,
  sbBanner,
  sbBannerIcon,
  sbBannerText,
  sbList,
  sbModalCard,
  sbName,
  sbRank,
  sbResultAddBtn,
  sbResultAvatar,
  sbResultMain,
  sbResultRow,
  sbRow,
  sbRowMain,
  sbShell,
  sbStats,
  sbStreakBadge,
  sbTab,
  sbTabs,
  sbWorldlyBadge,
  scoreboardBack,
  scoreboardContent,
  scoreboardEmpty,
  scoreboardMessage,
  scoreboardMessageError,
  scoreboardPage,
  scoreboardResultName,
  scoreboardResultUsername,
  scoreboardSignIn,
  scoreboardSubtitle,
  scoreboardTitle,
} from "@/lib/ui";

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

const TABS = [
  { id: "week", label: "This week" },
  { id: "all", label: "All time" },
  { id: "worldly", label: "% Worldly" },
];

const FRIEND_COLORS = ["emerald", "amber", "violet", "rose"];

function avatarColor(entry) {
  if (entry.isYou) return "sky";
  const key = entry.username || entry.id || "";
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return FRIEND_COLORS[hash % FRIEND_COLORS.length];
}

function displayName(entry) {
  if (entry.isYou) return "you";
  return entry.username || entry.name || "player";
}

function initialFor(entry) {
  const source = entry.name || entry.username || "?";
  return source.charAt(0).toUpperCase();
}

function firstName(entry) {
  const source = entry.username || entry.name || "";
  const stem = source.split(/[._\s]/)[0] || source;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function statsLine(entry, tab) {
  const regionPart = entry.region ? ` · ${entry.region} active` : "";
  if (tab === "worldly") {
    return `${entry.worldly}% Worldly${regionPart}`;
  }
  const count = tab === "all" ? entry.sessionsAll : entry.sessionsWeek;
  return `${count} session${count === 1 ? "" : "s"}${regionPart}`;
}

function IconFlame() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12 3s5 3.5 5 8.5A5 5 0 0 1 7 12c0-1.5.6-2.7 1.4-3.6C8.9 10 10 10.5 10 10.5S9 7 12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAddFriend() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 8v6M15 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconArrowUpRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LeaderboardRow({ rank, entry, tab }) {
  return (
    <div className={sbRow({ you: entry.isYou })}>
      <span className={sbRank}>{rank}</span>
      <span className={sbAvatar(avatarColor(entry))} aria-hidden="true">
        {initialFor(entry)}
      </span>
      <div className={sbRowMain}>
        <p className={sbName}>{displayName(entry)}</p>
        <p className={sbStats}>{statsLine(entry, tab)}</p>
      </div>
      <div className={sbBadges}>
        <span className={sbStreakBadge}>
          <IconFlame />
          {entry.streak}d
        </span>
        <span className={sbWorldlyBadge}>{entry.worldly}%</span>
      </div>
    </div>
  );
}

function AddFriendsModal({ open, onClose, existingIds, onAdded, currentUserId, currentUsername }) {
  const dialogRef = useFocusTrap(open);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [pendingId, setPendingId] = useState(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setError(null);
      setHasSearched(false);
      setAddedIds(new Set());
      setPendingId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);
      setError(null);
      setHasSearched(false);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const timeoutId = window.setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed });
      fetch(`/api/users/search?${params}`)
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not search users.");
          return data.users ?? [];
        })
        .then((users) => {
          const normalizedSelf = (currentUsername || "").trim().toLowerCase();
          const filtered = users.filter((user) => {
            if (currentUserId != null && String(user.id) === String(currentUserId)) {
              return false;
            }
            if (
              normalizedSelf &&
              (user.username || "").trim().toLowerCase() === normalizedSelf
            ) {
              return false;
            }
            return true;
          });
          setResults(filtered);
          setHasSearched(true);
          setLoading(false);
        })
        .catch((fetchError) => {
          setError(fetchError.message || "Could not search users.");
          setResults([]);
          setHasSearched(true);
          setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query, open, currentUserId, currentUsername]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleAdd = async (user) => {
    setPendingId(user.id);
    setError(null);
    try {
      const response = await fetch("/api/users/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: user.id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not add friend.");
      setAddedIds((prev) => new Set(prev).add(user.id));
      onAdded?.();
    } catch (addError) {
      setError(addError.message || "Could not add friend.");
    } finally {
      setPendingId(null);
    }
  };

  if (!open) return null;

  return (
    <div className={modalOverlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={sbModalCard}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-friends-title"
      >
        <button type="button" className={modalClose} onClick={onClose} aria-label="Close">
          ×
        </button>

        <h2 id="add-friends-title" className={modalTitle}>
          Add friends
        </h2>
        <p className={modalSubtitle}>
          Search for other players by username to add them to your leaderboard.
        </p>

        <Input
          label="Search by username"
          id="add-friends-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing a username…"
          autoComplete="off"
          spellCheck={false}
          helpText="Enter at least 2 characters."
        />

        {loading && <p className={cn(scoreboardMessage, "mt-3")}>Searching…</p>}
        {error && (
          <p className={cn(scoreboardMessage, scoreboardMessageError, "mt-3")}>{error}</p>
        )}

        {!loading && hasSearched && (
          <div className="mt-3 flex flex-col gap-1">
            {results.length === 0 ? (
              <p className={scoreboardEmpty}>
                No users found matching &ldquo;{query}&rdquo;.
              </p>
            ) : (
              results.map((user) => {
                const alreadyFriend = existingIds.has(user.id) || addedIds.has(user.id);
                return (
                  <div key={user.id} className={sbResultRow}>
                    <span className={sbResultAvatar} aria-hidden="true">
                      {(user.name || user.username || "?").charAt(0).toUpperCase()}
                    </span>
                    <div className={sbResultMain}>
                      <span className={scoreboardResultName}>{user.name}</span>
                      <span className={scoreboardResultUsername}>@{user.username}</span>
                    </div>
                    <button
                      type="button"
                      className={sbResultAddBtn({ added: alreadyFriend })}
                      disabled={alreadyFriend || pendingId === user.id}
                      onClick={() => handleAdd(user)}
                    >
                      {alreadyFriend
                        ? "Added"
                        : pendingId === user.id
                          ? "Adding…"
                          : "Add"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ScoreboardPage() {
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState("week");
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const signedIn = status === "authenticated";

  const loadLeaderboard = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch("/api/leaderboard")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load leaderboard.");
        return data.leaderboard ?? [];
      })
      .then((entries) => {
        setLeaderboard(entries);
        setLoading(false);
      })
      .catch((fetchError) => {
        setError(fetchError.message || "Could not load leaderboard.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setLeaderboard([]);
      setLoading(false);
      setError(null);
      return;
    }
    loadLeaderboard();
  }, [signedIn, loadLeaderboard]);

  const ranked = useMemo(() => {
    const key =
      tab === "worldly" ? "worldly" : tab === "all" ? "sessionsAll" : "sessionsWeek";
    return [...leaderboard].sort((a, b) => {
      if (b[key] !== a[key]) return b[key] - a[key];
      return b.worldly - a.worldly;
    });
  }, [leaderboard, tab]);

  const existingIds = useMemo(
    () => new Set(leaderboard.filter((entry) => !entry.isYou).map((entry) => entry.id)),
    [leaderboard]
  );

  const passedBy = useMemo(() => {
    const you = leaderboard.find((entry) => entry.isYou);
    if (!you) return null;
    return leaderboard
      .filter((entry) => !entry.isYou && entry.streak > you.streak)
      .sort((a, b) => b.streak - a.streak)[0];
  }, [leaderboard]);

  const hasFriends = leaderboard.some((entry) => !entry.isYou);

  return (
    <div className={scoreboardPage}>
      <AppHeader />

      <main className={scoreboardContent}>
        <Link href="/" className={scoreboardBack}>
          ← Back to game
        </Link>

        <h1 className={scoreboardTitle}>Scoreboard</h1>
        <p className={scoreboardSubtitle}>
          See how you stack up against your friends. Add friends to grow your leaderboard.
        </p>

        {status === "loading" && <p className={scoreboardMessage}>Loading…</p>}

        {!signedIn && status !== "loading" && (
          <div className={scoreboardSignIn}>
            <p className={scoreboardMessage}>Sign in to see your friends leaderboard.</p>
            <button type="button" className={primaryBtn} onClick={() => setAuthOpen(true)}>
              Sign in / Create account
            </button>
          </div>
        )}

        {signedIn && loading && <p className={scoreboardMessage}>Loading your leaderboard…</p>}

        {signedIn && error && (
          <p className={cn(scoreboardMessage, scoreboardMessageError)}>{error}</p>
        )}

        {signedIn && !loading && !error && (
          <div className={sbShell}>
            {passedBy && (
              <div className={sbBanner} role="status">
                <span className={sbBannerIcon} aria-hidden="true">
                  <IconFlame />
                </span>
                <p className={sbBannerText}>
                  <strong>{firstName(passedBy)}</strong> just passed your streak!
                </p>
              </div>
            )}

            <div className={sbTabs} role="tablist" aria-label="Leaderboard filter">
              {TABS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === option.id}
                  className={sbTab({ active: tab === option.id })}
                  onClick={() => setTab(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className={sbList}>
              {ranked.map((entry, index) => (
                <LeaderboardRow key={entry.id} rank={index + 1} entry={entry} tab={tab} />
              ))}
            </div>

            {!hasFriends && (
              <p className={cn(scoreboardEmpty, "text-center")}>
                Add friends to see how you compare.
              </p>
            )}

            <div className={sbAddWrap}>
              <button type="button" className={sbAddBtn} onClick={() => setAddOpen(true)}>
                <IconAddFriend />
                Add friends
                <IconArrowUpRight />
              </button>
            </div>
          </div>
        )}
      </main>

      <AddFriendsModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        existingIds={existingIds}
        onAdded={loadLeaderboard}
        currentUserId={session?.user?.id}
        currentUsername={session?.user?.username}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
