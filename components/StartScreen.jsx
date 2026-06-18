"use client";

import { useState } from "react";
import { GAME_MODES, REGIONS } from "@/lib/regions";

export default function StartScreen({ onStart, disabled }) {
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedRegion, setSelectedRegion] = useState(null);

  const tryStart = (mode, region) => {
    if (mode && region && !disabled) {
      onStart({ mode, region });
    }
  };

  return (
    <div className="start-screen">
      <h1 className="start-title">Geography Game</h1>
      <p className="start-subtitle">Choose a mode and region to begin</p>

      <div className="start-section">
        <div className="start-row">
          <button
            type="button"
            className={`choice-btn ${selectedMode === GAME_MODES.COUNTRIES ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => {
              setSelectedMode(GAME_MODES.COUNTRIES);
              tryStart(GAME_MODES.COUNTRIES, selectedRegion);
            }}
          >
            Countries
          </button>
          <button
            type="button"
            className={`choice-btn ${selectedMode === GAME_MODES.CAPITALS ? "selected" : ""}`}
            disabled={disabled}
            onClick={() => {
              setSelectedMode(GAME_MODES.CAPITALS);
              tryStart(GAME_MODES.CAPITALS, selectedRegion);
            }}
          >
            Capitals
          </button>
        </div>

        <div className="start-region-list">
          {REGIONS.map((region) => (
            <button
              key={region.id}
              type="button"
              className={`choice-btn choice-btn-region ${selectedRegion === region.id ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => {
                setSelectedRegion(region.id);
                tryStart(selectedMode, region.id);
              }}
            >
              {region.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
