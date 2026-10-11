// Row shapes of the STaR tables (Mini Project Hub). Column names are the database's own.

export interface StarIncident {
  id: number;
  incident_key: string;
  created_at: string | null;
  created_by_org: string | null;
  started_at: string | null;
  started_by_org: string | null;
  current_session_id: string | null;
  closed_at: string | null;
  closed_by_org: string | null;
}

export interface StarTrain {
  id: number;
  incident_key: string;
  session_id: string | null;
  headcode: string | null;
  toc: string | null;
  line: string | null;
  location_text: string | null;
  location_risk: string | null;
  stranded_at: string | null;
  plan_status: string | null;
  next_review_at: string | null;
  pax_load: string | null;
  hvac_status: string | null;
  toilet_status: string | null;
  power_status: string | null;
  status: string | null;
  lat: number | null;
  lon: number | null;
  weather_summary: string | null;
  created_at: string | null;
  updated_at: string | null;
  updated_by_org: string | null;
  archived_at: string | null;
  /** JSON text of the matrix picks (rm_* keys). */
  risk_matrix: string | Record<string, unknown> | null;
  plan_preferred: string | null;
  /** JSONB; older saves hold the plans as a JSON string inside it. */
  plan_data: unknown;
  // Older rows may carry the matrix picks as columns.
  [extra: string]: unknown;
}

export interface StarNote {
  id: number | string;
  incident_key: string;
  train_id: number;
  org_context: string | null;
  note_text: string | null;
  created_at: string;
  session_id: string | null;
  archived_at?: string | null;
}

export const TOCS = ["UNKNOWN", "EMR", "GTR", "XC", "LNER", "OTHER"] as const;

export const ORGS: { value: string; label: string }[] = [
  { value: "NR", label: "Network Rail" },
  { value: "EMR", label: "EMR" },
  { value: "GTR", label: "GTR" },
  { value: "XC", label: "CrossCountry" },
  { value: "LNER", label: "LNER" },
  { value: "OTHER", label: "Other" },
];
