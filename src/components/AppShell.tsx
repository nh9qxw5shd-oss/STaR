"use client";

// Application shell (Autumn Hub kit): grouped sidebar with a sliding active indicator and the
// open incidents, a top bar with search, the organisation you are acting as, the London clock and
// the theme toggle, plus page transitions.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ReactNode, Suspense, useLayoutEffect, useRef, useState } from "react";
import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Plus, Search, Sun, X } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useHydrated, useLocalStorage, useNow } from "@/lib/hooks";
import { NAV } from "@/lib/nav";
import { requestAction, useBoard, useOrg } from "@/lib/star/store";
import { ORGS } from "@/lib/star/types";
import { fmtTab, incidentLabel } from "@/lib/star/format";
import { StatusDot } from "@/components/ui";
import { CommandPalette, openPalette } from "@/components/CommandPalette";

// Train front in Network Rail orange (same mark as the favicon, src/app/icon.svg).
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path
        fill="#F26522"
        d="M11 3h10a5 5 0 0 1 5 5v12a4 4 0 0 1-3.2 3.92L25 28h-3l-2-4h-8l-2 4H7l2.2-4.08A4 4 0 0 1 6 20V8a5 5 0 0 1 5-5Zm-1 5v6h12V8H10Zm1.5 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------- sidebar

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const params = useSearchParams();
  const current = params.get("i") ?? "";
  const { open } = useBoard();
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    const ind = indicatorRef.current;
    if (!list || !ind) return;
    const active = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      ind.style.opacity = "0";
      return;
    }
    const lr = list.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    ind.style.opacity = "1";
    ind.style.transform = `translateY(${ar.top - lr.top + 6}px)`;
    ind.style.height = `${ar.height - 12}px`;
  }, [path, current, open.length]);

  return (
    <div ref={listRef} className="relative">
      <span ref={indicatorRef} className="nav-indicator" style={{ top: 0, opacity: 0 }} />
      {NAV.map((g) => (
        <div key={g.label}>
          <div className="nav-group-label">{g.label}</div>
          {g.items.map((it) => (
            <Link
              key={it.href}
              href={it.href === "/" && current ? `/?i=${encodeURIComponent(current)}` : it.href}
              className="nav-item"
              aria-current={path === it.href && (it.href !== "/" || !current) ? "page" : undefined}
              title={it.desc}
              onClick={onNavigate}
            >
              <it.icon size={17} strokeWidth={2.1} />
              <span className="nav-label">{it.label}</span>
            </Link>
          ))}
        </div>
      ))}
      <div className="nav-group-label">Open incidents</div>
      {open.map((inc) => (
        <Link
          key={inc.incident_key}
          href={`/?i=${encodeURIComponent(inc.incident_key)}`}
          className="nav-item"
          aria-current={inc.incident_key === current ? "page" : undefined}
          title={`Started ${fmtTab(inc.started_at)}${inc.started_by_org || inc.created_by_org ? ` by ${inc.started_by_org || inc.created_by_org}` : ""}`}
          onClick={onNavigate}
        >
          <StatusDot color="var(--poor)" pulse={inc.incident_key === current} />
          <span className="nav-label flex min-w-0 flex-1 items-baseline justify-between gap-2">
            <span className={`truncate text-[13px] ${inc.name ? "font-semibold" : "font-mono"}`}>{incidentLabel(inc)}</span>
            <span className="shrink-0 text-[11px] text-faint">{fmtTab(inc.started_at)}</span>
          </span>
        </Link>
      ))}
      {open.length === 0 && <p className="nav-label px-5 py-1 text-xs text-faint">None open</p>}
      <button
        className="nav-item w-[calc(100%-1rem)] text-dim"
        onClick={() => {
          requestAction("new-incident");
          onNavigate?.();
        }}
      >
        <Plus size={17} />
        <span className="nav-label">New incident</span>
      </button>
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className="sidebar hidden lg:flex">
      <Link href="/" className="flex items-center gap-2.5 px-4 py-4">
        <BrandMark />
        <span className="nav-label leading-tight">
          <span className="block text-[15px] font-extrabold tracking-tight">STaR</span>
          <span className="block text-[11px] font-semibold text-faint">Stranded Train Risk</span>
        </span>
      </Link>
      <div className="flex-1 overflow-y-auto pb-4">
        <Suspense>
          <SidebarNav />
        </Suspense>
      </div>
      <div className="border-t border-edge p-2">
        <button className="nav-item w-[calc(100%-1rem)] text-faint" onClick={onToggle} title={collapsed ? "Expand navigation" : "Collapse navigation"}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span className="nav-label text-xs">Collapse</span>
        </button>
      </div>
    </aside>
  );
}

function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="backdrop lg:hidden" onMouseDown={onClose}>
      <div className="sheet flex h-full w-72 max-w-[85vw] flex-col border-r border-edge bg-sunken" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-4">
          <span className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-[15px] font-extrabold">STaR</span>
          </span>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pb-6">
          <Suspense>
            <SidebarNav onNavigate={onClose} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- topbar

function ActingAs() {
  const [org, setOrg] = useOrg();
  return (
    <select
      className="input !h-8 !w-auto max-w-[8.5rem] !py-0 text-xs font-semibold sm:max-w-none"
      value={org}
      onChange={(e) => setOrg(e.target.value)}
      title="The organisation your notes and updates are tagged with"
      aria-label="Acting as"
    >
      <option value="">Acting as: not set</option>
      {ORGS.map((o) => (
        <option key={o.value} value={o.value}>
          Acting as: {o.label}
        </option>
      ))}
    </select>
  );
}

function Clock() {
  const now = useNow(15000);
  const hydrated = useHydrated();
  if (!hydrated) return null;
  const hhmm = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const day = now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "Europe/London" });
  return (
    <span className="hidden items-baseline gap-1.5 text-sm md:inline-flex" title="Europe/London">
      <span className="font-mono text-base font-semibold tabular-nums">{hhmm}</span>
      <span className="text-xs text-dim">{day}</span>
    </span>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const light = theme === "light";
  return (
    <button className="btn btn-ghost btn-icon" onClick={toggle} aria-label={light ? "Switch to dark theme" : "Switch to light theme"} title={light ? "Switch to dark theme" : "Switch to light theme"}>
      <span key={theme} className="pop inline-flex">
        {light ? <Moon size={17} /> : <Sun size={17} />}
      </span>
    </button>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="topbar glass flex items-center gap-2 px-3 sm:px-4">
      <button className="btn btn-ghost btn-icon lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu size={18} />
      </button>
      <Link href="/" className="flex items-center gap-2 lg:hidden">
        <BrandMark size={22} />
        <span className="text-sm font-extrabold">STaR</span>
      </Link>
      <button className="btn btn-ghost ml-1 hidden min-w-[220px] justify-start gap-2 border border-edge bg-sunken text-dim sm:flex" onClick={() => openPalette()} title="Search incidents, trains and actions">
        <Search size={15} />
        <span className="flex-1 text-left text-xs font-medium">Search or jump to…</span>
        <span className="flex gap-0.5">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>
      <button className="btn btn-ghost btn-icon sm:hidden" onClick={() => openPalette()} aria-label="Search">
        <Search size={18} />
      </button>
      <div className="flex-1" />
      <ActingAs />
      <Clock />
      <ThemeToggle />
    </header>
  );
}

// ------------------------------------------------------------------ shell

export default function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useLocalStorage("star_nav_collapsed", false);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell" data-collapsed={collapsed ? "true" : "false"}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} />
        <main className="content flex-1">{children}</main>
        <footer className="content !py-4 text-xs text-faint">STaR · Stranded Train Risk · Derby Control · Thresholds per the Stranded Train RA</footer>
      </div>
      <CommandPalette />
    </div>
  );
}
