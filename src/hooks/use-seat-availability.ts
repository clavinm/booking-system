import { useCallback, useEffect, useRef, useState } from "react";
import type { SeatAvailability } from "@/types/booking";

const intervalMs = 12_000;

export function useSeatAvailability(
  workspaceId: string,
  slotId: string,
  initialAvailability: SeatAvailability | null,
  onAvailability: (snapshot: SeatAvailability) => void,
) {
  const [snapshot, setSnapshot] = useState(initialAvailability);
  const [error, setError] = useState(false);
  const refreshNow = useRef<() => void>(undefined);
  const refreshAvailability = useCallback(() => refreshNow.current?.(), []);

  useEffect(() => {
    const query = new URLSearchParams({ workspaceId, slotId });
    let timer: number | undefined;
    let request: AbortController | undefined;

    async function refresh() {
      if (document.hidden || request) return;

      const current = new AbortController();
      request = current;
      try {
        const response = await fetch(`/api/seats/availability?${query}`, {
          cache: "no-store", signal: current.signal,
        });
        if (!response.ok) throw new Error("Availability request failed.");

        const { data }: { data: SeatAvailability } = await response.json();
        if (request !== current) return;
        onAvailability(data);
        setSnapshot(data);
        setError(false);
      } catch {
        if (request === current) setError(true);
      } finally {
        if (request === current) {
          request = undefined;
          if (!document.hidden) timer = window.setTimeout(refresh, intervalMs);
        }
      }
    }

    function stop() {
      window.clearTimeout(timer);
      request?.abort();
      request = undefined;
    }

    function handleVisibility() {
      if (document.hidden) stop();
      else void refresh();
    }

    refreshNow.current = () => {
      stop();
      void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    void refresh();
    return () => {
      refreshNow.current = undefined;
      document.removeEventListener("visibilitychange", handleVisibility);
      stop();
    };
  }, [workspaceId, slotId, onAvailability]);

  return { snapshot, error, refreshAvailability };
}
