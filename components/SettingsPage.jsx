"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ThemeToggle from "@/components/ThemeToggle";
import {
  getReferencePanelDefaultOpen,
  setReferencePanelDefaultOpen,
} from "@/lib/referencePanelPrefs";
import {
  referenceDefaultSetting,
  settingsBack,
  settingsContent,
  settingsPage,
  settingsSection,
  settingsSectionDescription,
  settingsSectionTitle,
  settingsTitle,
} from "@/lib/ui";

export default function SettingsPage() {
  const [referenceDefaultOpen, setReferenceDefaultOpen] = useState(false);

  useEffect(() => {
    setReferenceDefaultOpen(getReferencePanelDefaultOpen());
  }, []);

  return (
    <div className={settingsPage}>
      <AppHeader />
      <main className={settingsContent}>
        <Link href="/" className={settingsBack}>
          ← Back to game
        </Link>

        <h1 className={settingsTitle}>Settings</h1>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>Appearance</h2>
          <p className={settingsSectionDescription}>Choose light or dark mode.</p>
          <ThemeToggle />
        </section>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>Learning</h2>
          <p className={settingsSectionDescription}>
            Show the country reference panel automatically at the start of each learning round.
          </p>
          <label className={referenceDefaultSetting}>
            <input
              type="checkbox"
              checked={referenceDefaultOpen}
              onChange={(event) => {
                const next = event.target.checked;
                setReferenceDefaultOpen(next);
                setReferencePanelDefaultOpen(next);
              }}
            />
            <span>Reference panel on by default</span>
          </label>
        </section>
      </main>
    </div>
  );
}
