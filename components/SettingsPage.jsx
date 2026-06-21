"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ThemeToggle from "@/components/ThemeToggle";
import {
  getReferencePanelDefaultOpen,
  setReferencePanelDefaultOpen,
} from "@/lib/referencePanelPrefs";

export default function SettingsPage() {
  const [referenceDefaultOpen, setReferenceDefaultOpen] = useState(false);

  useEffect(() => {
    setReferenceDefaultOpen(getReferencePanelDefaultOpen());
  }, []);

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

        <section className="settings-section">
          <h2 className="settings-section-title">Learning</h2>
          <p className="settings-section-description">
            Show the country reference panel automatically at the start of each learning round.
          </p>
          <label className="reference-default-setting">
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
