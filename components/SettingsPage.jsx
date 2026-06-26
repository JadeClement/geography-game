"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import AppHeader from "@/components/AppHeader";
import ThemeToggle from "@/components/ThemeToggle";
import { usePronunciationPrefs } from "@/lib/hooks/usePronunciationPrefs";
import { useSoundPrefs } from "@/lib/hooks/useSoundPrefs";
import { previewCountryPronunciation } from "@/lib/pronunciation";
import {
  getReferencePanelDefaultOpen,
  setReferencePanelDefaultOpen,
} from "@/lib/referencePanelPrefs";
import {
  getCountryClickExpandEnabled,
  setCountryClickExpandEnabled,
} from "@/lib/countryClickExpandPrefs";
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
  settingsVoiceList,
  settingsVoiceOption,
} from "@/lib/ui";

export default function SettingsPage() {
  const [referenceDefaultOpen, setReferenceDefaultOpen] = useState(false);
  const [countryClickExpand, setCountryClickExpand] = useState(true);
  const { volume, setVolume } = useSoundPrefs();
  const { voiceId, voices, setVoiceId } = usePronunciationPrefs();
  const volumePercent = Math.round(volume * 100);

  useEffect(() => {
    setReferenceDefaultOpen(getReferencePanelDefaultOpen());
    setCountryClickExpand(getCountryClickExpandEnabled());
  }, []);

  const handleVolumeChange = (event) => {
    const next = Number(event.target.value) / 100;
    setVolume(next);
  };

  const handleVolumeCommit = () => {
    previewCorrectSound(volume);
  };

  const handlePronunciationPreview = () => {
    previewCountryPronunciation("USA", { voiceId, volume });
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
          <p className={cn(settingsSectionDescription, "mt-4")}>
            Voice used when country and capital names are spoken in Discover and Find modes.
          </p>
          <div className={settingsVoiceList}>
            {voices.map((voice) => (
              <label key={voice.id} className={settingsVoiceOption}>
                <input
                  type="radio"
                  name="pronunciation-voice"
                  value={voice.id}
                  checked={voiceId === voice.id}
                  onChange={() => setVoiceId(voice.id)}
                />
                <span>
                  {voice.label}
                  <span className="text-text-muted"> — {voice.description}</span>
                </span>
              </label>
            ))}
          </div>
          <button type="button" className={secondaryBtn} onClick={handlePronunciationPreview}>
            Test pronunciation
          </button>
        </section>

        <section className={settingsSection}>
          <h2 className={settingsSectionTitle}>Gameplay</h2>
          <p className={settingsSectionDescription}>
            Briefly expand countries when you click them on the map.
          </p>
          <label className={referenceDefaultSetting}>
            <input
              type="checkbox"
              checked={countryClickExpand}
              onChange={(event) => {
                const next = event.target.checked;
                setCountryClickExpand(next);
                setCountryClickExpandEnabled(next);
              }}
            />
            <span>Country click expand</span>
          </label>
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
