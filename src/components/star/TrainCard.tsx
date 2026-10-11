"use client";

// One stranded train: headcode, risk, plan, live timer, flags, the latest notes and a menu into
// its modules. Flags jump straight to the matrix row or the map they relate to.

import { Bath, Lightbulb, Map as MapIcon, MoreHorizontal, NotebookPen, ThermometerSnowflake, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, StatusDot } from "@/components/ui";
import { Timer } from "./Timer";
import { riskFromTrain, type Rag } from "@/lib/star/risk";
import { label, parsePlanData, planStatusLabel, preferredKey } from "@/lib/star/plans";
import { fmtTime, relTime } from "@/lib/star/format";
import type { StarNote, StarTrain } from "@/lib/star/types";

export const RAG_COLOR: Record<Rag, string> = { red: "var(--poor)", amber: "var(--moderate)", green: "var(--good)" };

export type OpenView = { view: "menu" | "core" | "matrix" | "summary" | "plans" | "rio" | "location" | "notes"; tab?: "onboard" | "location" | "traction"; focus?: string };

function Flag({ title, onClick, tone, children }: { title: string; onClick: () => void; tone: "bad" | "warn" | "ok"; children: ReactNode }) {
  const color = tone === "bad" ? "var(--poor)" : tone === "warn" ? "var(--moderate)" : "var(--good)";
  return (
    <button type="button" className="btn btn-sm btn-icon" title={title} aria-label={title} onClick={onClick} style={{ color, borderColor: `color-mix(in srgb, ${color} 40%, var(--border))` }}>
      {children}
    </button>
  );
}

export function TrainCard({ train, notes, org, onOpen }: { train: StarTrain; notes: StarNote[]; org: string; onOpen: (o: OpenView) => void }) {
  const risk = riskFromTrain(train);
  const closed = train.status === "closed";
  const start = train.stranded_at || train.created_at;
  const pref = preferredKey(train);
  const aim = pref ? label("aim", parsePlanData(train.plan_data)[pref].aim) : null;
  const planText = pref ? `Plan ${pref}${aim ? ` · ${aim}` : ""}` : `Plan ${planStatusLabel(train.plan_status)}`;
  const planColor = train.plan_status === "agreed" || train.plan_status === "executing" ? "var(--damp)" : train.plan_status === "forming" ? "var(--moderate)" : "var(--text-dim)";
  const pinned = train.lat != null && train.lon != null;

  const flags: ReactNode[] = [];
  if (train.hvac_status === "failed") flags.push(<Flag key="hvac" tone="bad" title="HVAC failed" onClick={() => onOpen({ view: "matrix", tab: "traction", focus: "hvac_lighting" })}><ThermometerSnowflake size={15} /></Flag>);
  if (train.toilet_status === "failed") flags.push(<Flag key="wc" tone="bad" title="Toilets failed" onClick={() => onOpen({ view: "matrix", tab: "onboard", focus: "toilets" })}><Bath size={15} /></Flag>);
  if (train.power_status === "failed") flags.push(<Flag key="pwr" tone="bad" title="Power / lighting failed" onClick={() => onOpen({ view: "matrix", tab: "onboard", focus: "traction_power_available" })}><Lightbulb size={15} /></Flag>);
  if (train.pax_load === "high") flags.push(<Flag key="pax" tone="warn" title="High passenger load" onClick={() => onOpen({ view: "matrix", tab: "onboard", focus: "pax_loading" })}><Users size={15} /></Flag>);
  if (pinned) flags.push(<Flag key="map" tone="ok" title="Pinned location" onClick={() => onOpen({ view: "location" })}><MapIcon size={15} /></Flag>);

  return (
    <article className="card train-card flex flex-col" style={{ borderTopColor: RAG_COLOR[risk.rag], opacity: closed ? 0.7 : 1 }}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <button type="button" className="min-w-0 text-left" onClick={() => onOpen({ view: "menu" })} title="Open modules">
            <div className="font-mono text-2xl font-bold tracking-wide">{train.headcode || "—"}</div>
            <div className="truncate text-xs text-dim">
              {train.toc || "UNKNOWN"} · {train.location_text || "Location not set"}
              {train.line ? ` · ${train.line}` : ""}
            </div>
          </button>
          <div className="flex shrink-0 items-start gap-2">
            <div className="rounded-lg border border-edge bg-sunken px-2.5 py-1.5 text-center">
              <Timer start={start} end={closed ? train.updated_at : null} className="text-lg font-bold" />
              <div className="text-[10px] font-semibold uppercase tracking-wide text-faint">{closed ? "Closed" : "Stranded"}</div>
            </div>
            <button type="button" className="btn btn-icon" onClick={() => onOpen({ view: "menu" })} aria-label={`Open modules for ${train.headcode}`} title="Open modules">
              <MoreHorizontal size={17} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge color={RAG_COLOR[risk.rag]} dot>
            {risk.rag.toUpperCase()} · {risk.score}
            {risk.mode === "legacy" && <span className="ml-1 opacity-70">time</span>}
          </Badge>
          <button type="button" className="chip" onClick={() => onOpen({ view: pref ? "summary" : "plans" })} style={{ color: planColor }} title={pref ? "Preferred plan at a glance" : "Build plans"}>
            <span className="dot" style={{ color: planColor }} />
            <span className="max-w-[220px] truncate">{planText}</span>
          </button>
          {closed && <Badge color="var(--poor)">Closed</Badge>}
        </div>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {train.next_review_at && !closed && (
            <span className="chip" style={{ color: "var(--moderate)" }}>
              <StatusDot color="var(--moderate)" /> Next assess {fmtTime(train.next_review_at)}
            </span>
          )}
          <span className="chip">{train.weather_summary || "Weather not set"}</span>
          <span className="chip" style={{ color: pinned ? "var(--good)" : "var(--moderate)" }}>
            <StatusDot color={pinned ? "var(--good)" : "var(--moderate)"} /> {pinned ? "Pinned" : "No pin"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">{flags.length ? flags : <span className="text-xs text-faint">No active flags</span>}</div>

        <div className="rounded-lg border border-edge bg-sunken p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-dim">
            <span className="font-semibold">Notes</span>
            <span>
              Tagged: <span className="font-mono">{org || "not set"}</span>
            </span>
          </div>
          <div className="max-h-28 space-y-2 overflow-y-auto">
            {notes.slice(0, 3).map((n) => (
              <div key={n.id} className="text-sm">
                <div className="text-[11px] font-semibold text-faint">
                  {n.org_context || "—"} · {fmtTime(n.created_at)}
                </div>
                <div className="whitespace-pre-wrap">{n.note_text}</div>
              </div>
            ))}
            {notes.length === 0 && <p className="text-xs text-faint">No notes yet.</p>}
          </div>
          <div className="mt-2 flex justify-end">
            <button type="button" className="btn btn-sm gap-1.5" onClick={() => onOpen({ view: "notes" })}>
              <NotebookPen size={13} /> Add / view notes
            </button>
          </div>
        </div>
      </div>
      <footer className="mt-auto border-t border-edge px-4 py-2 text-[11px] text-faint" suppressHydrationWarning>
        Last: {train.updated_at ? `${train.updated_by_org || "—"} · ${relTime(train.updated_at)}` : "—"}
      </footer>
    </article>
  );
}
