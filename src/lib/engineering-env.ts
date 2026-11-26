const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLabDatabase(value: string | undefined, allowCompose = true) {
  try {
    const url = new URL(value ?? "");
    return ["postgres:", "postgresql:"].includes(url.protocol) && url.pathname === "/seatsync_lab" &&
      (localHosts.has(url.hostname) || (allowCompose && url.hostname === "lab-db"));
  } catch {
    return false;
  }
}

export function isLabOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && localHosts.has(url.hostname) && url.origin === value;
  } catch {
    return false;
  }
}

export function engineeringLabEnabled() {
  return process.env.SEATSYNC_LAB === "1" && isLabDatabase(process.env.DATABASE_URL) &&
    isLabOrigin(process.env.AUTH_URL ?? "") && [process.env.REDIS_URL, process.env.REDIS_CACHE_URL].every((value) => {
      if (!value?.trim()) return true;
      try {
        const url = new URL(value);
        return ["redis:", "rediss:"].includes(url.protocol) &&
          (localHosts.has(url.hostname) || url.hostname === "lab-redis");
      } catch {
        return false;
      }
    });
}
