// Stranded train risk: the Excel-aligned matrix (Stranded Train RA.xlsm: on-board + location +
// traction triage), with the legacy time-driven score as a fallback until any matrix answer is
// captured. Same points and thresholds as STaR V2.

import type { StarTrain } from "./types.ts";

export type Rag = "red" | "amber" | "green";

export const RM = {
  // A) On-board triage
  pax_loading: { standing: 3, seated: 2, seats_available: 1 },
  traction_power_available: { available: 1, not_available: 5 },
  toilets: { working: 0, no_working: 3 },
  vulnerable: { low: 1, moderate: 3, significant: 5 },
  onboard_env: { comfortable: 0, not_comfortable: 3 },
  // B) Location triage
  proximity_station: { "400m": 4, "800m": 2, over_800m: 1 },
  proximity_depot: { "400m": 3, "800m": 2, over_800m: 1 },
  other_transport: { yes: 5, no: 0 },
  egress_view: { yes: 5, no: 0 },
  outside_env: { poor: 0, good: 3 }, // as per the spreadsheet: good adds score
  // C) Traction risks triage
  train_type: { electric: 5, bimode: 1, diesel: 1 },
  traction_current: { switched_on: 5, switched_off: 1, non_electrified: 0 },
  staff_onboard: { one: 5, two_to_four: 3, more_than_four: 1 },
  comms: { none: 5, mobile: 3, gsmr: 1 },
  hvac_lighting: { yes: 1, no: 5 },
} as const;

/** Total > 23 red; 12–23 amber; under 12 green. */
export const RM_THRESHOLDS = { red_gt: 23, amber_min: 12 };

export type RmKey = keyof typeof RM;

export const RM_SECTIONS: { key: "onboard" | "location" | "traction"; label: string; rows: { key: RmKey; label: string }[] }[] = [
  {
    key: "onboard",
    label: "On-board",
    rows: [
      { key: "pax_loading", label: "Passenger loading" },
      { key: "traction_power_available", label: "Traction power availability (train)" },
      { key: "toilets", label: "Toilet availability" },
      { key: "vulnerable", label: "Vulnerable passengers" },
      { key: "onboard_env", label: "On-board environment" },
    ],
  },
  {
    key: "location",
    label: "Location",
    rows: [
      { key: "proximity_station", label: "Proximity to station" },
      { key: "proximity_depot", label: "Proximity to depot" },
      { key: "other_transport", label: "Easy access to other transport" },
      { key: "egress_view", label: "View of obvious egress area" },
      { key: "outside_env", label: "Outside environment" },
    ],
  },
  {
    key: "traction",
    label: "Traction",
    rows: [
      { key: "train_type", label: "Type of train" },
      { key: "traction_current", label: "Traction current (OLE live)" },
      { key: "staff_onboard", label: "Number of railway staff onboard" },
      { key: "comms", label: "Communication with train" },
      { key: "hvac_lighting", label: "HVAC & passenger lighting working" },
    ],
  },
];

export const RM_KEYS: RmKey[] = RM_SECTIONS.flatMap((s) => s.rows.map((r) => r.key));

/** Picks as stored: { rm_pax_loading: "standing", ... }. */
export type MatrixPicks = Partial<Record<`rm_${RmKey}`, string | null>>;

export function parseRiskMatrix(train: Pick<StarTrain, "risk_matrix"> | null | undefined): MatrixPicks | null {
  const raw = train?.risk_matrix;
  if (!raw) return null;
  if (typeof raw === "object") return raw as MatrixPicks;
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as MatrixPicks) : null;
  } catch {
    return null;
  }
}

/** The current pick for each matrix row: a dedicated rm_* column wins, else the JSON. */
export function matrixPicks(train: Partial<StarTrain> & Pick<StarTrain, "risk_matrix">): MatrixPicks {
  const rm = parseRiskMatrix(train) ?? {};
  const out: MatrixPicks = {};
  for (const k of RM_KEYS) {
    const col = `rm_${k}` as const;
    const v = (train as Record<string, unknown>)[col] ?? rm[col] ?? null;
    out[col] = v == null || v === "" ? null : String(v);
  }
  return out;
}

export function rmPoints(key: RmKey, value: string | null | undefined): number {
  if (!value) return 0;
  const table = RM[key] as Record<string, number>;
  return table[value] ?? 0;
}

export interface Risk {
  rag: Rag;
  score: number;
  mode: "matrix" | "legacy";
  onboard?: number;
  location?: number;
  traction?: number;
}

export function ragFromScore(total: number): Rag {
  if (total > RM_THRESHOLDS.red_gt) return "red";
  if (total >= RM_THRESHOLDS.amber_min) return "amber";
  return "green";
}

/** Matrix risk, or null until at least one matrix answer is captured. */
export function computeMatrixRisk(picks: MatrixPicks): Risk | null {
  const sum = (sec: number) => RM_SECTIONS[sec].rows.reduce((t, r) => t + rmPoints(r.key, picks[`rm_${r.key}`]), 0);
  const captured = RM_KEYS.some((k) => picks[`rm_${k}`]);
  if (!captured) return null;
  const onboard = sum(0);
  const location = sum(1);
  const traction = sum(2);
  const score = onboard + location + traction;
  return { rag: ragFromScore(score), score, mode: "matrix", onboard, location, traction };
}

const STRANDED_MIN = { stranded: 20, amber: 40, red: 60 };

/** Time-driven fallback score from STaR V1 (before any matrix answer exists). */
export function computeLegacyRisk(train: Partial<StarTrain>, now: Date = new Date()): Risk {
  const start = train.stranded_at || train.created_at;
  const mins = start ? Math.floor((now.getTime() - new Date(start).getTime()) / 60000) : 0;
  let score = 0;
  if (mins >= STRANDED_MIN.stranded) score += 2;
  if (mins >= STRANDED_MIN.amber) score += 3;
  if (mins >= STRANDED_MIN.red) score += 5;
  if (train.hvac_status === "failed") score += 2;
  if (train.toilet_status === "failed") score += 2;
  if (train.power_status === "failed") score += 3;
  if (train.pax_load === "high") score += 2;
  if (train.pax_load === "med") score += 1;
  if (train.location_risk === "tunnel") score += 3;
  if (train.location_risk === "viaduct") score += 2;
  if (train.location_risk === "remote") score += 2;
  if (train.location_risk === "openline") score += 1;
  if (train.plan_status === "agreed") score -= 1;
  if (train.plan_status === "executing") score -= 2;
  const rag: Rag = score >= 8 ? "red" : score >= 4 ? "amber" : "green";
  return { rag, score, mode: "legacy" };
}

export function riskFromTrain(train: StarTrain, now: Date = new Date()): Risk {
  return computeMatrixRisk(matrixPicks(train)) ?? computeLegacyRisk(train, now);
}

/** "seats_available" → "Seats available", "two_to_four" → "Two–four". */
export function pickLabel(v: string): string {
  const s = v.replaceAll("_", " ").replace(/\bto\b/g, "–").replace(/ – /g, "–");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
