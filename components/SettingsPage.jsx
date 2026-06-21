"use client";

import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import ThemeToggle from "@/components/ThemeToggle";

export default function SettingsPage() {
  return (
    <div className="settings">
      <AppHeader title="Settings" />
      <main className="settings-content">
        <Link href="/" className="settings-back">
          ← Back to game
        </Link>

        <h1 className="settings-title">Settings</h1>

        <section className="settings-section">
          <h2 className="settings-section-title">Appearance</h2>
          <p className="settings-section-description">Choose light or dark mode.</p>
          <ThemeToggle />
        </section>
      </main>
    </div>
  );
}
