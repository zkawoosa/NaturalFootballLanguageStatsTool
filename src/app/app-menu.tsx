"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const THEME_STORAGE_KEY = "nfl-query-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function AppMenu() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [open, setOpen] = useState(false);

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

  return (
    <div className="app-menu-shell">
      <button
        type="button"
        className="app-menu-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="app-menu-toggle-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="app-menu-toggle-label">Menu</span>
      </button>

      {open ? (
        <div className="app-menu-panel">
          <div className="app-menu-group">
            <p className="app-menu-kicker">Operator</p>
            <Link href="/status/login" className="app-menu-link" onClick={() => setOpen(false)}>
              Status login
            </Link>
          </div>

          <div className="app-menu-group">
            <p className="app-menu-kicker">Theme</p>
            <button type="button" className="app-menu-link" onClick={toggleTheme}>
              Switch to {theme === "dark" ? "light" : "dark"} mode
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
