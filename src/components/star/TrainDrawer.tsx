"use client";

// A train's modules in one drawer: core details, the risk matrix, plans A/B/C, the preferred plan
// at a glance, the RIO evacuation checklist (only when the preferred plan is to detrain), the
// map pin with weather, and notes. Same fields, rules and saves as STaR V2.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Crosshair, MapPin, Save } from "lucide-react";
import { Badge, Chips, Drawer, Field } from "@/components/ui";
import { useDialog, useToast } from "@/components/uiFeedback";
import { MapPicker } from "./MapPicker";
import { RAG_COLOR, type OpenView } from "./TrainCard";
import { RM, RM_SECTIONS, RM_THRESHOLDS, computeMatrixRisk, matrixPicks, pickLabel, riskFromTrain, type MatrixPicks, type RmKey } from "@/lib/star/risk";
import {
  LOCATION_RISKS,
  PLAN_KEYS,
  PLAN_LABELS,
  computePlanStatus,
  label,
  needsRioChecklist,
  parsePlanData,
  planStatusLabel,
  preferredKey,
  type PlanData,
  type PlanKey,
  type RioChecklist,
} from "@/lib/star/plans";
import { clampStr, fmtDateTime, fmtTime, toLocalInput } from "@/lib/star/format";
import { fetchWeatherSummary, nearestPlace } from "@/lib/star/data";
import { currentOrg } from "@/lib/star/store";
import { TOCS, type StarNote, type StarTrain } from "@/lib/star/types";

export interface DrawerApi {
  patch: (train: StarTrain, patch: Partial<StarTrain>) => Promise<boolean>;
  addNote: (train: StarTrain, text: string) => Promise<boolean>;
  startChanged: () => Promise<void>;
}

type View = OpenView["view"];

const VIEW_TITLE: Record<View, string> = {
  menu: "Modules",
  core: "Core details",
  matrix: "Risk matrix (RAG)",
  summary: "Preferred plan",
  plans: "Plans (A/B/C)",
  rio: "RIO evac checklist",
  location: "Rough location",
  notes: "Notes",
};

function Seg<T extends string>({ value, options, onChange, disabled }: { value: T | ""; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" style={disabled ? { opacity: 0.45, pointerEvents: "none" } : undefined}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, hint, children, id, highlight }: { title: string; hint?: ReactNode; children: ReactNode; id?: string; highlight?: boolean }) {
  return (
    <section id={id} className="rounded-xl border border-edge bg-sunken p-3" style={highlight ? { boxShadow: "inset 0 0 0 2px var(--accent)" } : undefined}>
      <div className="lbl">{title}</div>
      {children}
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
    </section>
  );
}

// ------------------------------------------------------------------ menu

function MenuView({ train, go, onCloseTrain }: { train: StarTrain; go: (o: OpenView) => void; onCloseTrain: () => void }) {
  const pref = preferredKey(train);
  const rows: { view: View; name: string; desc: string }[] = [
    { view: "core", name: "Core details", desc: "Status, TOC, line, location label and the timer start point" },
    { view: "matrix", name: "Risk matrix (RAG)", desc: "Excel-aligned scoring: on-board + location + traction" },
    ...(pref ? [{ view: "summary" as View, name: `Preferred plan (Plan ${pref})`, desc: "Read-only bullets for speed; edit from there if needed" }] : []),
    { view: "plans", name: "Plans (A/B/C)", desc: "Build options, nominate a preferred plan, set it actioning" },
    ...(needsRioChecklist(train) ? [{ view: "rio" as View, name: "RIO evac checklist", desc: "Shown because the preferred plan is to detrain" }] : []),
    { view: "location", name: "Rough location", desc: "Map pin, nearest place and live weather" },
    { view: "notes", name: "Notes", desc: "Add a note and see the history" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <button key={r.view} type="button" className="card card-link flex w-full items-center justify-between gap-3 p-3 text-left" onClick={() => go({ view: r.view })}>
          <span className="min-w-0">
            <span className="block font-semibold">{r.name}</span>
            <span className="block text-xs text-dim">{r.desc}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-faint" />
        </button>
      ))}
      {train.status !== "closed" && (
        <button type="button" className="card card-link flex w-full items-center justify-between gap-3 p-3 text-left" onClick={onCloseTrain}>
          <span>
            <span className="block font-semibold text-poor">Close train</span>
            <span className="block text-xs text-dim">Marks the tile closed and freezes its timer. Nothing is deleted.</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-faint" />
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ core

function CoreView({ train, api, done }: { train: StarTrain; api: DrawerApi; done: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(train.status || "open");
  const [toc, setToc] = useState(train.toc || "UNKNOWN");
  const [line, setLine] = useState(train.line || "");
  const [loc, setLoc] = useState(train.location_text || "");
  const base = train.stranded_at || train.created_at || new Date().toISOString();
  const [adjusting, setAdjusting] = useState(false);
  const [dt, setDt] = useState(toLocalInput(base));

  async function applyStart() {
    const d = new Date(dt);
    if (!dt || Number.isNaN(d.getTime())) return toast.error("Select a date and time");
    if (d.getTime() > Date.now() + 60000) return toast.error("Time can’t be in the future");
    const ok = await api.patch(train, { stranded_at: d.toISOString(), next_review_at: new Date(d.getTime() + 20 * 60000).toISOString() });
    if (!ok) return;
    await api.startChanged();
    setAdjusting(false);
    toast.success("Timer start updated");
  }

  async function save() {
    const ok = await api.patch(train, { status, toc, line: line.trim(), location_text: loc.trim() });
    if (ok) {
      toast.success("Core details saved");
      done();
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="Status">
          <Seg value={status} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }]} onChange={setStatus} />
        </Section>
        <Section title="TOC">
          <Seg value={toc} options={TOCS.map((t) => ({ value: t, label: t }))} onChange={setToc} />
        </Section>
      </div>
      <Field label="Line / route">
        <input className="input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="e.g. MML Fast / Up Main" />
      </Field>
      <Field label="Location text">
        <input className="input" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. Between X and Y / Nottingham West Jn" />
      </Field>
      <Section title="Timer start point" hint={adjusting ? "When the train first became stranded. It cannot be in the future; the incident clock follows the earliest train." : undefined}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">Currently {fmtDateTime(base)}</span>
          {!adjusting && (
            <button type="button" className="btn btn-sm" onClick={() => setAdjusting(true)}>
              Adjust timer start point
            </button>
          )}
        </div>
        {adjusting && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input type="datetime-local" className="input !w-auto" value={dt} onChange={(e) => setDt(e.target.value)} />
            <button type="button" className="btn btn-sm" onClick={() => setAdjusting(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={applyStart}>
              Apply
            </button>
          </div>
        )}
      </Section>
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary gap-1.5" onClick={save}>
          <Save size={15} /> Save
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- matrix

function MatrixView({ train, api, done, startTab, focus }: { train: StarTrain; api: DrawerApi; done: () => void; startTab?: OpenView["tab"]; focus?: string }) {
  const toast = useToast();
  const [draft, setDraft] = useState<MatrixPicks>(() => matrixPicks(train));
  const [tab, setTab] = useState<"onboard" | "location" | "traction">(startTab ?? "onboard");
  const [flash, setFlash] = useState<string | undefined>(focus);
  const r = computeMatrixRisk(draft) ?? { rag: "green" as const, score: 0, onboard: 0, location: 0, traction: 0, mode: "matrix" as const };

  useEffect(() => {
    if (!focus) return;
    document.getElementById(`rm_${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setFlash(undefined), 1400);
    return () => clearTimeout(t);
  }, [focus]);

  async function save() {
    const ok = await api.patch(train, { risk_matrix: JSON.stringify(draft) });
    if (ok) {
      toast.success("Risk matrix saved");
      done();
    }
  }

  const section = RM_SECTIONS.find((s) => s.key === tab)!;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-sunken p-3">
        <div>
          <div className="text-sm font-bold">Immediate RAG (matrix)</div>
          <div className="text-xs text-dim">
            On-board <span className="font-mono">{r.onboard}</span> · Location <span className="font-mono">{r.location}</span> · Traction <span className="font-mono">{r.traction}</span>
          </div>
        </div>
        <Badge color={RAG_COLOR[r.rag]} dot>
          {r.rag.toUpperCase()} · {r.score}
        </Badge>
      </div>
      <Chips options={RM_SECTIONS.map((s) => ({ value: s.key, label: s.label }))} value={tab} onChange={(v) => v && setTab(v)} />
      <div className="grid gap-3 sm:grid-cols-2">
        {section.rows.map((row) => {
          const col = `rm_${row.key}` as const;
          const table = RM[row.key as RmKey] as Record<string, number>;
          return (
            <Section key={row.key} id={`rm_${row.key}`} title={row.label} highlight={flash === row.key}>
              <Seg
                value={draft[col] ?? ""}
                options={Object.entries(table).map(([v, pts]) => ({ value: v, label: <>{pickLabel(v)} <span className="opacity-60">({pts})</span></> }))}
                onChange={(v) => setDraft((d) => ({ ...d, [col]: v }))}
              />
            </Section>
          );
        })}
      </div>
      <p className="text-xs text-faint">
        Total score thresholds: red if over {RM_THRESHOLDS.red_gt}, amber {RM_THRESHOLDS.amber_min}–{RM_THRESHOLDS.red_gt}, green under {RM_THRESHOLDS.amber_min}.
      </p>
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary gap-1.5" onClick={save}>
          <Save size={15} /> Save
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- summary

function SummaryView({ train, go }: { train: StarTrain; go: (o: OpenView & { planTab?: PlanKey }) => void }) {
  const pref = preferredKey(train);
  const p = parsePlanData(train.plan_data)[pref ?? "A"];
  const bullets = [
    p.aim && `Aim: ${label("aim", p.aim)}`,
    p.approach && `Approach: ${label("approach", p.approach)}`,
    p.egress && `Egress: ${label("egress", p.egress)}`,
    train.next_review_at && `Next assessment: ${fmtTime(train.next_review_at)}`,
    train.location_risk && train.location_risk !== "unknown" && `Location overlay: ${train.location_risk.replaceAll("_", " ")}`,
    p.resources?.length && `Resources: ${p.resources.map((x) => label("resources", x) ?? x.toUpperCase()).join(", ")}`,
  ].filter(Boolean) as string[];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <Badge color="var(--damp)">{pref ? `Plan ${pref}` : "No preferred plan set"}</Badge>
        <Badge>{planStatusLabel(train.plan_status)}</Badge>
      </div>
      <Section title="At a glance">
        {bullets.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-faint">Nothing captured on this plan yet.</p>
        )}
      </Section>
      {p.notes?.trim() && (
        <Section title="Plan notes">
          <p className="whitespace-pre-wrap text-sm">{p.notes}</p>
        </Section>
      )}
      <Section title="All plans" hint="Open a plan in the full builder.">
        <div className="flex flex-wrap gap-2">
          {PLAN_KEYS.map((k) => (
            <button key={k} type="button" className="btn btn-sm" onClick={() => go({ view: "plans", planTab: k })}>
              Plan {k}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------- plans

function PlansView({ train, api, done, initialTab }: { train: StarTrain; api: DrawerApi; done: () => void; initialTab?: PlanKey }) {
  const toast = useToast();
  const [pd, setPd] = useState<PlanData>(() => parsePlanData(train.plan_data));
  const [tab, setTab] = useState<PlanKey>(initialTab ?? pd.meta.activeTab ?? "A");
  const [preferred, setPreferred] = useState<string>(pd.meta.preferred || train.plan_preferred || "none");
  const [actioning, setActioning] = useState<boolean>(!!pd.meta.actioning);
  const [locRisk, setLocRisk] = useState(train.location_risk || "unknown");
  const p = pd[tab];
  const status = computePlanStatus(pd, preferred, actioning);
  const locked = !(preferred && preferred !== "none");

  const setPlan = (patch: Partial<typeof p>) => setPd((d) => ({ ...d, [tab]: { ...d[tab], ...patch } }));
  const toggleRes = (id: string) => {
    const set = new Set(p.resources ?? []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setPlan({ resources: [...set] });
  };

  async function save() {
    const next: PlanData = { ...pd, meta: { ...pd.meta, activeTab: tab, preferred, actioning } };
    const ok = await api.patch(train, {
      plan_status: status,
      location_risk: locRisk,
      plan_preferred: preferred && preferred !== "none" ? preferred : null,
      plan_data: next,
    });
    if (ok) {
      toast.success("Plans saved");
      done();
    }
  }

  const statusColor = status === "executing" ? "var(--poor)" : status === "agreed" ? "var(--moderate)" : "var(--good)";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-sunken p-3">
        <div>
          <div className="text-sm font-bold">Plan status</div>
          <div className="text-xs text-dim">Worked out on save: forming → agreed → executing.</div>
        </div>
        <Badge color={statusColor} dot>
          {status.toUpperCase()}
        </Badge>
      </div>
      <Chips options={PLAN_KEYS.map((k) => ({ value: k, label: `Plan ${k}` }))} value={tab} onChange={(v) => v && setTab(v)} />
      <Section title="Aim">
        <Seg value={p.aim ?? ""} options={Object.entries(PLAN_LABELS.aim).map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => setPlan({ aim: v })} />
      </Section>
      <Section title="Approach">
        <Seg value={p.approach ?? ""} options={Object.entries(PLAN_LABELS.approach).map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => setPlan({ approach: v })} />
      </Section>
      <Section title="Egress route">
        <Seg value={p.egress ?? ""} options={Object.entries(PLAN_LABELS.egress).map(([v, l]) => ({ value: v, label: l }))} onChange={(v) => setPlan({ egress: v })} />
      </Section>
      <Section title="Location risk overlay">
        <Seg value={locRisk} options={LOCATION_RISKS} onChange={setLocRisk} />
      </Section>
      <Section title="Resources / agencies">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {Object.entries(PLAN_LABELS.resources).map(([id, l]) => {
            const on = (p.resources ?? []).includes(id);
            return (
              <div key={id} className="flex items-center justify-between gap-3 rounded-lg border border-edge px-3 py-2 text-sm">
                <span>{l}</span>
                <button type="button" role="switch" aria-checked={on} aria-label={l} className="switch" onClick={() => toggleRes(id)}>
                  <span />
                </button>
              </div>
            );
          })}
        </div>
      </Section>
      <Field label="Plan notes (short)" hint={`${(p.notes ?? "").length}/240`}>
        <textarea className="input min-h-[84px]" maxLength={240} value={p.notes ?? ""} onChange={(e) => setPlan({ notes: clampStr(e.target.value, 240) })} placeholder="Key steps, access, constraints, who owns what…" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="Preferred option" hint={<>A preferred plan sets the status to <b>AGREED</b> on save.</>}>
          <Seg value={preferred} options={[{ value: "none", label: "None" }, ...PLAN_KEYS.map((k) => ({ value: k, label: `Plan ${k}` }))]} onChange={(v) => {
            setPreferred(v);
            if (v === "none") setActioning(false);
          }} />
        </Section>
        <Section title="Actioning" hint={locked ? <>Nominate a <b>preferred</b> plan first to unlock EXECUTING.</> : <>Actioning sets the status to <b>EXECUTING</b> on save.</>}>
          <Seg value={actioning ? "1" : "0"} options={[{ value: "0", label: "Not actioning" }, { value: "1", label: "Actioning now" }]} onChange={(v) => setActioning(v === "1")} disabled={locked} />
        </Section>
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary gap-1.5" onClick={save}>
          <Save size={15} /> Save
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- rio

function RioView({ train, api }: { train: StarTrain; api: DrawerApi }) {
  const pd = parsePlanData(train.plan_data);
  const pref = preferredKey(train);
  const p = pref ? pd[pref] : {};
  const saved = pd.meta.rioChecklist ?? {};
  const prefMethod = p.egress ? (label("egress", p.egress) ?? "") : "";
  const [rio, setRio] = useState<RioChecklist>(() => ({ ...saved, method: saved.method?.trim() ? saved.method : prefMethod }));
  const latest = useRef(train);
  useEffect(() => {
    latest.current = train;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Each change merges into plan_data.meta.rioChecklist on the latest copy of the train.
  const persist = (patch: Partial<RioChecklist>) => {
    const cur = parsePlanData(latest.current.plan_data);
    const next: PlanData = { ...cur, meta: { ...cur.meta, rioChecklist: { ...(cur.meta.rioChecklist ?? {}), ...patch, _updated_at: new Date().toISOString(), _updated_by: currentOrg() || null } } };
    return api.patch(latest.current, { plan_data: next });
  };
  const yn = (key: keyof RioChecklist, extra?: Partial<RioChecklist>) => (v: "yes" | "no") => {
    setRio((r) => ({ ...r, [key]: v, ...extra }));
    void persist({ [key]: v, ...extra });
  };
  const text = (key: keyof RioChecklist) => (v: string) => {
    setRio((r) => ({ ...r, [key]: v }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist({ [key]: v }), 400);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const yesNo = (k: keyof RioChecklist, extra?: (v: "yes" | "no") => Partial<RioChecklist>) => (
    <Seg value={(rio[k] as string) ?? ""} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} onChange={(v) => yn(k, extra?.(v as "yes" | "no"))(v as "yes" | "no")} />
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-dim">Shown because the preferred plan (Plan {pref}) is to detrain. Every answer saves as you go.</p>
      <Field label="What is the method of evacuation?" hint="Filled from the preferred plan's egress route.">
        <input className="input" value={rio.method ?? ""} onChange={(e) => text("method")(e.target.value)} />
      </Field>
      <Field label="What safeguards are needed for a safe, controlled evacuation?">
        <textarea className="input min-h-[72px]" value={rio.safeguards ?? ""} onChange={(e) => text("safeguards")(e.target.value)} placeholder="Key safeguards, caveats, comms, supervision…" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Section title="Do the lines have OLE?">
          {yesNo("ole", (v) => (v === "yes" ? {} : { isolations: null }))}
        </Section>
        {rio.ole === "yes" && (
          <Section title="Are isolations required / in place?">
            {yesNo("isolations")}
          </Section>
        )}
        <Section title="Do you have all necessary resources?">
          {yesNo("resources_ok")}
        </Section>
        <Section title="Has a safe route for the evacuation been identified?">
          {yesNo("safe_route")}
        </Section>
        <Section title="Is there sufficient lighting for a safe evacuation?">
          {yesNo("lighting")}
        </Section>
        <Section title="Is the evacuation location expecting these passengers?">
          {yesNo("receiving")}
        </Section>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="How many passengers are on board?">
          <input className="input" value={rio.pax ?? ""} onChange={(e) => text("pax")(e.target.value)} placeholder="e.g. 159" />
        </Field>
        <Field label="How many vulnerable passengers have been identified?">
          <input className="input" value={rio.vulnerable ?? ""} onChange={(e) => text("vulnerable")(e.target.value)} placeholder="e.g. 3" />
        </Field>
      </div>
      <Field label="Who will lead the vulnerable passenger evacuation?">
        <input className="input" value={rio.lead ?? ""} onChange={(e) => text("lead")(e.target.value)} placeholder="Role / name / org" />
      </Field>
      <Field label="How much luggage is on board, and can staff on site manage it?">
        <input className="input" value={rio.luggage ?? ""} onChange={(e) => text("luggage")(e.target.value)} />
      </Field>
      <Field label="Are other competent railway employees on board to assist?">
        <input className="input" value={rio.other_staff ?? ""} onChange={(e) => text("other_staff")(e.target.value)} placeholder="Who / how many" />
      </Field>
      <Field label="Notes">
        <textarea className="input min-h-[72px]" value={rio.notes ?? ""} onChange={(e) => text("notes")(e.target.value)} placeholder="Anything else relevant…" />
      </Field>
    </div>
  );
}

// -------------------------------------------------------------- location

function LocationView({ train, api, done }: { train: StarTrain; api: DrawerApi; done: () => void }) {
  const toast = useToast();
  const [pt, setPt] = useState<{ lat: number; lon: number } | null>(train.lat != null && train.lon != null ? { lat: train.lat, lon: train.lon } : null);
  const [busy, setBusy] = useState(false);
  const locate = useRef<((lat: number, lon: number) => void) | null>(null);

  function useMine() {
    if (!navigator.geolocation) return toast.error("Location is not available in this browser");
    navigator.geolocation.getCurrentPosition(
      (pos) => locate.current?.(pos.coords.latitude, pos.coords.longitude),
      () => toast.error("Location permission denied"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function save() {
    if (!pt) return toast.error("Pick a location on the map");
    setBusy(true);
    try {
      const summary = await fetchWeatherSummary(pt.lat, pt.lon).catch(() => null);
      let text = (train.location_text || "").trim();
      if (!text || text.toLowerCase() === "pinned location") text = (await nearestPlace(pt.lat, pt.lon).catch(() => null)) || "Pinned location";
      const ok = await api.patch(train, { lat: pt.lat, lon: pt.lon, weather_summary: summary, location_text: text });
      if (ok) {
        toast.success("Location and weather saved");
        done();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="chip font-mono">{pt ? `Lat ${pt.lat.toFixed(5)} · Lon ${pt.lon.toFixed(5)}` : "Lat — · Lon —"}</span>
        <span className="chip">Weather: {train.weather_summary || "not set"}</span>
      </div>
      <MapPicker lat={train.lat} lon={train.lon} onPick={(lat, lon) => setPt({ lat, lon })} locateRef={locate} />
      <p className="text-xs text-faint">Click the map or drag the pin. Keep it rough. Saving fetches the current weather and the nearest place name.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn gap-1.5" onClick={useMine}>
          <Crosshair size={15} /> Use my location
        </button>
        <button type="button" className="btn btn-primary gap-1.5" onClick={save} disabled={busy}>
          <MapPin size={15} /> {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- notes

function NotesView({ train, notes, org, api }: { train: StarTrain; notes: StarNote[]; org: string; api: DrawerApi }) {
  const [text, setText] = useState("");
  async function add() {
    const t = clampStr(text, 180);
    if (!t) return;
    setText("");
    await api.addNote(train, t);
  }
  return (
    <div className="space-y-3">
      <Field label="Add note (max 180)" hint={<>Tagged as <span className="font-mono">{org || "not set"}</span>. Short, timestamped, attributed. Not a group chat.</>}>
        <textarea
          className="input min-h-[72px]"
          maxLength={180}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void add();
          }}
          placeholder="e.g. EMR: awaiting signaller route. Crew updated."
        />
      </Field>
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" onClick={add} disabled={!text.trim()}>
          Add note
        </button>
      </div>
      <div className="space-y-2">
        <div className="lbl">Recent notes</div>
        {notes.slice(0, 30).map((n) => (
          <div key={n.id} className="rounded-lg border border-edge bg-sunken px-3 py-2">
            <div className="text-[11px] font-semibold text-faint">
              {n.org_context || "—"} · {fmtDateTime(n.created_at)}
            </div>
            <div className="whitespace-pre-wrap text-sm">{n.note_text}</div>
          </div>
        ))}
        {notes.length === 0 && <p className="text-sm text-faint">No notes yet.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- drawer

export function TrainDrawer({
  train,
  notes,
  org,
  open,
  onClose,
  api,
}: {
  train: StarTrain | null;
  notes: StarNote[];
  org: string;
  open: (OpenView & { planTab?: PlanKey }) | null;
  onClose: () => void;
  api: DrawerApi & { setOpen: (o: (OpenView & { planTab?: PlanKey }) | null) => void };
}) {
  const dialog = useDialog();
  const toast = useToast();
  const risk = useMemo(() => (train ? riskFromTrain(train) : null), [train]);
  if (!train || !open) return null;
  const go = (o: OpenView & { planTab?: PlanKey }) => api.setOpen(o);
  const back = () => api.setOpen({ view: "menu" });
  const view = open.view;

  async function closeTrain() {
    if (!train) return;
    const ok = await dialog.confirm({ title: `Close ${train.headcode}?`, body: "It moves out of the active counts, its timer freezes and its reminders stop. Nothing is deleted.", confirmLabel: "Close train", danger: true });
    if (!ok) return;
    if (await api.patch(train, { status: "closed" })) {
      toast.success("Train closed");
      onClose();
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-3xl"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {view !== "menu" && (
            <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={back} aria-label="Back to modules">
              <ArrowLeft size={16} />
            </button>
          )}
          <span className="font-mono">{train.headcode}</span>
          <span className="text-dim">· {VIEW_TITLE[view]}</span>
        </span>
      }
      subtitle={risk ? `Risk ${risk.score} · ${risk.rag.toUpperCase()} · acting as ${org || "not set"}` : undefined}
    >
      <div key={view} className="fade-in">
        {view === "menu" && <MenuView train={train} go={go} onCloseTrain={closeTrain} />}
        {view === "core" && <CoreView train={train} api={api} done={back} />}
        {view === "matrix" && <MatrixView train={train} api={api} done={back} startTab={open.tab} focus={open.focus} />}
        {view === "summary" && <SummaryView train={train} go={go} />}
        {view === "plans" && <PlansView train={train} api={api} done={back} initialTab={open.planTab} />}
        {view === "rio" && <RioView train={train} api={api} />}
        {view === "location" && <LocationView train={train} api={api} done={back} />}
        {view === "notes" && <NotesView train={train} notes={notes} org={org} api={api} />}
      </div>
    </Drawer>
  );
}
