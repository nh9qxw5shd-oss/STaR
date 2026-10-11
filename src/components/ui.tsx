"use client";

// Shared UI kit. Every module builds from these primitives so the app reads
// as one system: page headers, cards, stats, filter chips, skeletons, empty
// states and the sticky action bar used by editors.

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Inbox, LucideIcon, X } from "lucide-react";
import { useCopy, useCountUp } from "@/lib/hooks";

// ---------------------------------------------------------------- headers

export function PageHeader({
  eyebrow,
  back,
  title,
  subtitle,
  actions,
  badge,
}: {
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="fade-up mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-80">
        {(back || eyebrow) && (
          <div className="mb-1.5 flex items-center gap-2 text-xs">
            {back && (
              <Link href={back.href} className="link inline-flex items-center gap-1 font-semibold">
                <ArrowLeft size={13} /> {back.label}
              </Link>
            )}
            {back && eyebrow && <span className="text-faint">/</span>}
            {eyebrow && <span className="font-semibold uppercase tracking-[0.12em] text-faint">{eyebrow}</span>}
          </div>
        )}
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold tracking-tight">
          {title}
          {badge}
        </h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// Sticky bottom bar for editors: status on the left, actions on the right.
export function ActionBar({ status, children }: { status?: ReactNode; children: ReactNode }) {
  return (
    <div className="action-bar glass flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="text-sm text-dim">{status}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ cards

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
  padded = true,
  id,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={`card ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-edge px-4 py-2.5">
          <div className="min-w-0 flex-1 basis-40">
            <h2 className="truncate text-sm font-bold tracking-wide">{title}</h2>
            {subtitle && <p className="text-xs text-dim">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Badge({
  color = "var(--text-dim)",
  children,
  dot = false,
}: {
  color?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}
    >
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  className = "",
  required = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  required?: boolean;
  hint?: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="lbl">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Stat({
  label,
  value,
  sub,
  color,
  icon: Icon,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  icon?: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="lbl mb-0">{label}</div>
        {Icon && <Icon size={15} className="text-faint" />}
      </div>
      <div className="mt-1 text-2xl font-extrabold tracking-tight tnum" style={color ? { color } : undefined}>
        {typeof value === "number" ? <CountUp value={value} /> : value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-dim">{sub}</div>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="card card-link block px-4 py-3">
        {body}
      </Link>
    );
  }
  return <div className="card px-4 py-3">{body}</div>;
}

export function CountUp({ value }: { value: number }) {
  const n = useCountUp(value);
  return <>{n}</>;
}

// ------------------------------------------------------------ filter chips

export function Chips<T extends string>({
  options,
  value,
  onChange,
  allLabel,
  counts,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T | "";
  onChange: (v: T | "") => void;
  allLabel?: string;
  counts?: Partial<Record<T | "", number>>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {allLabel && (
        <button type="button" className="chip" aria-pressed={value === ""} onClick={() => onChange("")}>
          {allLabel}
          {counts && counts[""] != null && <span className="chip-count">{counts[""]}</span>}
        </button>
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chip"
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? "" : o.value)}
        >
          {o.color && <span className="dot" style={{ color: o.color }} />}
          {o.label}
          {counts && counts[o.value] != null && <span className="chip-count">{counts[o.value]}</span>}
        </button>
      ))}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

// ------------------------------------------------------- empties & loading

export function Empty({ children = "Nothing recorded." }: { children?: ReactNode }) {
  return <p className="py-6 text-center text-sm text-dim">{children}</p>;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="fade-up flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-edge bg-sunken text-faint">
        <Icon size={20} />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      {hint && <p className="max-w-md text-xs text-dim">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10" data-skeleton>
      <div className="spinner" />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

// Whole-page placeholders that keep the layout stable while data loads.
export function PageSkeleton({ kind = "table" }: { kind?: "table" | "cards" | "form" | "stats" }) {
  return (
    <div className="space-y-4" data-skeleton aria-busy>
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-3 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      {(kind === "stats" || kind === "cards") && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}
      {kind === "form" ? (
        <div className="card space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        </div>
      ) : (
        <div className="card space-y-2 p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- misc

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const { copied, copy } = useCopy();
  return (
    <button type="button" className={`btn ${className}`} onClick={() => copy(text)}>
      {copied ? <Check size={14} className="pop text-good" /> : <Copy size={14} />}
      {copied ? "Copied" : label}
    </button>
  );
}

export function StatusDot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span
      className={`dot ${pulse ? "pulse-dot" : ""}`}
      style={{ color, ["--pulse" as string]: `color-mix(in srgb, ${color} 55%, transparent)` }}
    />
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="lbl mb-0">{children}</h2>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------- drawer

// Right-hand slide-over for create/edit forms so the list stays in view.
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="backdrop flex justify-end" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        className={`slide-in-right flex h-full w-full ${width} flex-col border-l border-edge bg-raised shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-edge px-5 py-4">
          <div>
            <h2 className="text-base font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-edge px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- steps

// Section navigation for long forms: highlights the section in view and
// scrolls to it on click.
export function Steps({ items }: { items: { id: string; label: string }[] }) {
  const [current, setCurrent] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 }
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [items]);
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Sections">
      {items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          className="chip"
          aria-pressed={current === it.id}
          onClick={() => document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <span className="chip-count">{i + 1}</span> {it.label}
        </button>
      ))}
    </nav>
  );
}
