"use client";

import { Armchair, CalendarDays, Clock3 } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { SeatMap } from "@/components/booking/seat-map";
import { Button } from "@/components/ui/button";
import { useSeatAvailability } from "@/hooks/use-seat-availability";
import { bookingDayLabel, seatPrice, slotLabel } from "@/lib/booking-format";
import type { BookingSlot, SeatAvailability, SeatLayout } from "@/types/booking";
import { maximumSeatsPerHold } from "@/validations/reservation";
import styles from "./booking.module.css";

export function SeatPicker({
  layout, date, slots, initialSlot, initialAvailability,
}: {
  layout: SeatLayout;
  date: string;
  slots: BookingSlot[];
  initialSlot: BookingSlot;
  initialAvailability: SeatAvailability | null;
}) {
  const [slot, setSlot] = useState(initialSlot);
  const [holding, setHolding] = useState(false);
  const { timezone } = layout.workspace;

  return (
    <>
      <div className={styles.slotField}>
        <label className="field-label">Time slot
          <select value={slot.id} disabled={holding} onChange={(event) => {
            const next = slots.find(({ id }) => id === event.target.value);
            if (next) setSlot(next);
          }}>
            {slots.map((option) => <option key={option.id} value={option.id}>{slotLabel(option, timezone)}</option>)}
          </select>
        </label>
      </div>
      <SeatSelection
        key={slot.id}
        layout={layout}
        date={date}
        slot={slot}
        initialAvailability={slot.id === initialSlot.id ? initialAvailability : null}
        holding={holding}
        setHolding={setHolding}
      />
    </>
  );
}

function SeatSelection({
  layout, date, slot, initialAvailability, holding, setHolding,
}: {
  layout: SeatLayout;
  date: string;
  slot: BookingSlot;
  initialAvailability: SeatAvailability | null;
  holding: boolean;
  setHolding: (value: boolean) => void;
}) {
  const [selection, setSelection] = useState<{ ids: string[]; removed: number }>({ ids: [], removed: 0 });
  const [holdError, setHoldError] = useState<{ message: string; login?: boolean; retry?: boolean }>();
  const holdRequest = useRef<{ key: string; seatIds: string[] } | null>(null);
  const { id, timezone } = layout.workspace;
  const reconcile = useCallback((availability: SeatAvailability) => {
    // This checkout may already own the seats that are now shown as held.
    if (holdRequest.current) return;
    const available = new Set(availability.seats.filter((seat) => seat.state === "AVAILABLE").map((seat) => seat.seatId));
    setSelection((previous) => {
      const ids = previous.ids.filter((seatId) => available.has(seatId));
      return ids.length === previous.ids.length ? previous : { ids, removed: previous.ids.length - ids.length };
    });
  }, []);
  const { snapshot, error, refreshAvailability } = useSeatAvailability(id, slot.id, initialAvailability, reconcile);
  const states = new Map(snapshot?.seats.map((seat) => [seat.seatId, seat.state]));
  const selected = new Set(selection.ids);
  const items = layout.sections.flatMap((section) => section.seats
    .filter((seat) => selected.has(seat.id))
    .map((seat) => ({ ...seat, price: section.slotPricePaise })));
  const total = items.reduce((sum, seat) => sum + seat.price, 0);
  const seatCount = `${items.length} ${items.length === 1 ? "seat" : "seats"}`;

  function toggle(seatId: string) {
    if (holding || error || states.get(seatId) !== "AVAILABLE") return;
    if (!selected.has(seatId) && selected.size >= maximumSeatsPerHold) {
      setHoldError({ message: `Choose up to ${maximumSeatsPerHold} seats per hold.` });
      return;
    }
    holdRequest.current = null;
    setHoldError(undefined);
    setSelection((previous) => ({
      ids: previous.ids.includes(seatId) ? previous.ids.filter((id) => id !== seatId) : [...previous.ids, seatId],
      removed: 0,
    }));
  }

  async function payForSeats() {
    if (holding || (!holdRequest.current && (error || !selection.ids.length))) return;
    holdRequest.current ??= { key: crypto.randomUUID(), seatIds: selection.ids };
    const { key, seatIds } = holdRequest.current;
    setHolding(true);
    setHoldError(undefined);

    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ workspaceId: id, slotId: slot.id, seatIds }),
      });
      const result: { ok: true; data: { checkoutUrl: string } } |
        { ok: false; error: { message: string; unavailableSeatIds?: string[] } } = await response.json();
      if (result.ok) {
        window.location.assign(result.data.checkoutUrl);
        return;
      }

      if (response.status < 500 && response.status !== 429) holdRequest.current = null;
      const conflicts = new Set(result.error.unavailableSeatIds);
      const codes = items.filter((item) => conflicts.has(item.id)).map((item) => item.code);
      setHoldError({
        message: codes.length ? `Unavailable seats: ${codes.join(", ")}. Choose other seats and try again.` : result.error.message,
        login: response.status === 401,
        retry: Boolean(holdRequest.current),
      });
      if (response.status === 409 || response.status === 410) refreshAvailability();
    } catch {
      setHoldError({ message: "Couldn’t open checkout. Retry to continue with these seats.", retry: true });
      refreshAvailability();
    } finally {
      setHolding(false);
    }
  }

  const holdMessage = holdError && (
    <p role="alert" className={styles.reservationError}>
      {holdError.message}{holdError.login && <> <Link href="/account">Log in</Link></>}
      {holdError.retry && <> <Button variant="outline" size="small" disabled={holding} onClick={payForSeats}>Retry checkout</Button></>}
    </p>
  );

  return (
    <>
      <div className={styles.live} role="status" data-error={error}>
        {error ? "Couldn’t refresh availability. Retrying automatically."
          : !snapshot ? "Checking availability…"
          : selection.removed > 0
            ? `${selection.removed === 1 ? "One selected seat is" : `${selection.removed} selected seats are`} no longer available. Choose another seat.`
            : `${snapshot.seats.filter((seat) => seat.state === "AVAILABLE").length} seats available`}
      </div>
      <div className={styles.pickerLayout}>
        <SeatMap sections={layout.sections} states={states} selected={selected} canSelect={Boolean(snapshot) && !error && !holding} toggle={toggle} />
        <aside className={styles.summary} id="selection-summary" aria-labelledby="selection-title">
          <h2 id="selection-title">Your selection</h2>
          <div className={styles.summaryMeta}>
            <p><CalendarDays size={17} aria-hidden="true" /> {bookingDayLabel(date)}</p>
            <p><Clock3 size={17} aria-hidden="true" /> {slotLabel(slot, timezone)} · 30 minutes</p>
          </div>
          {items.length > 0 ? (
            <ul className={styles.selectionItems} aria-label="Selected seats and prices">
              {items.map((item) => <li key={item.id}><span>{item.code}</span><span>{seatPrice(item.price)}</span></li>)}
            </ul>
          ) : (
            <p className={styles.emptySelection}><Armchair size={19} aria-hidden="true" /> Select seats on the map to see their prices.</p>
          )}
          <div className={styles.summaryTotal} aria-live="polite">
            <span>{seatCount} selected</span><strong>{seatPrice(total)}</strong>
          </div>
          {holdMessage && <div className={styles.desktopHoldError}>{holdMessage}</div>}
          <Button disabled={!items.length || holding || error} onClick={payForSeats}>
            {holding ? "Opening checkout…" : items.length ? `Pay ${seatPrice(total)}` : "Select seats to pay"}
          </Button>
          <p className={styles.selectionNote}>Your seats are held for up to five minutes during checkout.</p>
        </aside>
      </div>
      {(items.length > 0 || holdError) && (
        <div className={styles.mobileSummary}>
          {holdMessage}
          {items.length > 0 && (
            <div className={styles.mobileSummaryActions}>
              <div><strong>{seatPrice(total)}</strong><span> · {seatCount}</span></div>
              <Button size="small" disabled={holding || error} onClick={payForSeats}>
                {holding ? "Opening checkout…" : `Pay ${seatPrice(total)}`}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
