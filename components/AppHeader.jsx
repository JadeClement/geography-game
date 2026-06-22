"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import AuthModal from "@/components/AuthModal";

function ProfileDropdown({ signedIn, userName, onClose, onSignIn, onSignOut }) {
  return (
    <div className="profile-dropdown">
      {signedIn && userName && <p className="profile-name">{userName}</p>}

      <Link href="/settings" className="dropdown-item" onClick={onClose}>
        Settings
      </Link>

      {signedIn ? (
        <>
          <Link href="/mastery" className="dropdown-item" onClick={onClose}>
            Mastery Map
          </Link>
          <Link href="/results" className="dropdown-item" onClick={onClose}>
            Results
          </Link>
          <button type="button" className="dropdown-item" onClick={onSignOut}>
            Sign out
          </button>
        </>
      ) : (
        <button type="button" className="dropdown-item" onClick={onSignIn}>
          Sign in
        </button>
      )}
    </div>
  );
}

export default function AppHeader({ onHomeClick }) {
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);

  const signedIn = status === "authenticated" && session?.user;
  const userName = session?.user?.name || session?.user?.email;

  useEffect(() => {
    if (!signedIn) {
      setCurrentStreak(0);
      return;
    }

    let cancelled = false;

    fetch("/api/streak")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setCurrentStreak(data.currentStreak || 0);
        }
      })
      .catch(() => {
        // Network error — just don't show the badge.
      });

    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const closeMenu = () => setMenuOpen(false);

  const brandContent = (
    <>
      <span className="app-header-title">Worldly</span>
      <span className="app-header-subtitle">learning geography</span>
    </>
  );

  return (
    <>
      <header className="app-header">
        {onHomeClick ? (
          <button
            type="button"
            className="app-header-brand app-header-brand-link"
            onClick={onHomeClick}
          >
            {brandContent}
          </button>
        ) : (
          <Link href="/" className="app-header-brand app-header-brand-link">
            {brandContent}
          </Link>
        )}
        <div className="app-header-actions">
          {signedIn && currentStreak > 0 && (
            <span
              className="streak-badge"
              title={`${currentStreak} day practice streak`}
              aria-label={`${currentStreak} day practice streak`}
            >
              <span aria-hidden="true">🔥</span> {currentStreak}
            </span>
          )}
          <div className="profile-menu">
            <button
              type="button"
              className="profile-btn"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              {signedIn ? (
                <span className="profile-avatar" aria-hidden="true">
                  {(userName || "?").charAt(0).toUpperCase()}
                </span>
              ) : (
                <span className="profile-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <path
                      d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              )}
            </button>
            {menuOpen && (
              <ProfileDropdown
                signedIn={signedIn}
                userName={userName}
                onClose={closeMenu}
                onSignIn={() => {
                  closeMenu();
                  setAuthOpen(true);
                }}
                onSignOut={() => {
                  closeMenu();
                  signOut();
                }}
              />
            )}
          </div>
        </div>
      </header>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
