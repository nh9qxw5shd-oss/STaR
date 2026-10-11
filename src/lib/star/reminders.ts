// Per-train check cadence, as STaR V2 ran it: next assessment 20 min after stranding, then 30,
// then 60, then every 20 min. Reminders fire once per browser session when a check is missed:
//   20 min  risk matrix (RAG) not completed
//   30 min  no plan details captured
//   60 min  no preferred plan executing
//   after 60 min, each time the next assessment falls due: review the plan
// Pure: the caller keeps the state map, writes the next_review_at patch and shows the notices.

import type { StarTrain } from "./types.ts";
import { parseRiskMatrix } from "./risk.ts";
import { hasAnyPlanData, isPreferredExecuting, parsePlanData } from "./plans.ts";

export type NoticeKey = "m20" | "m30" | "m60" | "cycle";

export const NOTICE_TEXT: Record<NoticeKey, { title: string; body: string; level: "warn" | "bad"; open: "matrix" | "plan" }> = {
  m20: { title: "20 min check", body: "Complete the RAG (risk matrix) so we are not guessing under pressure.", level: "warn", open: "matrix" },
  m30: { title: "30 min check", body: "No plan details captured yet. Start building Plan A/B/C.", level: "warn", open: "plan" },
  m60: { title: "1 hour escalation", body: "A preferred plan should be nominated and moved to EXECUTING.", level: "bad", open: "plan" },
  cycle: { title: "Plan review cycle", body: "Check the plan is still relevant, update status and confirm next actions.", level: "warn", open: "plan" },
};

export interface TrainCheckState {
  m20?: boolean;
  m30?: boolean;
  m60?: boolean;
  sched30?: boolean;
  sched60?: boolean;
  schedCycle?: boolean;
  lastCycleAt?: number;
}

const MIN = 60_000;

function matrixCaptured(train: StarTrain): boolean {
  if (train.matrix_score != null) return true;
  const picks = parseRiskMatrix(train);
  return !!picks && Object.keys(picks).length > 0;
}

export function checkTrain(
  train: StarTrain,
  now: number,
  st: TrainCheckState,
  incidentStartedAt: string | null = null,
): { nextReviewAt: string | null; notices: NoticeKey[] } {
  const notices: NoticeKey[] = [];
  if ((train.status || "").toLowerCase() === "closed") return { nextReviewAt: null, notices };
  const startIso = train.stranded_at || train.created_at || incidentStartedAt;
  const t0 = startIso ? new Date(startIso).getTime() : now;
  const mins = Math.floor((now - t0) / MIN);
  let next: number | null = train.next_review_at ? new Date(train.next_review_at).getTime() : null;
  let patch: number | null = null;
  const set = (ms: number) => {
    next = ms;
    patch = ms;
  };

  if (next == null) set(t0 + 20 * MIN);
  if (mins >= 20 && !st.sched30) {
    st.sched30 = true;
    set(t0 + 30 * MIN);
  }
  if (mins >= 30 && !st.sched60) {
    st.sched60 = true;
    set(t0 + 60 * MIN);
  }
  if (mins >= 60 && !st.schedCycle) {
    st.schedCycle = true;
    set(now + 20 * MIN);
  }

  if (mins >= 20 && !st.m20 && !matrixCaptured(train)) {
    st.m20 = true;
    notices.push("m20");
  }
  if (mins >= 30 && !st.m30 && !hasAnyPlanData(parsePlanData(train.plan_data))) {
    st.m30 = true;
    notices.push("m30");
  }
  if (mins >= 60 && !st.m60 && !isPreferredExecuting(train)) {
    st.m60 = true;
    notices.push("m60");
  }
  if (mins >= 60 && next != null && now >= next && (!st.lastCycleAt || now - st.lastCycleAt > MIN)) {
    st.lastCycleAt = now;
    notices.push("cycle");
    set(now + 20 * MIN);
  }
  return { nextReviewAt: patch == null ? null : new Date(patch).toISOString(), notices };
}
