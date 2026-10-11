"use client";

// Dark (default) / light theme, persisted per browser. The tokens live in globals.css
// under :root[data-theme="light"]; the root layout applies the stored value before
// paint so there is no flash.

import { useCallback, useEffect } from "react";
import { useLocalStorage } from "./hooks";
import { THEME_KEY } from "./themeScript";

export type Theme = "dark" | "light";

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const [theme, setTheme] = useLocalStorage<Theme>(THEME_KEY, "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);
  return { theme, toggle, setTheme };
}
