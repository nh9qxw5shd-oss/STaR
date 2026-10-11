// Plans A/B/C, the preferred plan, plan status and the RIO evacuation checklist. Same labels,
// rules and stored shape as STaR V2: plan_data = { A, B, C, meta: { preferred, actioning,
// activeTab, rioChecklist } }.

import type { StarTrain } from "./types.ts";

export const PLAN_LABELS = {
  aim: {
    hold_manage: "Hold at current location",
    move_train: "Move train to nearest station or suitable place",
    evacuate: "Split units and evacuate passengers using the functional unit",
    detrain: "Evacuate passengers (detrain)",
    fix_fault: "Fix the unit fault",
  },
  approach: {
    manage_onboard: "Manage onboard with welfare mitigation (for detained train)",
    move_to_platform: "Move to platform / station",
    evacuate_assist: "Move train forwards using degraded working",
    fitters_site: "Fitters to site to rectify",
    detrain_to_track: "Detrain via safest option",
  },
  egress: {
    platform_station: "To platform / station",
    transfer_side: "Transfer to another train – side to side",
    transfer_end: "Transfer to another train – end to end",
    transfer_ballast: "Transfer to another train – via ballast",
    trackside_access: "Trackside – to access point",
    trackside_station: "Trackside – to station / platform",
    trackside_lx: "Trackside – to level crossing",
    other: "Other / bespoke",
  },
  resources: {
    rio: "Rail Incident Officer",
    btps: "British Transport Police",
    fire: "Fire and Rescue Service",
    ambulance: "Ambulance Service",
    toc_staff: "Train Operator staff",
    nr_ops: "Network Rail operations staff",
    nr_mom: "Mobile Operations Manager",
    isolations: "Electrical isolation / isolations support",
    taxi_bus: "Road transport (bus/taxi)",
    welfare: "Additional welfare supplies (water, blankets, etc.)",
  },
} as const;

export const LOCATION_RISKS: { value: string; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "openline", label: "Open line" },
  { value: "tunnel", label: "Tunnel" },
  { value: "viaduct", label: "Viaduct" },
  { value: "remote", label: "Remote" },
];

export type PlanKey = "A" | "B" | "C";
export const PLAN_KEYS: PlanKey[] = ["A", "B", "C"];

export interface Plan {
  aim?: string;
  approach?: string;
  egress?: string;
  resources?: string[];
  notes?: string;
}

export interface RioChecklist {
  method?: string;
  safeguards?: string;
  ole?: "yes" | "no" | null;
  isolations?: "yes" | "no" | null;
  resources_ok?: "yes" | "no" | null;
  safe_route?: "yes" | "no" | null;
  lighting?: "yes" | "no" | null;
  receiving?: "yes" | "no" | null;
  pax?: string;
  vulnerable?: string;
  lead?: string;
  luggage?: string;
  other_staff?: string;
  notes?: string;
  _updated_at?: string;
  _updated_by?: string | null;
}

export interface PlanData {
  A: Plan;
  B: Plan;
  C: Plan;
  meta: { preferred?: string | null; actioning?: boolean; activeTab?: PlanKey; rioChecklist?: RioChecklist };
}

/** Reads plan_data whether it is an object, a JSON string, or a JSON string of a JSON string. */
export function parsePlanData(raw: unknown): PlanData {
  let v = raw;
  for (let i = 0; i < 2 && typeof v === "string"; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      v = null;
    }
  }
  const o = v && typeof v === "object" ? (v as Partial<PlanData> & { plans?: Partial<PlanData> }) : {};
  // Very old shape: { plans: { A, B, C } }
  const src = o.A || o.B || o.C ? o : (o.plans ?? {});
  return {
    A: { ...(src.A ?? {}) },
    B: { ...(src.B ?? {}) },
    C: { ...(src.C ?? {}) },
    meta: { ...(o.meta ?? {}) },
  };
}

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean" || typeof v === "number") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.values(v as object).some(hasValue);
  return String(v).trim() !== "";
}

export function hasAnyPlanData(pd: PlanData): boolean {
  return PLAN_KEYS.some((k) => hasValue(pd[k]));
}

export function preferredKey(train: Pick<StarTrain, "plan_data" | "plan_preferred">): PlanKey | null {
  const k = parsePlanData(train.plan_data).meta.preferred || train.plan_preferred || null;
  return k === "A" || k === "B" || k === "C" ? k : null;
}

/** forming → agreed → executing, from what the builder holds. */
export function computePlanStatus(pd: PlanData, preferred: string | null, actioning: boolean): "none" | "forming" | "agreed" | "executing" {
  if (actioning) return "executing";
  if (preferred && preferred !== "none") return "agreed";
  if (hasAnyPlanData(pd)) return "forming";
  return "none";
}

export function planStatusLabel(status: string | null | undefined): string {
  const s = (status || "none").toLowerCase();
  if (s === "forming") return "FORMULATING";
  return s.toUpperCase();
}

/** Preferred plan executing: the 60-minute check is satisfied. */
export function isPreferredExecuting(train: Pick<StarTrain, "plan_preferred" | "plan_status">): boolean {
  return !!(train.plan_preferred || "").trim() && (train.plan_status || "").toLowerCase() === "executing";
}

/** The RIO checklist applies only when the preferred plan's aim is to detrain. */
export function needsRioChecklist(train: Pick<StarTrain, "plan_data" | "plan_preferred">): boolean {
  const pref = preferredKey(train);
  if (!pref) return false;
  return String(parsePlanData(train.plan_data)[pref].aim || "").toLowerCase() === "detrain";
}

export function label<K extends keyof typeof PLAN_LABELS>(group: K, value: string | undefined): string | null {
  if (!value) return null;
  const table = PLAN_LABELS[group] as Record<string, string>;
  return table[value] ?? value;
}

/** Bullets for the preferred plan (or Plan A when none is preferred). */
export function planBullets(train: Pick<StarTrain, "plan_data" | "plan_preferred">): { pref: PlanKey | null; bullets: string[] } {
  const pref = preferredKey(train);
  const p = parsePlanData(train.plan_data)[pref ?? "A"];
  const bullets: string[] = [];
  if (p.aim) bullets.push(`Aim: ${label("aim", p.aim)}`);
  if (p.approach) bullets.push(`Approach: ${label("approach", p.approach)}`);
  if (p.egress) bullets.push(`Egress / welfare: ${label("egress", p.egress)}`);
  if (p.resources?.length) bullets.push(`Resources / actions: ${p.resources.map((r) => label("resources", r) ?? r.toUpperCase()).join(", ")}`);
  if (p.notes?.trim()) bullets.push(`Plan notes: ${p.notes.trim()}`);
  if (!bullets.length) bullets.push("No plan details captured yet.");
  return { pref, bullets };
}

export function rioLines(rio: RioChecklist): string[] {
  const clean = (v: unknown) => (v == null ? "" : String(v).trim());
  const yn = (v: unknown) => (String(v).toLowerCase() === "yes" ? "Yes" : String(v).toLowerCase() === "no" ? "No" : "");
  const any = Object.entries(rio).some(([k, v]) => !k.startsWith("_") && v != null && (typeof v !== "string" || v.trim() !== ""));
  if (!any) return [];
  const lines = [`Evac method: ${clean(rio.method)}`];
  if (clean(rio.safeguards)) lines.push(`Safeguards: ${clean(rio.safeguards)}`);
  if (yn(rio.ole)) lines.push(`OLE present: ${yn(rio.ole)}`);
  if (rio.ole === "yes" && yn(rio.isolations)) lines.push(`Isolations required/in place: ${yn(rio.isolations)}`);
  if (yn(rio.resources_ok)) lines.push(`All necessary resources: ${yn(rio.resources_ok)}`);
  if (yn(rio.safe_route)) lines.push(`Safe route identified: ${yn(rio.safe_route)}`);
  if (yn(rio.lighting)) lines.push(`Sufficient lighting: ${yn(rio.lighting)}`);
  if (clean(rio.pax)) lines.push(`Passengers onboard: ${clean(rio.pax)}`);
  if (clean(rio.vulnerable)) lines.push(`Vulnerable passengers: ${clean(rio.vulnerable)}`);
  if (clean(rio.lead)) lines.push(`Vulnerable lead: ${clean(rio.lead)}`);
  if (clean(rio.luggage)) lines.push(`Luggage / manageability: ${clean(rio.luggage)}`);
  if (clean(rio.other_staff)) lines.push(`Other competent staff onboard: ${clean(rio.other_staff)}`);
  if (yn(rio.receiving)) lines.push(`Receiving location expecting pax: ${yn(rio.receiving)}`);
  if (clean(rio.notes)) lines.push(`Notes: ${clean(rio.notes)}`);
  return lines;
}
