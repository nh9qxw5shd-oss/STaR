"use client";

// Command palette (Ctrl/Cmd + K): actions, open incidents and the trains on the board.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CornerDownLeft, FileDown, Link2, LucideIcon, Plus, Search, Siren, TrainFront, XCircle } from "lucide-react";
import { useHotkey } from "@/lib/hooks";
import { NAV_ITEMS } from "@/lib/nav";
import { BoardAction, requestAction, requestOpenTrain, useBoard } from "@/lib/star/store";
import { riskFromTrain } from "@/lib/star/risk";
import { fmtTab } from "@/lib/star/format";

const OPEN_EVENT = "star:palette";
export function openPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

interface Item {
  id: string;
  group: string;
  title: string;
  hint?: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

function score(item: Item, q: string): number {
  const hay = `${item.title} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase();
  if (!q) return 1;
  const terms = q.split(/\s+/).filter(Boolean);
  let s = 0;
  for (const t of terms) {
    if (item.title.toLowerCase().startsWith(t)) s += 3;
    else if (item.title.toLowerCase().includes(t)) s += 2;
    else if (hay.includes(t)) s += 1;
    else return 0;
  }
  return s;
}

export function CommandPalette() {
  const router = useRouter();
  const board = useBoard();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  function show() {
    setQ("");
    setCursor(0);
    setOpen(true);
  }

  useHotkey("mod+k", () => (open ? setOpen(false) : show()), { inInputs: true });
  useHotkey("escape", () => setOpen(false), { inInputs: true });

  useEffect(() => {
    const on = () => show();
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);

  const items = useMemo<Item[]>(() => {
    const act = (id: BoardAction, title: string, icon: LucideIcon, hint: string, keywords: string): Item => ({ id: `a-${id}`, group: "Actions", title, hint, icon, keywords, run: () => requestAction(id) });
    const actions: Item[] = [
      act("add-train", "Add train", Plus, "Starts the incident clock if it is not running", "add new train headcode stranded"),
      act("new-incident", "New incident", Siren, "A fresh incident key and an empty board", "new incident create"),
    ];
    if (board.key) {
      actions.push(
        act("export-pdf", "Export incident PDF", FileDown, "Overview plus a page per train", "pdf export print report"),
        act("copy-link", "Copy incident link", Link2, "Share this board", "copy link url share"),
        act("close-incident", "Close incident", XCircle, "Exports a final PDF, archives the board", "close end archive finish"),
      );
    }
    const pages: Item[] = NAV_ITEMS.map((n) => ({ id: `p-${n.href}`, group: "Pages", title: n.label, hint: n.desc, icon: n.icon, run: () => router.push(board.key ? `/?i=${encodeURIComponent(board.key)}` : n.href) }));
    const incidents: Item[] = board.open.map((inc) => ({
      id: `i-${inc.incident_key}`,
      group: "Open incidents",
      title: inc.incident_key,
      hint: [inc.started_by_org || inc.created_by_org, fmtTab(inc.started_at)].filter(Boolean).join(" · "),
      icon: Siren,
      keywords: "incident",
      run: () => router.push(`/?i=${encodeURIComponent(inc.incident_key)}`),
    }));
    const trains: Item[] = board.trains.map((t) => {
      const r = riskFromTrain(t);
      return {
        id: `t-${t.id}`,
        group: "Trains on this board",
        title: `${t.headcode ?? "—"} · ${r.rag.toUpperCase()} ${r.score}`,
        hint: [t.toc, t.location_text, t.status === "closed" ? "closed" : null].filter(Boolean).join(" · "),
        icon: TrainFront,
        keywords: `${t.headcode} ${t.toc} ${t.location_text} ${t.line}`,
        run: () => requestOpenTrain(t.id),
      };
    });
    return [...actions, ...trains, ...incidents, ...pages];
  }, [board.key, board.open, board.trains, router]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(
    () => (needle ? items.map((it) => ({ it, s: score(it, needle) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.it) : items).slice(0, 18),
    [needle, items],
  );

  const resultsKey = `${needle}|${results.length}`;
  const [seenKey, setSeenKey] = useState(resultsKey);
  if (seenKey !== resultsKey) {
    setSeenKey(resultsKey);
    setCursor(0);
  }

  function go(item: Item) {
    setOpen(false);
    item.run();
  }

  if (!open) return null;

  const groups: { name: string; items: Item[] }[] = [];
  for (const it of results) {
    const g = groups.find((x) => x.name === it.group);
    if (g) g.items.push(it);
    else groups.push({ name: it.group, items: [it] });
  }
  let idx = -1;

  return (
    <div className="backdrop flex items-start justify-center px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal aria-label="Command palette" className="card scale-in w-full max-w-xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-edge px-3">
          <Search size={16} className="text-faint" />
          <input
            autoFocus
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            placeholder="Add a train, find a headcode, switch incident…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (results[cursor]) go(results[cursor]);
              }
            }}
          />
                    <kbd className="kbd">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-1.5">
          {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-dim">Nothing matches “{q}”.</p>}
          {groups.map((g) => (
            <div key={g.name} className="mb-1">
              <div className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">{g.name}</div>
              {g.items.map((it) => {
                idx += 1;
                const i = idx;
                const active = i === cursor;
                return (
                  <button
                    key={it.id}
                    className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                      active ? "text-ink" : "text-dim hover:bg-hover hover:text-ink"
                    }`}
                    style={active ? { background: "var(--accent-soft)" } : undefined}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(it)}
                  >
                    <it.icon size={16} className={active ? "text-accent" : "text-faint"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{it.title}</span>
                      {it.hint && <span className="block truncate text-xs text-faint">{it.hint}</span>}
                    </span>
                    {active ? <CornerDownLeft size={14} className="text-faint" /> : <ArrowRight size={14} className="opacity-0" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-edge px-3 py-2 text-[11px] text-faint">
          <span className="flex items-center gap-1">
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">↵</kbd> open
          </span>
          <span className="ml-auto">Type a headcode, location or incident key</span>
        </div>
      </div>
    </div>
  );
}
