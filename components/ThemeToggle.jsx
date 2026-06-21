"use client";

import { useTheme } from "@/components/ThemeProvider";
import { THEMES } from "@/lib/theme";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      <button
        type="button"
        className={`theme-toggle-btn ${theme === THEMES.LIGHT ? "selected" : ""}`}
        onClick={() => setTheme(THEMES.LIGHT)}
      >
        Light
      </button>
      <button
        type="button"
        className={`theme-toggle-btn ${theme === THEMES.DARK ? "selected" : ""}`}
        onClick={() => setTheme(THEMES.DARK)}
      >
        Dark
      </button>
    </div>
  );
}
