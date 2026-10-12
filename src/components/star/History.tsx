"use client";

// Incident history: every closed incident (an archived session of trains and notes), newest
// first, searchable by name, key, headcode or organisation. One opens read only (?i=<key>&s=<session>)
// with each train's risk, preferred plan and notes, a PDF export, and Reopen, which makes that
// session the incident's board again.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, FileDown, History as HistoryIcon, RotateCcw, Search, TrainFront } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, PageSkeleton } from "@/components/ui";
import { useDialog, useToast } from "@/components/uiFeedback";
import { RAG_COLOR } from "./TrainCard";
import * as db from "@/lib/star/data";
import { matchesSession } from "@/lib/star/history";
import { fmtDateTime, fmtHMS, fmtTime, incidentLabel } from "@/lib/star/format";
import { planBullets, planStatusLabel } from "@/lib/star/plans";
import { riskFromTrain } from "@/lib/star/risk";
import { exportIncidentPdf } from "@/lib/star/pdf";
import { currentOrg, setBoard } from "@/lib/star/store";
import type { ClosedSession, StarIncident, StarNote, StarTrain } from "@/lib/star/types";

function duration(from: string | null | undefined, to: string | null | undefined): string {
  if (!from || !to) return "—";
  return fmtHMS(new Date(to).getTime() - new Date(from).getTime());
}

export default function History() {
  const params = useSearchParams();
  const key = (params.get("i") ?? "").trim();
  const session = (params.get("s") ?? "").trim();

  // Keep the sidebar's open incidents current on this page too.
  useEffect(() => {
    db.loadOpenIncidents()
      .then((open) => setBoard({ open }))
      .catch(() => undefined);
  }, []);

  return key && session ? <SessionView incidentKey={key} session={session} /> : <SessionList />;
}

// ------------------------------------------------------------------ list

function SessionList() {
  const toast = useToast();
  const [rows, setRows] = useState<ClosedSession[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    db.loadClosedSessions()
      .then((r) => alive && setRows(r))
      .catch((e) => {
        if (!alive) return;
        setRows([]);
        toast.error("Could not load history", e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [toast]);

  const list = useMemo(() => (rows ?? []).filter((s) => matchesSession(s, q)), [rows, q]);

  if (rows == null) return <PageSkeleton kind="table" />;

  return (
    <>
      <PageHeader
        eyebrow="Stranded Train Risk"
        title="History"
        subtitle="Closed incidents, newest first. Open one to review its trains and notes, export its PDF again, or reopen it."
      />
      <Card
        padded={false}
        title={`${list.length} closed incident${list.length === 1 ? "" : "s"}`}
        action={
          <label className="flex w-full items-center gap-2 text-xs text-dim sm:w-auto">
            <Search size={13} />
            <span className="sr-only">Search history</span>
            <input className="input w-full py-1 text-sm sm:w-56" placeholder="Name, key, headcode, org…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        }
      >
        {list.length === 0 ? (
          <EmptyState icon={HistoryIcon} title={rows.length ? "Nothing matches" : "No closed incidents yet"} hint={rows.length ? "Try a headcode or part of the name." : "Closing an incident archives its board here."} />
        ) : (
          <ul className="divide-y divide-edge">
            {list.map((s) => (
              <li key={`${s.incident_key}-${s.session_id}`}>
                <Link
                  href={`/history?i=${encodeURIComponent(s.incident_key)}&s=${encodeURIComponent(s.session_id)}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className={s.name ? "font-semibold" : "font-mono font-semibold"}>{s.name || s.incident_key}</span>
                      {s.name && <span className="font-mono text-xs text-faint">{s.incident_key}</span>}
                    </span>
                    <span className="block truncate text-xs text-dim">
                      {s.headcodes.slice(0, 6).join(", ")}
                      {s.headcodes.length > 6 ? ` +${s.headcodes.length - 6}` : ""}
                    </span>
                    <span className="block text-xs text-faint">
                      {fmtDateTime(s.started_at)} → {fmtDateTime(s.closed_at)} · {duration(s.started_at, s.closed_at)}
                      {s.closed_by_org ? ` · closed by ${s.closed_by_org}` : ""}
                    </span>
                  </span>
                  <span className="chip shrink-0">
                    <TrainFront size={13} /> {s.trains}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ one session

function SessionView({ incidentKey, session }: { incidentKey: string; session: string }) {
  const router = useRouter();
  const toast = useToast();
  const dialog = useDialog();
  const [data, setData] = useState<{ incident: StarIncident | null; trains: StarTrain[]; notes: Map<number, StarNote[]> } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    db.loadSession(incidentKey, session)
      .then((d) => alive && setData(d))
      .catch((e) => {
        if (!alive) return;
        setData({ incident: null, trains: [], notes: new Map() });
        toast.error("Could not load the incident", e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [incidentKey, session, toast]);

  const trains = data?.trains ?? [];
  const archived = trains.filter((t) => t.archived_at);
  const live = trains.length > 0 && archived.length === 0;
  const startedAt = trains.reduce<string | null>((m, t) => {
    const s = t.stranded_at || t.created_at;
    return s && (!m || s < m) ? s : m;
  }, null);
  const closedAt = archived.reduce<string | null>((m, t) => (t.archived_at && (!m || (t.archived_at as string) > m) ? (t.archived_at as string) : m), null);
  const name = incidentLabel(data?.incident, incidentKey);

  const exportPdf = useCallback(async () => {
    if (!data) return;
    const incident = { ...(data.incident ?? ({ incident_key: incidentKey } as StarIncident)), started_at: startedAt, closed_at: closedAt };
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    try {
      await exportIncidentPdf({ incident, trains: data.trains, notes: data.notes, org: currentOrg(), filename: `STaR_Incident_${incidentKey}_ARCHIVE_${ts}.pdf` });
      toast.success("PDF exported");
    } catch {
      toast.error("PDF export failed");
    }
  }, [data, incidentKey, startedAt, closedAt, toast]);

  async function reopen() {
    const ok = await dialog.confirm({
      title: `Reopen ${name}?`,
      body: "Its trains and notes go back on the live board and the incident clock runs from the earliest train. Trains stay closed until you reopen each one.",
      confirmLabel: "Reopen incident",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await db.reopenSession(incidentKey, session, currentOrg());
      if (r === "busy") {
        toast.error("This incident already has a live board", "Close that board first, or keep it and review this one here.");
        return;
      }
      toast.success("Incident reopened");
      router.push(`/?i=${encodeURIComponent(incidentKey)}`);
    } catch (e) {
      toast.error("Could not reopen", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (data == null) return <PageSkeleton kind="cards" />;

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/history", label: "History" }}
        eyebrow="Closed incident"
        title={data.incident?.name ? <span className="break-words">{data.incident.name}</span> : <span className="font-mono">{incidentKey}</span>}
        subtitle={`${data.incident?.name ? `Key ${incidentKey} · ` : ""}${fmtDateTime(startedAt)} → ${closedAt ? fmtDateTime(closedAt) : "—"} · ${duration(startedAt, closedAt)}`}
        actions={
          <>
            <button className="btn gap-1.5" onClick={() => void exportPdf()} disabled={!trains.length}>
              <FileDown size={15} /> Export PDF
            </button>
            {live ? (
              <Link className="btn btn-primary gap-1.5" href={`/?i=${encodeURIComponent(incidentKey)}`}>
                Open live board
              </Link>
            ) : (
              <button className="btn btn-primary gap-1.5" onClick={reopen} disabled={busy || !trains.length}>
                <RotateCcw size={15} /> {busy ? "Reopening…" : "Reopen incident"}
              </button>
            )}
          </>
        }
      />

      {live && <p className="rounded-lg border border-edge bg-sunken px-3 py-2 text-sm text-dim">This incident has been reopened and is live on the board.</p>}

      {trains.length === 0 ? (
        <EmptyState icon={TrainFront} title="No trains on this session" hint="It may have been reopened and closed again under another session." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {trains.map((t) => (
            <ArchivedTrain key={t.id} train={t} notes={data.notes.get(t.id) ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArchivedTrain({ train, notes }: { train: StarTrain; notes: StarNote[] }) {
  const risk = riskFromTrain(train);
  const { pref, bullets } = planBullets(train);
  const start = train.stranded_at || train.created_at;
  return (
    <article className="card train-card flex flex-col p-4" style={{ borderTopColor: risk.mode === "matrix" ? RAG_COLOR[risk.rag] : "var(--border)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xl font-bold tracking-wide">{train.headcode || "—"}</div>
          <div className="truncate text-xs text-dim">
            {train.toc || "UNKNOWN"} · {train.location_text || "Location not set"}
            {train.line ? ` · ${train.line}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-sm font-bold">{duration(start, train.updated_at || (train.archived_at as string | null))}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">Stranded</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {risk.mode === "matrix" ? (
          <Badge color={RAG_COLOR[risk.rag]} dot>
            {risk.rag.toUpperCase()} · {risk.score}
          </Badge>
        ) : (
          <Badge>No RAG captured</Badge>
        )}
        <Badge>{pref ? `Plan ${pref}` : `Plan ${planStatusLabel(train.plan_status)}`}</Badge>
        {train.weather_summary && <span className="chip text-xs">{train.weather_summary}</span>}
      </div>
      {bullets.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm">
          {bullets.map((b) => (
            <li key={b} className="break-words">
              {b}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 rounded-lg border border-edge bg-sunken p-3">
        <div className="mb-1 text-xs font-semibold text-dim">Notes</div>
        {notes.length === 0 ? (
          <p className="text-xs text-faint">No notes.</p>
        ) : (
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {notes.map((n) => (
              <div key={n.id} className="text-sm">
                <div className="text-[11px] font-semibold text-faint">
                  {n.org_context || "—"} · {fmtTime(n.created_at)}
                </div>
                <div className="whitespace-pre-wrap break-words">{n.note_text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
