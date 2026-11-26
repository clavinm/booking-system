export const labScenarios = ["race", "redis", "optimistic", "pessimistic", "idempotency"] as const;
export type LabScenario = typeof labScenarios[number];

export type LabEvent = { atMs: number; request: string; detail: string };
export type LabResult = {
  instance: string;
  elapsedMs: number;
  events: LabEvent[];
  conflicts: number;
  ttlMs?: number;
  expiresAt?: number;
  summary: string;
};
