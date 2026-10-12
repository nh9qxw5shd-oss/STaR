"use client";

// Every read and write STaR makes, against the same tables, columns and rules as STaR V2.
// Boards are scoped to an incident's current session: closing an incident archives that
// session's trains and notes (nothing is deleted) and gives the incident a fresh session.

import { sb } from "../supabase";
import { newKey } from "./format.ts";
import { incidentName } from "./format.ts";
import { groupSessions, type ArchivedTrainRow } from "./history.ts";
import type { ClosedSession, StarIncident, StarNote, StarTrain } from "./types.ts";

const now = () => new Date().toISOString();

export async function loadOpenIncidents(): Promise<StarIncident[]> {
  const { data, error } = await sb()
    .from("star_incidents")
    .select("id, incident_key, name, created_at, created_by_org, started_at, started_by_org, current_session_id, closed_at, closed_by_org")
    .not("started_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []) as StarIncident[];
}

/** Read an incident, creating it (and its first session) when it does not exist yet. */
export async function ensureIncident(key: string, org: string, name: string | null = null): Promise<StarIncident> {
  const { data: existing, error: e1 } = await sb().from("star_incidents").select("*").eq("incident_key", key).maybeSingle();
  if (e1) throw e1;
  let inc = existing as StarIncident | null;
  if (!inc) {
    const { data, error } = await sb()
      .from("star_incidents")
      .insert({ incident_key: key, name: incidentName(name), created_at: now(), created_by_org: org || null })
      .select("*")
      .single();
    if (error) throw error;
    inc = data as StarIncident;
  }
  if (!inc.current_session_id) {
    const session = newKey();
    const { data, error } = await sb().from("star_incidents").update({ current_session_id: session }).eq("incident_key", key).select("*").maybeSingle();
    if (error) throw error;
    inc = (data as StarIncident | null) ?? { ...inc, current_session_id: session };
  }
  return inc;
}

export async function loadTrains(inc: StarIncident): Promise<StarTrain[]> {
  const { data, error } = await sb()
    .from("star_trains")
    .select("*")
    .eq("incident_key", inc.incident_key)
    .eq("session_id", inc.current_session_id || "")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StarTrain[];
}

export async function loadNotes(inc: StarIncident): Promise<Map<number, StarNote[]>> {
  const { data, error } = await sb()
    .from("star_notes")
    .select("*")
    .eq("incident_key", inc.incident_key)
    .eq("session_id", inc.current_session_id || "")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const map = new Map<number, StarNote[]>();
  for (const n of (data ?? []) as StarNote[]) {
    if (!map.has(n.train_id)) map.set(n.train_id, []);
    map.get(n.train_id)!.push(n);
  }
  return map;
}

export async function patchTrain(key: string, id: number, patch: Partial<StarTrain>, org: string): Promise<void> {
  const { error } = await sb()
    .from("star_trains")
    .update({ ...patch, updated_at: now(), updated_by_org: org || null })
    .eq("id", id)
    .eq("incident_key", key);
  if (error) throw error;
}

export async function setIncidentStart(key: string, iso: string, org: string | null = null, starting = false): Promise<StarIncident | null> {
  const patch: Record<string, unknown> = { started_at: iso };
  // Starting (again) after a close makes the incident live: the hub reads closed_at.
  if (starting) Object.assign(patch, { started_by_org: org || null, closed_at: null, closed_by_org: null });
  const { data, error } = await sb().from("star_incidents").update(patch).eq("incident_key", key).select("*").maybeSingle();
  if (error) throw error;
  return (data as StarIncident | null) ?? null;
}

/** The incident clock starts at the earliest train on the board (supports backdated trains). */
export function earliestStart(trains: StarTrain[]): string | null {
  let min: number | null = null;
  for (const t of trains) {
    const ms = new Date(t.stranded_at || t.created_at || "").getTime();
    if (!Number.isNaN(ms) && (min === null || ms < min)) min = ms;
  }
  return min === null ? null : new Date(min).toISOString();
}

export async function addTrain(inc: StarIncident, headcode: string, toc: string, strandedIso: string, org: string): Promise<void> {
  const { error } = await sb()
    .from("star_trains")
    .insert({
      incident_key: inc.incident_key,
      session_id: inc.current_session_id || null,
      headcode,
      toc,
      line: "",
      location_text: "",
      location_risk: "unknown",
      stranded_at: strandedIso,
      plan_status: "none",
      next_review_at: new Date(new Date(strandedIso).getTime() + 20 * 60000).toISOString(),
      pax_load: "unknown",
      hvac_status: "unknown",
      toilet_status: "unknown",
      power_status: "unknown",
      risk_matrix: null,
      status: "open",
      created_at: now(),
      updated_at: now(),
      updated_by_org: org || null,
    });
  if (error) throw error;
}

export async function renameIncident(key: string, name: string): Promise<StarIncident | null> {
  const { data, error } = await sb().from("star_incidents").update({ name: incidentName(name) }).eq("incident_key", key).select("*").maybeSingle();
  if (error) throw error;
  return (data as StarIncident | null) ?? null;
}

/** Back into play: open, with the next check 20 minutes from now. */
export async function reopenTrain(key: string, id: number, org: string): Promise<void> {
  await patchTrain(key, id, { status: "open", next_review_at: new Date(Date.now() + 20 * 60000).toISOString() }, org);
}

export async function addNote(inc: StarIncident, trainId: number, text: string, org: string): Promise<void> {
  const { error } = await sb()
    .from("star_notes")
    .insert({ incident_key: inc.incident_key, session_id: inc.current_session_id || null, train_id: trainId, org_context: org || null, note_text: text, created_at: now() });
  if (error) throw error;
}

/** Archive the session's trains and notes, then give the incident a fresh, unstarted session. */
export async function closeIncident(inc: StarIncident, org: string): Promise<StarIncident | null> {
  const at = now();
  const session = inc.current_session_id;
  if (session) {
    const n = await sb().from("star_notes").update({ archived_at: at }).eq("incident_key", inc.incident_key).eq("session_id", session).is("archived_at", null);
    if (n.error) throw n.error;
    const t = await sb()
      .from("star_trains")
      .update({ archived_at: at, status: "closed", updated_at: at, updated_by_org: org || null })
      .eq("incident_key", inc.incident_key)
      .eq("session_id", session)
      .is("archived_at", null);
    if (t.error) throw t.error;
  }
  const { data, error } = await sb()
    .from("star_incidents")
    .update({ started_at: null, started_by_org: null, current_session_id: newKey(), closed_at: at, closed_by_org: org || null })
    .eq("incident_key", inc.incident_key)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as StarIncident | null) ?? null;
}

// ------------------------------------------------------------ history

/** Closed incidents, newest first: every archived session, from its archived trains. */
export async function loadClosedSessions(limit = 1000): Promise<ClosedSession[]> {
  const { data, error } = await sb()
    .from("star_trains")
    .select("incident_key, session_id, headcode, stranded_at, created_at, archived_at, updated_by_org")
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as ArchivedTrainRow[];
  const keys = [...new Set(rows.map((r) => r.incident_key))];
  const names = new Map<string, string | null>();
  for (let i = 0; i < keys.length; i += 150) {
    const { data: incs, error: e2 } = await sb().from("star_incidents").select("incident_key, name").in("incident_key", keys.slice(i, i + 150));
    if (e2) throw e2;
    for (const inc of incs ?? []) names.set(inc.incident_key as string, (inc.name as string | null) ?? null);
  }
  return groupSessions(rows, names);
}

/** A closed session's trains and notes, read only. */
export async function loadSession(key: string, session: string): Promise<{ incident: StarIncident | null; trains: StarTrain[]; notes: Map<number, StarNote[]> }> {
  const [inc, trains, notes] = await Promise.all([
    sb().from("star_incidents").select("*").eq("incident_key", key).maybeSingle(),
    sb().from("star_trains").select("*").eq("incident_key", key).eq("session_id", session).order("created_at", { ascending: false }),
    sb().from("star_notes").select("*").eq("incident_key", key).eq("session_id", session).order("created_at", { ascending: false }),
  ]);
  for (const r of [inc, trains, notes]) if (r.error) throw r.error;
  const map = new Map<number, StarNote[]>();
  for (const n of (notes.data ?? []) as StarNote[]) {
    if (!map.has(n.train_id)) map.set(n.train_id, []);
    map.get(n.train_id)!.push(n);
  }
  return { incident: (inc.data as StarIncident | null) ?? null, trains: (trains.data ?? []) as StarTrain[], notes: map };
}

/**
 * Reopen a closed incident: its archived session becomes the board again (trains and notes
 * un-archived, trains left as they closed so each is reopened deliberately). Refused while the
 * incident already has a live board of its own, so nothing on it is stranded.
 */
export async function reopenSession(key: string, session: string, org: string): Promise<"ok" | "busy"> {
  const { data: inc, error } = await sb().from("star_incidents").select("*").eq("incident_key", key).maybeSingle();
  if (error) throw error;
  const cur = inc as StarIncident | null;
  if (cur?.current_session_id && cur.current_session_id !== session) {
    const live = await sb().from("star_trains").select("id", { count: "exact", head: true }).eq("incident_key", key).eq("session_id", cur.current_session_id).is("archived_at", null);
    if (live.error) throw live.error;
    if ((live.count ?? 0) > 0) return "busy";
  }
  const at = now();
  const t = await sb().from("star_trains").update({ archived_at: null, updated_at: at, updated_by_org: org || null }).eq("incident_key", key).eq("session_id", session);
  if (t.error) throw t.error;
  const n = await sb().from("star_notes").update({ archived_at: null }).eq("incident_key", key).eq("session_id", session);
  if (n.error) throw n.error;
  const { data: trains } = await sb().from("star_trains").select("stranded_at, created_at").eq("incident_key", key).eq("session_id", session);
  const start = earliestStart((trains ?? []) as StarTrain[]) ?? at;
  const u = await sb()
    .from("star_incidents")
    .update({ current_session_id: session, started_at: start, started_by_org: org || cur?.started_by_org || null, closed_at: null, closed_by_org: null })
    .eq("incident_key", key);
  if (u.error) throw u.error;
  return "ok";
}

// ------------------------------------------------------------ outside services

/** Current conditions from Open-Meteo, as a one-line summary. */
export async function fetchWeatherSummary(lat: number, lon: number): Promise<string | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("current", "temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation,rain,showers,snowfall");
  url.searchParams.set("timezone", "Europe/London");
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const c = (await res.json())?.current;
  if (!c) return null;
  return `Temp ${Math.round(c.temperature_2m)}°C · Wind ${Math.round(c.wind_speed_10m)} km/h (G${Math.round(c.wind_gusts_10m)}) · Precip ${c.precipitation}`;
}

let geocodeQueue: Promise<unknown> = Promise.resolve();

/** Nearest place name from OpenStreetMap Nominatim, one request at a time with a pause. */
export function nearestPlace(lat: number, lon: number): Promise<string | null> {
  const run = async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`, {
      headers: { "Accept-Language": "en", Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const a = d?.address ?? {};
    return a.town || a.city || a.village || a.hamlet || a.suburb || (d?.display_name ? String(d.display_name).split(",")[0] : null) || null;
  };
  const p = geocodeQueue.catch(() => undefined).then(run);
  geocodeQueue = p.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, 900)));
  return p;
}
