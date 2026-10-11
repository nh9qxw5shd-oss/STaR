"use client";

// Incident overview PDF: a summary table, then a page per train with risk drivers, weather,
// the preferred plan, the RIO checklist when it applies, and the latest notes. Same content as
// STaR V2's export.

import { RM_SECTIONS, matrixPicks, pickLabel, riskFromTrain, rmPoints } from "./risk.ts";
import { needsRioChecklist, parsePlanData, planBullets, planStatusLabel, rioLines } from "./plans.ts";
import { fmtDateTime, minutesSince } from "./format.ts";
import type { StarIncident, StarNote, StarTrain } from "./types.ts";

function matrixLines(t: StarTrain): string[] {
  const picks = matrixPicks(t);
  const out: string[] = [];
  for (const sec of RM_SECTIONS) {
    for (const row of sec.rows) {
      const v = picks[`rm_${row.key}`];
      if (!v) continue;
      out.push(`${row.label}: ${pickLabel(v)} (+${rmPoints(row.key, v)})`);
    }
  }
  return out;
}

export async function exportIncidentPdf(opts: {
  incident: StarIncident | null;
  trains: StarTrain[];
  notes: Map<number, StarNote[]>;
  org: string;
  filename?: string;
}): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const { incident, trains, notes, org } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const table = (startY: number, head: string[], body: string[][], extra: Record<string, unknown> = {}) =>
    autoTable(doc, { startY, head: [head], body, styles: { font: "helvetica", fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: [240, 243, 247], textColor: [17, 24, 39] }, theme: "grid", margin: { left: margin, right: margin }, ...extra });

  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("STaR Incident Overview", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 18;
  const started = incident?.started_at ?? null;
  for (const line of [
    `Incident key: ${incident?.incident_key ?? ""}`,
    `Status: ${started ? "active" : "inactive"}`,
    `Started: ${started ? fmtDateTime(started) : "Not started"}`,
    incident?.closed_at ? `Closed: ${fmtDateTime(incident.closed_at)}` : "",
    org ? `Context org: ${org}` : "",
  ].filter(Boolean)) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 6;
  const active = trains.filter((t) => t.status !== "closed").length;
  doc.setFont("helvetica", "bold");
  doc.text("Snapshot", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.text(`Incident elapsed: ${started ? minutesSince(started) : 0} min`, margin, y);
  y += 14;
  doc.text(`Trains tracked: ${trains.length} (active ${active}, closed ${trains.length - active})`, margin, y);
  y += 18;

  table(
    y,
    ["Train", "Rough location", "RAG", "Score", "Preferred plan", "Plan status", "State"],
    trains.map((t) => {
      const r = riskFromTrain(t);
      return [t.headcode ?? "", t.location_text ?? "", r.rag.toUpperCase(), String(r.score), t.plan_preferred ? `Plan ${t.plan_preferred}` : "", planStatusLabel(t.plan_status), t.status === "closed" ? "Closed" : "Active"];
    }),
  );

  const sorted = [...trains].sort((a, b) => minutesSince(b.created_at) - minutesSince(a.created_at));
  for (const t of sorted) {
    doc.addPage();
    let yy = margin;
    const r = riskFromTrain(t);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(t.headcode || "(No headcode)", margin, yy);
    yy += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Rough location: ${t.location_text ?? ""}`, margin, yy);
    yy += 14;
    doc.text(`Time since added: ${minutesSince(t.created_at)} min`, margin, yy);
    yy += 14;
    doc.text(`RAG: ${r.rag.toUpperCase()} (score ${r.score})`, margin, yy);
    yy += 18;

    doc.setFont("helvetica", "bold");
    doc.text("Risk drivers (matrix)", margin, yy);
    yy += 12;
    const ml = matrixLines(t);
    table(yy, ["Item"], (ml.length ? ml : ["No matrix selections captured."]).map((l) => [l]));
    yy = lastY() + 14;

    doc.setFont("helvetica", "bold");
    doc.text("Weather", margin, yy);
    yy += 12;
    doc.setFont("helvetica", "normal");
    doc.text(t.weather_summary || "Not captured", margin, yy);
    yy += 18;

    const pb = planBullets(t);
    doc.setFont("helvetica", "bold");
    doc.text("Plan status", margin, yy);
    yy += 12;
    doc.setFont("helvetica", "normal");
    doc.text(`Preferred: ${pb.pref ? `Plan ${pb.pref}` : "Not set"}  ·  Status: ${planStatusLabel(t.plan_status)}`, margin, yy);
    yy += 14;
    table(yy, ["Preferred plan summary"], pb.bullets.map((b) => [b]));
    yy = lastY() + 14;

    if (needsRioChecklist(t)) {
      const rl = rioLines(parsePlanData(t.plan_data).meta.rioChecklist ?? {});
      if (rl.length) {
        doc.setFont("helvetica", "bold");
        doc.text("RIO Evac Checklist", margin, yy);
        yy += 12;
        table(yy, ["Check / detail"], rl.map((l) => [l]));
        yy = lastY() + 14;
      }
    }

    doc.setFont("helvetica", "bold");
    doc.text("Notes (latest)", margin, yy);
    yy += 12;
    const ns = (notes.get(t.id) ?? []).slice(0, 8).map((n) => [fmtDateTime(n.created_at), n.org_context ?? "", n.note_text ?? ""]);
    table(yy, ["Time", "Org", "Note"], ns.length ? ns : [["", "", "No notes captured."]], {
      styles: { font: "helvetica", fontSize: 8, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 70 }, 2: { cellWidth: pageW - margin * 2 - 180 } },
    });

    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`Generated by STaR · ${fmtDateTime(new Date().toISOString())}`, margin, pageH - 22);
    doc.setTextColor(0, 0, 0);
  }

  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  doc.save(opts.filename ?? `STaR_Incident_${incident?.incident_key || "overview"}_${ts}.pdf`);
}
