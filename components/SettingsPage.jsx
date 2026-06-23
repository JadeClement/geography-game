"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import ThemeToggle from "@/components/ThemeToggle";
import { useSoundPrefs } from "@/lib/hooks/useSoundPrefs";
import {
  getReferencePanelDefaultOpen,
  setReferencePanelDefaultOpen,
} from "@/lib/referencePanelPrefs";
import { previewCorrectSound } from "@/lib/sounds";
import {
  referenceDefaultSetting,
  secondaryBtn,
  settingsBack,
  settingsContent,
  settingsPage,
  settingsSection,
  settingsSectionDescription,
  settingsSectionTitle,
  settingsTitle,
  settingsVolumeControl,
  settingsVolumeRow,
  settingsVolumeSlider,
  settingsVolumeValue,
} from "@/lib/ui";

export default function SettingsPage() {
  const [referenceDefaultOpen, setReferenceDefaultOpen] = useState(false);
  const { volume, setVolume } = useSoundPrefs();
  const volumePercent = Math.round(volume * 100);

  useEffect(() => {
    setReferenceDefaultOpen(getReferencePanelDefaultOpen());
  }, []);

  const handleVolumeChange = (event) => {
    const next = Number(event.target.value) / 100;
    setVolume(next);
  };

  const handleVolumeCommit = () => {
    previewCorrectSound(volume);
  };

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
          <h2 className={settingsSectionTitle}>Sound</h2>
          <p className={settingsSectionDescription}>
            Default volume for game sounds. Use the speaker button during a game to mute or
            unmute.
          </p>
          <div className={settingsVolumeControl}>
            <div className={settingsVolumeRow}>
              <input
                id="sound-volume"
                type="range"
                min={0}
                max={100}
                step={5}
                value={volumePercent}
                className={settingsVolumeSlider}
                aria-label="Default sound volume"
                onChange={handleVolumeChange}
                onMouseUp={handleVolumeCommit}
                onTouchEnd={handleVolumeCommit}
                onKeyUp={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    handleVolumeCommit();
                  }
                }}
              />
              <span className={settingsVolumeValue}>{volumePercent}%</span>
            </div>
            <button type="button" className={secondaryBtn} onClick={handleVolumeCommit}>
              Test sound
            </button>
          </div>
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
