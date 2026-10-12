// Incident history: closing an incident archives its session's trains and notes, so each closed
// incident is one (incident_key, session_id) among the archived trains. Pure and tested.

import type { ClosedSession, StarTrain } from "./types.ts";

export type ArchivedTrainRow = Pick<StarTrain, "incident_key" | "session_id" | "headcode" | "stranded_at" | "created_at" | "archived_at" | "updated_by_org">;

export function matchesSession(s: ClosedSession, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [s.name, s.incident_key, s.closed_by_org, ...s.headcodes].filter(Boolean).join(" ").toLowerCase().includes(needle);
}

/** Pure: archived train rows into one entry per (incident, session), newest close first. */
export function groupSessions(
  rows: ArchivedTrainRow[],
  names: Map<string, string | null> = new Map(),
): ClosedSession[] {
  const by = new Map<string, ClosedSession>();
  for (const r of rows) {
    if (!r.archived_at) continue;
    const id = `${r.incident_key}\u0000${r.session_id ?? ""}`;
    let s = by.get(id);
    if (!s) {
      s = { incident_key: r.incident_key, session_id: r.session_id ?? "", name: names.get(r.incident_key) ?? null, started_at: null, closed_at: r.archived_at, closed_by_org: r.updated_by_org ?? null, headcodes: [], trains: 0 };
      by.set(id, s);
    }
    s.trains++;
    if (r.headcode) s.headcodes.push(r.headcode);
    const start = r.stranded_at || r.created_at;
    if (start && (!s.started_at || start < s.started_at)) s.started_at = start;
    if (r.archived_at > s.closed_at) {
      s.closed_at = r.archived_at;
      s.closed_by_org = r.updated_by_org ?? null;
    }
  }
  return [...by.values()].sort((a, b) => (a.closed_at < b.closed_at ? 1 : -1));
}
