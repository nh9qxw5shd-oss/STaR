// Formatting helpers (London time; UK date order).

export function fmtHMS(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function relTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const m = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m === 1) return "1 min ago";
  if (m < 60) return `${m} mins ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? "1 hr ago" : `${h} hrs ago`;
}

const TZ = "Europe/London";

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function fmtTab(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", timeZone: TZ });
}

/** Value for <input type="datetime-local"> in the browser's own zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function minutesSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 60000));
}

export function newKey(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/** A desk-given incident name, tidied: single spaces, at most 60 characters, or null. */
export function incidentName(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return t || null;
}

/** What to call an incident on screen: its name, else its key. */
export function incidentLabel(inc: { incident_key: string; name?: string | null } | null | undefined, key = ""): string {
  return inc?.name?.trim() || inc?.incident_key || key;
}

export function clampStr(s: string, n: number): string {
  const t = (s || "").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
