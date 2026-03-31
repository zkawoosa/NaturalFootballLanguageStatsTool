"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "nfl-query-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const activeTheme =
      document.documentElement.dataset.theme === "light"
        ? "light"
        : document.documentElement.dataset.theme === "dark"
          ? "dark"
          : "dark";

    setTheme(activeTheme);
    applyTheme(activeTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }

  const nextModeLabel = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextModeLabel} mode`}
      title={`Switch to ${nextModeLabel} mode`}
    >
      <span className="theme-toggle-label">Theme</span>
      <span className="theme-toggle-value">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
