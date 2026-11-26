"use client";

import { Activity, ArrowUpRight, Clock3, GitCompare, KeyRound, Layers, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LabResult, LabScenario } from "@/types/engineering";
import styles from "./lab.module.css";

const demos = [
  { id: "race", label: "Seat race", Icon: Activity, description: "Two accounts request the same seat. Inspect the outcome and the persisted hold." },
  { id: "redis", label: "Redis lease", Icon: KeyRound, description: "Acquire a lease, check its TTL, and try to release it with a different token." },
  { id: "optimistic", label: "Optimistic locking", Icon: GitCompare, description: "Use a version check to decide which write can commit to a disposable PostgreSQL row." },
  { id: "pessimistic", label: "Pessimistic locking", Icon: LockKeyhole, description: "Watch a database transaction wait for another to release the row." },
  { id: "idempotency", label: "Idempotency", Icon: Layers, description: "Send a duplicate hold and check that both responses point to one reservation." },
] satisfies { id: LabScenario; label: string; Icon: typeof Activity; description: string }[];

function LeaseCountdown({ expiresAt }: { expiresAt: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));
  const done = remaining === 0;
  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setRemaining(Math.max(0, expiresAt - Date.now())), 100);
    return () => window.clearInterval(id);
  }, [done, expiresAt]);
  return <p className={styles.lease}><Clock3 size={17} aria-hidden="true" /> Separate Redis key expires in <strong>{(remaining / 1_000).toFixed(1)} s</strong></p>;
}

export function LabPanel({ instance }: { instance: string }) {
  const [scenario, setScenario] = useState<LabScenario>("race");
  const [result, setResult] = useState<(LabResult & { roundTripMs: number }) | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const selected = demos.find(({ id }) => id === scenario)!;

  async function run() {
    setRunning(true);
    setResult(null);
    setError("");
    const start = performance.now();
    try {
      const response = await fetch("/api/engineering-lab", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario }),
      });
      const outcome: { ok: true; data: LabResult } | { ok: false; error: { message: string } } = await response.json();
      if (!outcome.ok) {
        setError(outcome.error.message);
        return;
      }
      setResult({ ...outcome.data, roundTripMs: Math.round(performance.now() - start) });
    } catch {
      setError("The experiment could not finish. Check that the local database and Redis are running.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={styles.lab}>
      <header className={styles.hero}><h1>Engineering lab</h1><p>Run an experiment, then follow each request through SeatSync.</p><span>Instance {instance}</span></header>
      <section className={styles.controls} aria-label="Experiment controls">
        <fieldset disabled={running} className={styles.choices}>
          <legend>Choose an experiment</legend>
          <div>{demos.map(({ id, label, Icon }) => <label key={id} data-selected={id === scenario}>
            <input type="radio" name="scenario" value={id} checked={id === scenario} onChange={() => { setScenario(id); setResult(null); setError(""); }} />
            <Icon size={18} aria-hidden="true" /> {label}
          </label>)}</div>
        </fieldset>
        <div className={styles.run}><p>{selected.description}</p><Button disabled={running} onClick={run}>{running ? "Running…" : "Run experiment"} <ArrowUpRight size={16} aria-hidden="true" /></Button></div>
      </section>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {result && <section className={styles.result} aria-labelledby="timeline">
        <header><h2 id="timeline">Request timeline</h2><p role="status">{result.summary}</p></header>
        <dl className={styles.metrics}>
          <div><dt>Instance</dt><dd>{result.instance}</dd></div>
          <div><dt>Server elapsed</dt><dd>{result.elapsedMs} ms</dd></div>
          <div><dt>Round trip</dt><dd>{result.roundTripMs} ms</dd></div>
          <div><dt>Conflicts</dt><dd>{result.conflicts}</dd></div>
        </dl>
        {result.expiresAt !== undefined && <LeaseCountdown key={result.expiresAt} expiresAt={result.expiresAt} />}
        <ol className={styles.timeline}>
          {result.events.map(({ atMs, request, detail }, index) => <li key={index}>
            <span>+{atMs} ms</span><div><strong>{request}</strong><p>{detail}</p></div>
          </li>)}
        </ol>
      </section>}
    </div>
  );
}
