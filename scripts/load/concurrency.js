/* global __ENV, open */
import { check } from "k6";
import { vu } from "k6/execution";
import http from "k6/http";
import { Counter } from "k6/metrics";

const fixture = JSON.parse(open(__ENV.SEATSYNC_K6_INPUT));
const accepted = new Counter("seat_accepted");
const conflicts = new Counter("seat_conflicts");
const unexpected = new Counter("unexpected_outcomes");
const receivedByA = new Counter("requests_instance_a");
const receivedByB = new Counter("requests_instance_b");

export const options = {
  scenarios: { concurrency: { executor: "per-vu-iterations", vus: fixture.users.length, iterations: 1, maxDuration: "45s" } },
  thresholds: {
    checks: ["rate==1"],
    seat_accepted: [`count==${fixture.mode === "hold" ? 1 : fixture.users.length}`],
    seat_conflicts: [`count==${fixture.mode === "hold" ? fixture.users.length - 1 : 0}`],
    unexpected_outcomes: ["count==0"],
    requests_instance_a: [`count==${Math.ceil(fixture.users.length / 2)}`],
    requests_instance_b: [`count==${Math.floor(fixture.users.length / 2)}`],
  },
};

export default function sendContender() {
  const index = vu.idInTest - 1;
  const target = fixture.targets[index % 2];
  const cookie = fixture.users[index];
  const route = fixture.mode === "hold" ? "/api/reservations/hold" : `/api/reservations/${fixture.reservationId}/confirm`;
  const extra = fixture.mode === "confirm" ? { "Idempotency-Key": fixture.confirmKey } : {};
  const response = http.post(target.origin + route, JSON.stringify(fixture.selection ?? {}), {
    headers: { Cookie: cookie, "Content-Type": "application/json", ...extra }, redirects: 0, timeout: "35s",
  });

  let responseBody;
  try { responseBody = response.json(); } catch { responseBody = null; }
  const isAccepted = fixture.mode === "hold"
    ? response.status === 201 && responseBody?.data?.status === "HELD"
    : response.status === 200 && responseBody?.data?.status === "CONFIRMED" && Boolean(responseBody.data.bookingReference);
  const isConflict = fixture.mode === "hold" && response.status === 409 &&
    ["SEAT_CONFLICT", "SEAT_COORDINATION_BUSY"].includes(responseBody?.error?.code);
  const instance = response.headers["X-Seatsync-Instance"];
  accepted.add(Number(isAccepted));
  conflicts.add(Number(isConflict));
  unexpected.add(Number(!isAccepted && !isConflict));
  receivedByA.add(Number(instance === fixture.targets[0].instance));
  receivedByB.add(Number(instance === fixture.targets[1].instance));
  check(response, { "valid response and expected instance": () => (isAccepted || isConflict) && instance === target.instance });
}

export function handleSummary(data) {
  const total = Object.fromEntries([accepted, conflicts, unexpected, receivedByA, receivedByB].map(({ name }) =>
    [name, data.metrics[name]?.values.count ?? 0]));
  const latency = data.metrics.http_req_duration?.values ?? {};
  return {
    [__ENV.SEATSYNC_K6_OUTPUT]: JSON.stringify({ ...total, p95Ms: latency["p(95)"] ?? null }, null, 2),
  };
}
