"use client";

// Small shared client hooks: clock, count-up numbers, hotkeys, local storage and clipboard
// (from the Autumn Hub kit).

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

export function useNow(intervalMs = 30000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Animates a number from its previous value to `value` (instant when the user
// prefers reduced motion).
export function useCountUp(value: number, duration = 700): number {
  const target = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    const dur = prefersReducedMotion() ? 0 : duration;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = dur === 0 ? 1 : Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (target - a) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

// combo: "mod+k", "mod+s", "escape"  (mod = Ctrl on Windows/Linux, Cmd on Mac)
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, opts: { inInputs?: boolean } = {}) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  const inInputs = opts.inInputs ?? false;
  useEffect(() => {
    const parts = combo.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    const needMod = parts.includes("mod");
    const needShift = parts.includes("shift");
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (needMod !== mod) return;
      if (needShift !== e.shiftKey) return;
      if (e.key.toLowerCase() !== key) return;
      const target = e.target as HTMLElement | null;
      const inInput =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (inInput && !inInputs && !needMod && key !== "escape") return;
      e.preventDefault();
      ref.current(e);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, inInputs]);
}

// localStorage-backed state via useSyncExternalStore (SSR-safe, no effect
// setState). Changes made through `set` notify every subscriber on the page.
const LS_EVENT = "star:localstorage";
function subscribeLs(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(LS_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LS_EVENT, cb);
  };
}
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const raw = useSyncExternalStore(
    subscribeLs,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null
  );
  const value = useMemo<T>(() => {
    if (raw == null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  }, [raw, initial]);
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      const next = typeof v === "function" ? (v as (p: T) => T)(value) : v;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event(LS_EVENT));
    },
    [key, value]
  );
  return [value, set];
}

export function useCopy(resetMs = 1600): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), resetMs);
      } catch {
        /* clipboard unavailable */
      }
    },
    [resetMs]
  );
  return { copied, copy };
}

// True once mounted in the browser: gate clock-dependent text so server and client render alike.
const noop = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
