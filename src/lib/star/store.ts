"use client";

// Board state shared by the page, the shell (sidebar incident list) and the command palette.

import { useSyncExternalStore } from "react";
import type { StarIncident, StarNote, StarTrain } from "./types.ts";

export interface BoardState {
  key: string;
  incident: StarIncident | null;
  trains: StarTrain[];
  notes: Map<number, StarNote[]>;
  open: StarIncident[];
  loading: boolean;
}

let state: BoardState = { key: "", incident: null, trains: [], notes: new Map(), open: [], loading: true };
const listeners = new Set<() => void>();

export function getBoard(): BoardState {
  return state;
}

export function setBoard(patch: Partial<BoardState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useBoard(): BoardState {
  return useSyncExternalStore(subscribe, getBoard, getBoard);
}

// ------------------------------------------------------------- acting as

// Stored as the raw organisation code (not JSON), as STaR V2 did, so both versions and the hub's
// storage bridge read the same value. "star_org" is the older key, kept in step.
const ORG_KEY = "star_acting_as";
const ORG_EVENT = "star:org";

function readOrg(): string {
  try {
    return localStorage.getItem(ORG_KEY) || localStorage.getItem("star_org") || "";
  } catch {
    return "";
  }
}

function subscribeOrg(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(ORG_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(ORG_EVENT, cb);
  };
}

export function useOrg(): [string, (v: string) => void] {
  const org = useSyncExternalStore(subscribeOrg, readOrg, () => "");
  const set = (v: string) => {
    try {
      localStorage.setItem(ORG_KEY, v);
      localStorage.setItem("star_org", v);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(ORG_EVENT));
  };
  return [org, set];
}

export function currentOrg(): string {
  return typeof window === "undefined" ? "" : readOrg();
}

// ------------------------------------------------------------- actions

// The palette and the top bar ask the board to act through window events.
export type BoardAction = "add-train" | "export-pdf" | "copy-link" | "new-incident" | "rename-incident" | "close-incident";
const ACTION_EVENT = "star:action";

export function requestAction(a: BoardAction): void {
  window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: a }));
}

export function onAction(handler: (a: BoardAction) => void): () => void {
  const fn = (e: Event) => handler((e as CustomEvent<BoardAction>).detail);
  window.addEventListener(ACTION_EVENT, fn);
  return () => window.removeEventListener(ACTION_EVENT, fn);
}

// Open a train's modules from anywhere (palette, reminders).
const TRAIN_EVENT = "star:open-train";

export function requestOpenTrain(id: number, view: string = "menu"): void {
  window.dispatchEvent(new CustomEvent(TRAIN_EVENT, { detail: { id, view } }));
}

export function onOpenTrain(handler: (id: number, view: string) => void): () => void {
  const fn = (e: Event) => {
    const d = (e as CustomEvent<{ id: number; view: string }>).detail;
    handler(d.id, d.view);
  };
  window.addEventListener(TRAIN_EVENT, fn);
  return () => window.removeEventListener(TRAIN_EVENT, fn);
}
