"use client";

// The STaR board for one incident (?i=<key>): incident switcher, KPIs, filters, a card per train,
// the per-train check reminders, and the drawers for adding a train and working one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, FileDown, Link2, Plus, Siren, TrainFront, X, XCircle } from "lucide-react";
import { Chips, Drawer, EmptyState, Field, PageHeader, PageSkeleton, Stat } from "@/components/ui";
import { useDialog, useToast } from "@/components/uiFeedback";
import { TrainCard, type OpenView } from "./TrainCard";
import { TrainDrawer, type DrawerApi } from "./TrainDrawer";
import { Timer } from "./Timer";
import { getBoard, onAction, onOpenTrain, setBoard, useBoard, useOrg, currentOrg } from "@/lib/star/store";
import * as db from "@/lib/star/data";
import { riskFromTrain, type Rag } from "@/lib/star/risk";
import { checkTrain, NOTICE_TEXT, type NoticeKey, type TrainCheckState } from "@/lib/star/reminders";
import { fmtDateTime, fmtTab, newKey, toLocalInput } from "@/lib/star/format";
import { exportIncidentPdf } from "@/lib/star/pdf";
import { sb } from "@/lib/supabase";
import { TOCS, type StarTrain } from "@/lib/star/types";
import type { PlanKey } from "@/lib/star/plans";

const POLL_MS = 20000;

interface Reminder {
  id: string;
  trainId: number;
  headcode: string;
  key: NoticeKey;
  at: number;
}

// ------------------------------------------------------------------ add train

function AddTrainDrawer({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (headcode: string, toc: string, iso: string) => Promise<boolean> }) {
  const toast = useToast();
  const [headcode, setHeadcode] = useState("");
  const [toc, setToc] = useState<string>("UNKNOWN");
  const [mode, setMode] = useState<"now" | "from">("now");
  const [dt, setDt] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    const hc = headcode.trim().toUpperCase();
    if (!hc) return toast.error("Enter a headcode");
    let iso = new Date().toISOString();
    if (mode === "from") {
      const d = new Date(dt);
      if (!dt || Number.isNaN(d.getTime())) return toast.error("Select when the train became stranded");
      if (d.getTime() > Date.now() + 60000) return toast.error("Time can’t be in the future");
      iso = d.toISOString();
    }
    setBusy(true);
    const ok = await onAdd(hc, toc, iso);
    setBusy(false);
    if (ok) {
      setHeadcode("");
      setToc("UNKNOWN");
      setMode("now");
      onClose();
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add train"
      subtitle="Fast capture. The timer starts straight away; everything else is on the train's menu."
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={confirm} disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Headcode / UID" required>
          <input className="input font-mono uppercase" autoFocus value={headcode} onChange={(e) => setHeadcode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirm()} placeholder="e.g. 1A23" />
        </Field>
        <div>
          <span className="lbl">TOC (optional)</span>
          <Chips options={TOCS.map((t) => ({ value: t, label: t }))} value={toc as (typeof TOCS)[number]} onChange={(v) => setToc(v || "UNKNOWN")} />
        </div>
        <div>
          <span className="lbl">Stranded since</span>
          <Chips options={[{ value: "now", label: "Now" }, { value: "from", label: "Earlier time" }]} value={mode} onChange={(v) => setMode((v as "now" | "from") || "now")} />
          {mode === "from" && <input type="datetime-local" className="input mt-2 !w-auto" value={dt || toLocalInput(new Date().toISOString())} onChange={(e) => setDt(e.target.value)} />}
          <p className="mt-1 text-xs text-faint">The incident clock follows the earliest train on the board.</p>
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------- board

export default function Board() {
  const params = useSearchParams();
  const key = (params.get("i") ?? "").trim();
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();
  const [org] = useOrg();
  const board = useBoard();

  const [text, setText] = useState("");
  const [fStatus, setFStatus] = useState<"" | "open" | "closed">("");
  const [fRisk, setFRisk] = useState<"" | Rag>("");
  const [addOpen, setAddOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ trainId: number; open: OpenView & { planTab?: PlanKey } } | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const checkState = useRef(new Map<number, TrainCheckState>());

  // ------------------------------------------------------------ loading

  const refreshOpen = useCallback(async () => {
    try {
      setBoard({ open: await db.loadOpenIncidents() });
    } catch {
      /* the list is a convenience; the board still works */
    }
  }, []);

  const reload = useCallback(async () => {
    const st = getBoard();
    let inc = st.incident;
    if (!st.key || !inc) return;
    try {
      // Re-read the incident so a close on another desk (new session) shows here.
      const { data } = await sb().from("star_incidents").select("*").eq("incident_key", st.key).maybeSingle();
      if (data) inc = data;
      const [trains, notes] = await Promise.all([db.loadTrains(inc!), db.loadNotes(inc!)]);
      if (getBoard().key !== st.key) return;
      setBoard({ incident: inc, trains, notes, loading: false });
    } catch (e) {
      console.warn("STaR reload failed", e);
    }
  }, []);

  // Earliest train sets the incident clock (backdated trains move it earlier).
  const reconcileStart = useCallback(async () => {
    const { incident, trains, key: k } = getBoard();
    if (!incident?.started_at || !k) return;
    const min = db.earliestStart(trains);
    if (min && new Date(min).getTime() < new Date(incident.started_at).getTime()) {
      const inc = await db.setIncidentStart(k, min).catch(() => null);
      if (inc) setBoard({ incident: inc });
    }
  }, []);

  // A different incident starts with no reminders and no drawer open.
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    setReminders([]);
    setDrawer(null);
  }

  useEffect(() => {
    let alive = true;
    checkState.current = new Map();
    (async () => {
      if (!key) {
        setBoard({ key: "", incident: null, trains: [], notes: new Map(), loading: false });
        await refreshOpen();
        return;
      }
      setBoard({ key, loading: true, trains: [], notes: new Map() });
      try {
        const inc = await db.ensureIncident(key, currentOrg());
        const [trains, notes] = await Promise.all([db.loadTrains(inc), db.loadNotes(inc)]);
        if (!alive) return;
        setBoard({ key, incident: inc, trains, notes, loading: false });
        await reconcileStart();
      } catch (e) {
        if (alive) {
          setBoard({ loading: false });
          toast.error("Could not open the incident", e instanceof Error ? e.message : String(e));
        }
      }
      await refreshOpen();
    })();
    // Realtime where the tables publish it, polling always.
    const ch = key
      ? sb()
          .channel(`star_${key}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "star_trains", filter: `incident_key=eq.${key}` }, () => void reload())
          .on("postgres_changes", { event: "*", schema: "public", table: "star_notes", filter: `incident_key=eq.${key}` }, () => void reload())
          .subscribe()
      : null;
    const id = setInterval(() => {
      void reload();
      void refreshOpen();
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
      if (ch) void sb().removeChannel(ch);
    };
  }, [key, reload, refreshOpen, reconcileStart, toast]);

  // ------------------------------------------------------------ writes

  const patch = useCallback<DrawerApi["patch"]>(
    async (train, p) => {
      const st = getBoard();
      const at = new Date().toISOString();
      setBoard({ trains: st.trains.map((t) => (t.id === train.id ? { ...t, ...p, updated_at: at, updated_by_org: currentOrg() || null } : t)) });
      try {
        await db.patchTrain(train.incident_key, train.id, p, currentOrg());
        return true;
      } catch (e) {
        toast.error("Update failed", e instanceof Error ? e.message : String(e));
        await reload();
        return false;
      }
    },
    [reload, toast],
  );

  const addNote = useCallback<DrawerApi["addNote"]>(
    async (train, noteText) => {
      const { incident } = getBoard();
      if (!incident) return false;
      try {
        await db.addNote(incident, train.id, noteText, currentOrg());
        toast.success("Note added");
        await reload();
        return true;
      } catch (e) {
        toast.error("Note failed", e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [reload, toast],
  );

  const api: DrawerApi & { setOpen: (o: (OpenView & { planTab?: PlanKey }) | null) => void } = {
    patch,
    addNote,
    startChanged: reconcileStart,
    setOpen: (o) => setDrawer((d) => (d && o ? { ...d, open: o } : null)),
  };

  // ------------------------------------------------------------ actions

  const newIncident = useCallback(() => {
    router.push(`/?i=${encodeURIComponent(newKey())}`);
    toast.success("Incident created", "Add a train to start its clock.");
  }, [router, toast]);

  const addTrain = useCallback(
    async (headcode: string, toc: string, iso: string) => {
      // A brand-new incident may still be opening: wait for it briefly.
      for (let i = 0; i < 25 && !(getBoard().incident && getBoard().incident?.incident_key === getBoard().key); i++) await new Promise((r) => setTimeout(r, 200));
      const { incident, key: k } = getBoard();
      if (!incident || !k) {
        toast.error("The incident is still opening", "Try Add again in a moment.");
        return false;
      }
      try {
        if (!incident.started_at) {
          const started = await db.setIncidentStart(k, iso, currentOrg(), true);
          if (started) setBoard({ incident: started });
          toast.info("Incident clock started");
        }
        await db.addTrain(getBoard().incident ?? incident, headcode, toc, iso, currentOrg());
        toast.success(`${headcode} added`);
        await reload();
        await reconcileStart();
        await refreshOpen();
        return true;
      } catch (e) {
        toast.error("Could not add the train", e instanceof Error ? e.message : String(e));
        return false;
      }
    },
    [reload, reconcileStart, refreshOpen, toast],
  );

  const exportPdf = useCallback(
    async (filename?: string) => {
      const st = getBoard();
      if (!st.key) return toast.error("No incident selected");
      await reload();
      const fresh = getBoard();
      await exportIncidentPdf({ incident: fresh.incident, trains: fresh.trains, notes: fresh.notes, org: currentOrg(), filename });
      if (!filename) toast.success("PDF exported");
    },
    [reload, toast],
  );

  const copyLink = useCallback(async () => {
    const url = new URL(window.location.href);
    if (getBoard().key) url.searchParams.set("i", getBoard().key);
    else url.searchParams.delete("i");
    try {
      await navigator.clipboard.writeText(url.toString());
      toast.success(getBoard().key ? "Incident link copied" : "Link copied");
    } catch {
      toast.error("Clipboard unavailable", url.toString());
    }
  }, [toast]);

  const closeIncident = useCallback(async () => {
    const { incident, key: k } = getBoard();
    if (!incident || !k) return;
    const ok = await dialog.confirm({
      title: `Close incident ${k}?`,
      body: "A final PDF is exported first. The board is then cleared and this session archived for later review; nothing is deleted.",
      confirmLabel: "Close incident",
      danger: true,
    });
    if (!ok) return;
    try {
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      await exportPdf(`STaR_Incident_${k}_FINAL_${ts}.pdf`);
      toast.success("Final PDF exported");
    } catch {
      toast.error("Final PDF export failed", "The incident will still close.");
    }
    try {
      await db.closeIncident(incident, currentOrg());
      router.replace("/");
      await refreshOpen();
      toast.success("Incident closed", "Board cleared and archived.");
    } catch (e) {
      toast.error("Close failed", e instanceof Error ? e.message : String(e));
    }
  }, [dialog, exportPdf, refreshOpen, router, toast]);

  const openAdd = useCallback(() => {
    if (!getBoard().key) {
      newIncident();
      setTimeout(() => setAddOpen(true), 400);
      return;
    }
    setAddOpen(true);
  }, [newIncident]);

  useEffect(
    () =>
      onAction((a) => {
        if (a === "add-train") openAdd();
        else if (a === "new-incident") newIncident();
        else if (a === "export-pdf") void exportPdf().catch(() => toast.error("PDF export failed"));
        else if (a === "copy-link") void copyLink();
        else if (a === "close-incident") void closeIncident();
      }),
    [openAdd, newIncident, exportPdf, copyLink, closeIncident, toast],
  );
  useEffect(() => onOpenTrain((id, view) => setDrawer({ trainId: id, open: { view: view as OpenView["view"] } })), []);

  // ------------------------------------------------------------ reminders

  useEffect(() => {
    if (!key) return;
    const tick = () => {
      const { trains, incident } = getBoard();
      if (!incident) return;
      const now = Date.now();
      for (const t of trains) {
        const st = checkState.current.get(t.id) ?? {};
        checkState.current.set(t.id, st);
        const r = checkTrain(t, now, st, incident.started_at);
        if (r.nextReviewAt && r.nextReviewAt !== t.next_review_at) void patch(t, { next_review_at: r.nextReviewAt });
        for (const n of r.notices) {
          const text = NOTICE_TEXT[n];
          setReminders((list) => [{ id: `${t.id}-${n}-${now}`, trainId: t.id, headcode: t.headcode ?? "—", key: n, at: now }, ...list]);
          (text.level === "bad" ? toast.error : toast.info)(`${t.headcode} · ${text.title}`, text.body);
        }
      }
    };
    const first = setTimeout(tick, 1500);
    const id = setInterval(tick, 10000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [key, patch, toast]);

  // Nearest place for pinned trains still without a label.
  const labelling = useRef(new Set<number>());
  useEffect(() => {
    for (const t of board.trains) {
      if (t.lat == null || t.lon == null) continue;
      const cur = (t.location_text || "").trim().toLowerCase();
      if (cur && cur !== "pinned location") continue;
      if (labelling.current.has(t.id)) continue;
      labelling.current.add(t.id);
      db.nearestPlace(t.lat, t.lon)
        .then((place) => (place ? patch(t, { location_text: place }) : undefined))
        .catch(() => undefined)
        .finally(() => labelling.current.delete(t.id));
    }
  }, [board.trains, patch]);

  // ------------------------------------------------------------ derived

  const scored = useMemo(() => board.trains.map((t) => ({ t, r: riskFromTrain(t) })), [board.trains]);
  const active = scored.filter((x) => x.t.status === "open");
  const leaders = [...active].sort((a, b) => b.r.score - a.r.score);
  const list = scored.filter(({ t, r }) => {
    if (fStatus && t.status !== fStatus) return false;
    if (fRisk && r.rag !== fRisk) return false;
    if (text && !`${t.headcode ?? ""} ${t.toc ?? ""} ${t.line ?? ""} ${t.location_text ?? ""}`.toLowerCase().includes(text.toLowerCase())) return false;
    return true;
  });
  const drawerTrain = drawer ? (board.trains.find((t) => t.id === drawer.trainId) ?? null) : null;
  const inc = board.incident;

  // ------------------------------------------------------------ render

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Stranded Train Risk"
        title={key ? <span className="font-mono">{key}</span> : "Stranded trains"}
        subtitle={key ? (inc?.started_at ? `Incident started ${fmtDateTime(inc.started_at)}${inc.started_by_org ? ` by ${inc.started_by_org}` : ""}` : "Not started: adding a train starts the clock") : "Pick an open incident or start a new one."}
        actions={
          <div className="flex flex-wrap gap-2">
            {key && (
              <button className="btn gap-1.5" onClick={copyLink}>
                <Link2 size={15} /> Copy link
              </button>
            )}
            {key && (
              <button className="btn gap-1.5" onClick={() => void exportPdf().catch(() => toast.error("PDF export failed"))}>
                <FileDown size={15} /> Export PDF
              </button>
            )}
            {key && (
              <button className="btn btn-danger gap-1.5" onClick={closeIncident}>
                <XCircle size={15} /> Close incident
              </button>
            )}
            <button className="btn btn-primary gap-1.5" onClick={openAdd}>
              <Plus size={15} /> Add train
            </button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="lbl !mb-0 mr-1">Open incidents</span>
        {board.open.map((i) => (
          <button key={i.incident_key} type="button" className="chip" aria-pressed={i.incident_key === key} onClick={() => router.push(`/?i=${encodeURIComponent(i.incident_key)}`)} title={`Started ${fmtTab(i.started_at)}`}>
            <span className="dot" style={{ color: "var(--poor)" }} />
            <span className="font-mono">{i.incident_key}</span>
            <span className="text-faint">
              {[i.started_by_org || i.created_by_org, fmtTab(i.started_at)].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
        {board.open.length === 0 && <span className="text-xs text-faint">None open. Add a train to start one.</span>}
        <button type="button" className="chip" onClick={newIncident}>
          <Plus size={13} /> New incident
        </button>
      </div>

      {key && board.loading && <PageSkeleton kind="cards" />}

      {key && !board.loading && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="card col-span-2 p-4 lg:col-span-1">
              <div className="lbl">Incident clock</div>
              <Timer start={inc?.started_at} className="text-2xl font-bold" />
              <div className="mt-1 text-xs text-faint">{inc?.started_at ? `Since ${fmtTab(inc.started_at)}` : "Not started"}</div>
            </div>
            <Stat label="Trains tracked" value={board.trains.length} sub="All tiles" icon={TrainFront} />
            <Stat label="Active" value={active.length} sub="Open / in play" color="var(--moderate)" />
            <Stat label="Closed" value={board.trains.length - active.length} sub="Resolved" color="var(--good)" />
            <Stat
              label="Risk leaderboard"
              value={leaders[0]?.t.headcode ?? "–"}
              sub={leaders.length ? leaders.slice(0, 3).map((x) => `${x.t.headcode} (${x.r.score})`).join(" · ") : "No active trains"}
              color={leaders[0] ? (leaders[0].r.rag === "red" ? "var(--poor)" : leaders[0].r.rag === "amber" ? "var(--moderate)" : "var(--good)") : undefined}
            />
          </div>

          {reminders.length > 0 && (
            <section className="card p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <BellRing size={15} className="text-accent" /> Checks due
                </h2>
                <button className="btn btn-ghost btn-sm" onClick={() => setReminders([])}>
                  Acknowledge all
                </button>
              </div>
              <ul className="space-y-2">
                {reminders.map((r) => {
                  const n = NOTICE_TEXT[r.key];
                  const color = n.level === "bad" ? "var(--poor)" : "var(--moderate)";
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: `color-mix(in srgb, ${color} 45%, var(--border))` }}>
                      <span className="font-mono font-bold">{r.headcode}</span>
                      <span className="font-semibold" style={{ color }}>
                        {n.title}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-dim">{n.body}</span>
                      <button className="btn btn-sm btn-primary" onClick={() => setDrawer({ trainId: r.trainId, open: { view: n.open === "matrix" ? "matrix" : "plans" } })}>
                        {n.open === "matrix" ? "Open RAG" : "Open plans"}
                      </button>
                      {r.key !== "m20" && r.key !== "m30" && (
                        <button className="btn btn-sm" onClick={() => setDrawer({ trainId: r.trainId, open: { view: "summary" } })}>
                          Plan summary
                        </button>
                      )}
                      <button className="btn btn-ghost btn-icon btn-sm" aria-label="Acknowledge" title="Acknowledge" onClick={() => setReminders((l) => l.filter((x) => x.id !== r.id))}>
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <input className="input !w-auto min-w-[240px] flex-1 sm:flex-none" placeholder="Filter: headcode, location, TOC…" value={text} onChange={(e) => setText(e.target.value)} />
            <Chips options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }]} value={fStatus} onChange={setFStatus} allLabel="All" />
            <Chips
              options={[
                { value: "red", label: "Red", color: "var(--poor)" },
                { value: "amber", label: "Amber", color: "var(--moderate)" },
                { value: "green", label: "Green", color: "var(--good)" },
              ]}
              value={fRisk}
              onChange={setFRisk}
              allLabel="Any risk"
            />
            {(text || fStatus || fRisk) && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setText("");
                  setFStatus("");
                  setFRisk("");
                }}
              >
                Clear
              </button>
            )}
          </div>

          {list.length === 0 ? (
            <EmptyState
              icon={TrainFront}
              title={board.trains.length ? "No trains match your filters" : "No trains on this incident yet"}
              hint={board.trains.length ? "Clear the filters to see every train." : "Add the first stranded train; its timer and the incident clock start straight away."}
              action={
                !board.trains.length && (
                  <button className="btn btn-primary gap-1.5" onClick={openAdd}>
                    <Plus size={15} /> Add train
                  </button>
                )
              }
            />
          ) : (
            <div className="stagger grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {list.map(({ t }) => (
                <TrainCard key={t.id} train={t} notes={board.notes.get(t.id) ?? []} org={org} onOpen={(o) => setDrawer({ trainId: t.id, open: o })} />
              ))}
            </div>
          )}
        </>
      )}

      {!key && !board.loading && (
        <EmptyState
          icon={Siren}
          title={board.open.length ? "Choose an incident" : "No open incidents"}
          hint={board.open.length ? "Open incidents are listed above and in the sidebar." : "Adding a train creates an incident and starts its clock."}
          action={
            <button className="btn btn-primary gap-1.5" onClick={openAdd}>
              <Plus size={15} /> Add train
            </button>
          }
        />
      )}

      <AddTrainDrawer open={addOpen} onClose={() => setAddOpen(false)} onAdd={addTrain} />
      <TrainDrawer train={drawerTrain as StarTrain | null} notes={drawerTrain ? (board.notes.get(drawerTrain.id) ?? []) : []} org={org} open={drawer?.open ?? null} onClose={() => setDrawer(null)} api={api} />
    </div>
  );
}
