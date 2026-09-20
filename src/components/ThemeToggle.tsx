"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/** Applied before paint by the inline script in the layout; kept in step here. */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  // Read on mount rather than during render: the server has no way to know
  // which theme this browser stored, and guessing would mismatch hydration.
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(currentTheme());
    setReady(true);
    // Colour transitions are enabled only after the first paint, so the page
    // does not animate its own arrival.
    document.documentElement.classList.add("theme-ready");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("marsworks-theme", next);
    } catch {
      // Private browsing or blocked storage: the choice simply will not persist.
    }
  }

  return (
    <button
      type="button"
      data-tour="theme"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light theme" : "Dark theme"}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line text-ink-3 transition-colors hover:border-accent/50 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Until mounted the icon would be a guess, so render neither. */}
      {ready ? (
        theme === "dark" ? (
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M8 1.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 1.5Zm0 10a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 11.5ZM14.5 8a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 14.5 8Zm-10 0a.75.75 0 0 1-.75.75h-1a.75.75 0 0 1 0-1.5h1A.75.75 0 0 1 4.5 8Zm8.09-4.59a.75.75 0 0 1 0 1.06l-.7.71a.75.75 0 1 1-1.07-1.06l.71-.71a.75.75 0 0 1 1.06 0ZM5.18 10.82a.75.75 0 0 1 0 1.06l-.71.71a.75.75 0 0 1-1.06-1.06l.71-.71a.75.75 0 0 1 1.06 0Zm7.41 1.77a.75.75 0 0 1-1.06 0l-.71-.71a.75.75 0 1 1 1.06-1.06l.71.71a.75.75 0 0 1 0 1.06ZM5.18 5.18a.75.75 0 0 1-1.06 0l-.71-.71a.75.75 0 0 1 1.06-1.06l.71.7a.75.75 0 0 1 0 1.07ZM8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M13.2 9.9A5.6 5.6 0 0 1 6.1 2.8a.6.6 0 0 0-.82-.7 6.8 6.8 0 1 0 8.62 8.62.6.6 0 0 0-.7-.82Z" />
          </svg>
        )
      ) : (
        <span className="h-4 w-4" />
      )}
    </button>
  );
}
