"use client";

import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import AuthModal from "@/components/AuthModal";

export default function AppHeader({ title = "Geography Game" }) {
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const signedIn = status === "authenticated" && session?.user;

  return (
    <>
      <header className="app-header">
        <span className="app-header-title">{title}</span>
        <div className="app-header-actions">
          {signedIn ? (
            <div className="profile-menu">
              <button
                type="button"
                className="profile-btn"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Account menu"
                aria-expanded={menuOpen}
              >
                <span className="profile-avatar" aria-hidden="true">
                  {(session.user.name || session.user.email || "?")
                    .charAt(0)
                    .toUpperCase()}
                </span>
              </button>
              {menuOpen && (
                <div className="profile-dropdown">
                  <p className="profile-name">{session.user.name || session.user.email}</p>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="profile-btn"
              onClick={() => setAuthOpen(true)}
              aria-label="Sign in or create account"
            >
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
            </button>
          )}
        </div>
      </header>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
