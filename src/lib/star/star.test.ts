import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLegacyRisk, computeMatrixRisk, matrixPicks, riskFromTrain } from "./risk.ts";
import { computePlanStatus, needsRioChecklist, parsePlanData, planBullets, preferredKey, rioLines } from "./plans.ts";
import { checkTrain, type TrainCheckState } from "./reminders.ts";
import { groupSessions, matchesSession } from "./history.ts";
import { incidentLabel, incidentName } from "./format.ts";
import type { StarTrain } from "./types.ts";

const base = (o: Partial<StarTrain> = {}): StarTrain =>
  ({ id: 1, incident_key: "K", status: "open", headcode: "1A23", stranded_at: "2026-10-11T10:00:00Z", next_review_at: null, risk_matrix: null, plan_data: null, plan_preferred: null, plan_status: "none", ...o }) as StarTrain;

test("matrix score and RAG match the spreadsheet thresholds", () => {
  const red = computeMatrixRisk(matrixPicks(base({ risk_matrix: JSON.stringify({ rm_pax_loading: "standing", rm_traction_power_available: "not_available", rm_toilets: "no_working", rm_vulnerable: "significant", rm_onboard_env: "not_comfortable", rm_train_type: "electric", rm_comms: "none" }) })));
  assert.equal(red?.score, 3 + 5 + 3 + 5 + 3 + 5 + 5);
  assert.equal(red?.rag, "red");
  const amber = computeMatrixRisk({ rm_proximity_station: "400m", rm_other_transport: "yes", rm_outside_env: "good" });
  assert.deepEqual([amber?.score, amber?.rag], [12, "amber"]);
  const green = computeMatrixRisk({ rm_pax_loading: "seats_available" });
  assert.deepEqual([green?.score, green?.rag], [1, "green"]);
  assert.equal(computeMatrixRisk({}), null);
});

test("a real stored matrix row scores", () => {
  const rm = '{"rm_pax_loading":"seats_available","rm_traction_power_available":"available","rm_toilets":"working","rm_vulnerable":"low","rm_onboard_env":"comfortable","rm_proximity_station":"over_800m","rm_proximity_depot":"over_800m","rm_other_transport":"no","rm_egress_view":"no","rm_outside_env":"poor"}';
  const r = riskFromTrain(base({ risk_matrix: rm }));
  assert.equal(r.mode, "matrix");
  assert.equal(r.score, 1 + 1 + 0 + 1 + 0 + 1 + 1 + 0 + 0 + 0);
});

test("without a matrix the legacy time score applies", () => {
  const r = computeLegacyRisk(base({ hvac_status: "failed" }), new Date("2026-10-11T11:05:00Z"));
  assert.deepEqual([r.score, r.rag, r.mode], [2 + 3 + 5 + 2, "red", "legacy"]);
});

test("plan_data stored as a JSON string inside JSONB parses", () => {
  const stored = JSON.stringify({ A: { aim: "detrain", egress: "platform_station" }, B: {}, C: {}, meta: { preferred: "A", actioning: true } });
  const pd = parsePlanData(stored);
  assert.equal(pd.A.aim, "detrain");
  const t = base({ plan_data: stored });
  assert.equal(preferredKey(t), "A");
  assert.equal(needsRioChecklist(t), true);
  assert.deepEqual(planBullets(t).bullets, ["Aim: Evacuate passengers (detrain)", "Egress / welfare: To platform / station"]);
  assert.equal(parsePlanData({ A: { aim: "fix_fault" } }).A.aim, "fix_fault");
  assert.equal(parsePlanData(null).meta.preferred, undefined);
});

test("plan status follows the builder", () => {
  const empty = parsePlanData(null);
  assert.equal(computePlanStatus(empty, "none", false), "none");
  const some = parsePlanData({ A: { aim: "hold_manage" } });
  assert.equal(computePlanStatus(some, "none", false), "forming");
  assert.equal(computePlanStatus(some, "A", false), "agreed");
  assert.equal(computePlanStatus(some, "A", true), "executing");
});

test("RIO lines only when something is captured, isolations only with OLE", () => {
  assert.deepEqual(rioLines({}), []);
  const lines = rioLines({ method: "Trackside", ole: "no", isolations: "yes", pax: "159" });
  assert.deepEqual(lines, ["Evac method: Trackside", "OLE present: No", "Passengers onboard: 159"]);
});

test("check cadence: 20 / 30 / 60 then every 20 minutes", () => {
  const st: TrainCheckState = {};
  const t0 = Date.parse("2026-10-11T10:00:00Z");
  let t = base();
  let r = checkTrain(t, t0 + 5 * 60000, st);
  assert.equal(r.nextReviewAt, "2026-10-11T10:20:00.000Z");
  assert.deepEqual(r.notices, []);
  t = base({ next_review_at: r.nextReviewAt });
  r = checkTrain(t, t0 + 21 * 60000, st);
  assert.equal(r.nextReviewAt, "2026-10-11T10:30:00.000Z");
  assert.deepEqual(r.notices, ["m20"]);
  t = base({ next_review_at: r.nextReviewAt, risk_matrix: '{"rm_toilets":"working"}' });
  r = checkTrain(t, t0 + 31 * 60000, st);
  assert.equal(r.nextReviewAt, "2026-10-11T11:00:00.000Z");
  assert.deepEqual(r.notices, ["m30"]);
  t = base({ next_review_at: r.nextReviewAt, risk_matrix: '{"rm_toilets":"working"}' });
  r = checkTrain(t, t0 + 61 * 60000, st);
  assert.equal(r.nextReviewAt, "2026-10-11T11:21:00.000Z");
  assert.deepEqual(r.notices, ["m60"]);
  t = base({ next_review_at: r.nextReviewAt, risk_matrix: '{"rm_toilets":"working"}' });
  r = checkTrain(t, t0 + 81 * 60000, st);
  assert.deepEqual(r.notices, ["cycle"]);
  assert.equal(r.nextReviewAt, "2026-10-11T11:41:00.000Z");
  // Nothing fires twice in a session.
  r = checkTrain(base({ next_review_at: r.nextReviewAt, risk_matrix: '{"rm_toilets":"working"}' }), t0 + 82 * 60000, st);
  assert.deepEqual(r, { nextReviewAt: null, notices: [] });
});

test("closed trains are left alone", () => {
  assert.deepEqual(checkTrain(base({ status: "closed" }), Date.now(), {}), { nextReviewAt: null, notices: [] });
});

test("closed incidents group by session, newest close first", () => {
  const row = (incident_key: string, session_id: string, headcode: string, stranded_at: string, archived_at: string, org = "NR") =>
    ({ incident_key, session_id, headcode, stranded_at, created_at: stranded_at, archived_at, updated_by_org: org });
  const out = groupSessions(
    [
      row("AAAA1111", "S1", "1A23", "2026-10-01T10:00:00.000Z", "2026-10-01T12:00:00.000Z"),
      row("AAAA1111", "S1", "2B45", "2026-10-01T09:30:00.000Z", "2026-10-01T12:00:00.000Z"),
      row("AAAA1111", "S2", "1C01", "2026-10-05T08:00:00.000Z", "2026-10-05T09:00:00.000Z", "EMR"),
      row("BBBB2222", "S9", "1D02", "2026-10-03T08:00:00.000Z", "2026-10-03T10:00:00.000Z"),
    ],
    new Map([["AAAA1111", "Loughborough OLE"]]),
  );
  assert.deepEqual(
    out.map((s) => [s.incident_key, s.session_id, s.trains]),
    [["AAAA1111", "S2", 1], ["BBBB2222", "S9", 1], ["AAAA1111", "S1", 2]],
  );
  const s1 = out[2];
  assert.equal(s1.started_at, "2026-10-01T09:30:00.000Z");
  assert.equal(s1.name, "Loughborough OLE");
  assert.deepEqual(s1.headcodes, ["1A23", "2B45"]);
  assert.equal(out[0].closed_by_org, "EMR");
  assert.equal(out[1].name, null);
  assert.ok(matchesSession(s1, "lough"));
  assert.ok(matchesSession(s1, "2b45"));
  assert.ok(!matchesSession(s1, "1C01"));
});

test("incident names are tidied; the label falls back to the key", () => {
  assert.equal(incidentName("  Loughborough   OLE\n Up Fast "), "Loughborough OLE Up Fast");
  assert.equal(incidentName("   "), null);
  assert.equal(incidentName("x".repeat(80))?.length, 60);
  assert.equal(incidentLabel({ incident_key: "K1", name: "Named" }), "Named");
  assert.equal(incidentLabel({ incident_key: "K1", name: null }), "K1");
  assert.equal(incidentLabel(null, "K2"), "K2");
});
