"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import AuthModal from "@/components/AuthModal";
import EmailVerificationBanner from "@/components/EmailVerificationBanner";
import UserAvatar from "@/components/UserAvatar";
import { fetchAllMasteryStats } from "@/lib/countryStats";
import { loadCountriesGeoJSON } from "@/lib/countries";
import { useUserProfile } from "@/lib/hooks/useUserProfile";
import { cn } from "@/lib/cn";
import { computeWorldlyScoreFromMastery } from "@/lib/worldlyScore";
import {
  appHeader,
  appHeaderActions,
  appHeaderBrand,
  appHeaderBrandLink,
  appHeaderSubtitle,
  appHeaderTitle,
  appHeaderWorldly,
  appHeaderWorldlyLabel,
  appHeaderWorldlyValue,
  dropdownItem,
  dropdownItemIcon,
  profileAccountLink,
  profileBtn,
  profileDropdown,
  profileHandle,
  profileIcon,
  profileMenu,
  streakBadge,
} from "@/lib/ui";

function DropdownIcon({ children }) {
  return <span className={dropdownItemIcon}>{children}</span>;
}

const menuIcons = {
  settings: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  scoreboard: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 21h8M12 17v4M7 4h10l1 7H6l1-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 11v6M12 11v6M17 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  mastery: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
  results: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 19V5M4 19h16M8 17V9M12 17V7M16 17v-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  howItWorks: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 10v6M12 7h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  signOut: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  signIn: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
};

function ProfileDropdown({ signedIn, userName, username, onClose, onSignIn, onSignOut }) {
  return (
    <div className={profileDropdown}>
      {signedIn && userName && (
        <>
          <Link href="/account" className={profileAccountLink} onClick={onClose}>
            <DropdownIcon>{menuIcons.profile}</DropdownIcon>
            {userName}
          </Link>
          {username && <p className={profileHandle}>@{username}</p>}
        </>
      )}

      <Link href="/settings" className={dropdownItem} onClick={onClose}>
        <DropdownIcon>{menuIcons.settings}</DropdownIcon>
        Settings
      </Link>

      {signedIn ? (
        <>
          <Link href="/scoreboard" className={dropdownItem} onClick={onClose}>
            <DropdownIcon>{menuIcons.scoreboard}</DropdownIcon>
            Scoreboard
          </Link>
          <Link href="/mastery" className={dropdownItem} onClick={onClose}>
            <DropdownIcon>{menuIcons.mastery}</DropdownIcon>
            Mastery Map
          </Link>
          <Link href="/results" className={dropdownItem} onClick={onClose}>
            <DropdownIcon>{menuIcons.results}</DropdownIcon>
            Results
          </Link>
          <Link href="/results/how-it-works" className={dropdownItem} onClick={onClose}>
            <DropdownIcon>{menuIcons.howItWorks}</DropdownIcon>
            How it Works
          </Link>
          <button type="button" className={dropdownItem} onClick={onSignOut}>
            <DropdownIcon>{menuIcons.signOut}</DropdownIcon>
            Sign out
          </button>
        </>
      ) : (
        <button type="button" className={dropdownItem} onClick={onSignIn}>
          <DropdownIcon>{menuIcons.signIn}</DropdownIcon>
          Sign in
        </button>
      )}
    </div>
  );
}

export default function AppHeader({ onHomeClick }) {
  const { data: session, status } = useSession();
  const { avatar: profileAvatar } = useUserProfile();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [worldlyPercent, setWorldlyPercent] = useState(null);

  const signedIn = status === "authenticated" && session?.user;
  const userName = session?.user?.name || session?.user?.email;
  const username = session?.user?.username;

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

  useEffect(() => {
    if (!signedIn) {
      setWorldlyPercent(null);
      return undefined;
    }

    let cancelled = false;

    Promise.all([fetchAllMasteryStats(), loadCountriesGeoJSON()])
      .then(([masteryData, geo]) => {
        if (cancelled) return;
        const countryIds = geo.countries.map((country) => country.id);
        const { percent } = computeWorldlyScoreFromMastery(
          masteryData.mastery ?? {},
          countryIds
        );
        setWorldlyPercent(Math.round(percent));
      })
      .catch(() => {
        // Network error — just don't show the indicator.
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
      <EmailVerificationBanner />
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
          {signedIn && worldlyPercent != null && (
            <Link
              href="/mastery"
              className={appHeaderWorldly}
              title={`You're ${worldlyPercent}% Worldly`}
              aria-label={`You're ${worldlyPercent} percent Worldly`}
            >
              <span className={appHeaderWorldlyValue}>{worldlyPercent}%</span>
              <span className={appHeaderWorldlyLabel}>WORLDLY</span>
            </Link>
          )}
          <div className={profileMenu}>
            <button
              type="button"
              className={cn(
                profileBtn,
                signedIn && "overflow-hidden border-transparent bg-transparent p-0"
              )}
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              {signedIn ? (
                <UserAvatar
                  avatar={profileAvatar}
                  name={userName}
                  username={username}
                  size="sm"
                />
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
                username={username}
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
