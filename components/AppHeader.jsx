"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import AuthModal from "@/components/AuthModal";
import {
  appHeader,
  appHeaderActions,
  appHeaderBrand,
  appHeaderBrandLink,
  appHeaderSubtitle,
  appHeaderTitle,
  dropdownItem,
  profileAvatar,
  profileBtn,
  profileDropdown,
  profileIcon,
  profileMenu,
  profileName,
  streakBadge,
} from "@/lib/ui";

function ProfileDropdown({ signedIn, userName, onClose, onSignIn, onSignOut }) {
  return (
    <div className={profileDropdown}>
      {signedIn && userName && <p className={profileName}>{userName}</p>}

      <Link href="/settings" className={dropdownItem} onClick={onClose}>
        Settings
      </Link>

      {signedIn ? (
        <>
          <Link href="/mastery" className={dropdownItem} onClick={onClose}>
            Mastery Map
          </Link>
          <Link href="/results" className={dropdownItem} onClick={onClose}>
            Results
          </Link>
          <button type="button" className={dropdownItem} onClick={onSignOut}>
            Sign out
          </button>
        </>
      ) : (
        <button type="button" className={dropdownItem} onClick={onSignIn}>
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
      <span className={appHeaderTitle}>Worldly</span>
      <span className={appHeaderSubtitle}>learning geography</span>
    </>
  );

  return (
    <>
      <header className={appHeader}>
        {onHomeClick ? (
          <button
            type="button"
            className={`${appHeaderBrand} ${appHeaderBrandLink}`}
            onClick={onHomeClick}
          >
            {brandContent}
          </button>
        ) : (
          <Link href="/" className={`${appHeaderBrand} ${appHeaderBrandLink}`}>
            {brandContent}
          </Link>
        )}
        <div className={appHeaderActions}>
          {signedIn && currentStreak > 0 && (
            <span
              className={streakBadge}
              title={`${currentStreak} day practice streak`}
              aria-label={`${currentStreak} day practice streak`}
            >
              <span aria-hidden="true">🔥</span> {currentStreak}
            </span>
          )}
          <div className={profileMenu}>
            <button
              type="button"
              className={profileBtn}
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              {signedIn ? (
                <span className={profileAvatar} aria-hidden="true">
                  {(userName || "?").charAt(0).toUpperCase()}
                </span>
              ) : (
                <span className={profileIcon} aria-hidden="true">
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
