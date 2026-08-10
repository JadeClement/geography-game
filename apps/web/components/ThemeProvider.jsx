"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { THEME_STORAGE_KEY, THEMES } from "@/lib/theme";

const ThemeContext = createContext(null);

export default function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(THEMES.DARK);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === THEMES.LIGHT || stored === THEMES.DARK) {
      setThemeState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (nextTheme) => {
    if (nextTheme === THEMES.LIGHT || nextTheme === THEMES.DARK) {
      setThemeState(nextTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
