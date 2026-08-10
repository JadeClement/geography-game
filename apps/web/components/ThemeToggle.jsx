"use client";

import { useTheme } from "@/components/ThemeProvider";
import { THEMES } from "@/lib/theme";
import { themeToggle, themeToggleBtn } from "@/lib/ui";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className={themeToggle} role="group" aria-label="Color theme">
      <button
        type="button"
        className={themeToggleBtn({ selected: theme === THEMES.LIGHT })}
        onClick={() => setTheme(THEMES.LIGHT)}
      >
        Light
      </button>
      <button
        type="button"
        className={themeToggleBtn({ selected: theme === THEMES.DARK })}
        onClick={() => setTheme(THEMES.DARK)}
      >
        Dark
      </button>
    </div>
  );
}
