import { randomUUID } from "node:crypto";

const instance = globalThis as typeof globalThis & { seatSyncInstanceId?: string };

export function appInstanceId() {
  const configured = process.env.APP_INSTANCE_ID?.trim();
  if (configured && /^[A-Za-z0-9._-]{1,64}$/.test(configured)) return configured;
  return instance.seatSyncInstanceId ??= `app-${randomUUID().slice(0, 12)}`;
}
