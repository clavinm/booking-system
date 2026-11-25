"use client";

import { CalendarDays, Clock3, MapPin, Printer } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { bookingDayLabel, seatPrice, slotLabel, workspaceDate } from "@/lib/booking-format";
import type { ReservationView } from "@/types/booking";
import styles from "./booking.module.css";

const headings = {
  HELD: "Your seats are on hold",
  CONFIRMED: "Reservation confirmed",
  CANCELLED: "Reservation cancelled",
  EXPIRED: "Your hold has expired",
};

function secondsLeft(reservation: ReservationView) {
  return Math.max(0, Math.ceil((Date.parse(reservation.expiresAt) - Date.parse(reservation.checkedAt)) / 1_000));
}

type PaymentState = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | null;
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export function ReservationDetails({ initial, initialPayment }: { initial: ReservationView; initialPayment: PaymentState }) {
  const [reservation, setReservation] = useState(initial);
  const [countdown, setCountdown] = useState(() => secondsLeft(initial));
  const [pending, setPending] = useState<"checkout" | "check" | "cancel" | null>(null);
  const [payment, setPayment] = useState(initialPayment);
  const confirmKey = useRef<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (reservation.status !== "HELD") return;
    const expiresIn = Date.parse(reservation.expiresAt) - Date.parse(reservation.checkedAt);
    const start = performance.now();
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((expiresIn - (performance.now() - start)) / 1_000));
      setCountdown(remaining);
      if (remaining === 0) window.clearInterval(interval);
    }, 250);
    return () => window.clearInterval(interval);
  }, [reservation]);

  const status = reservation.status === "HELD" && countdown === 0 ? "EXPIRED" : reservation.status;
  const { workspace, items } = reservation;
  const slot = items[0]?.slot;
  const date = slot ? workspaceDate(workspace.timezone, new Date(slot.startsAt)) : undefined;
  const choiceHref = { pathname: `/workspaces/${workspace.id}/seats`, query: { date } };
  const time = `${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")}`;
  const canCancel = status === "HELD" || (status === "CONFIRMED" && slot && Date.parse(slot.startsAt) > Date.parse(reservation.checkedAt));

  async function checkout() {
    setPending("checkout");
    setError("");
    try {
      const response = await fetch("/api/payments/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: reservation.id }),
      });
      const result: Result<{ checkoutUrl: string }> = await response.json();
      if (!result.ok) {
        if (response.status === 410) setCountdown(0);
        setError(result.error.message);
        setPending(null);
        return;
      }
      setPayment("PENDING");
      window.location.assign(result.data.checkoutUrl);
      setPending(null);
    } catch {
      setError("Couldn’t open checkout. Try again.");
      setPending(null);
    }
  }

  async function checkPayment() {
    setPending("check");
    setError("");
    try {
      confirmKey.current ??= crypto.randomUUID();
      const response = await fetch(`/api/reservations/${encodeURIComponent(reservation.id)}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": confirmKey.current }, body: "{}",
      });
      const result: Result<ReservationView> = await response.json();
      if (result.ok) {
        setReservation(result.data);
        setPayment("SUCCESS");
      } else {
        if (response.status === 410) {
          setCountdown(0);
          window.location.reload();
        }
        if (result.error.code === "PAYMENT_DECLINED") setPayment("FAILED");
        setError(result.error.message);
      }
    } catch {
      setError("Couldn’t check the payment. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function cancel() {
    setPending("cancel");
    setError("");
    try {
      const response = await fetch(`/api/reservations/${encodeURIComponent(reservation.id)}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const result: { ok: true; data: ReservationView } | { ok: false; error: { message: string } } = await response.json();
      if (result.ok) setReservation(result.data);
      else if (response.status === 410) setCountdown(0);
      else setError(result.error.message);
    } catch {
      setError("Couldn’t cancel the reservation. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className={styles.reservation} aria-labelledby="reservation-title">
      <div className={styles.reservationHeading}>
        <h1 id="reservation-title" aria-live="polite">{headings[status]}</h1>
        {status === "HELD" && (
          <p className={styles.timer}>
            <Clock3 size={20} aria-hidden="true" /> <span role="timer" aria-label="Time remaining">{time}</span>
          </p>
        )}
      </div>
      <div className={styles.summaryMeta}>
        <p><MapPin size={17} aria-hidden="true" /> {workspace.name} · {workspace.neighborhood}, {workspace.city}</p>
        {date && slot && (
          <p><CalendarDays size={17} aria-hidden="true" /> {bookingDayLabel(date)} · {slotLabel(slot, workspace.timezone)}</p>
        )}
      </div>
      {reservation.bookingReference && <p>Booking reference <strong>{reservation.bookingReference}</strong></p>}
      <ul className={styles.selectionItems} aria-label="Seats and prices">
        {items.map((item) => (
          <li key={`${item.slot.id}:${item.seatCode}`}><span>{item.seatCode}</span><span>{seatPrice(item.unitPricePaise)}</span></li>
        ))}
      </ul>
      <div className={styles.summaryTotal}><span>Total</span><strong>{seatPrice(reservation.totalAmountPaise)}</strong></div>
      {payment === "PENDING" && <p role="status">Payment is awaiting verification.</p>}
      {payment === "FAILED" && <p role="status">Payment did not complete.</p>}
      {payment === "SUCCESS" && status !== "CONFIRMED" && (
        <p role="status" className={styles.selectionNote}>Payment was received. The reservation is {status.toLowerCase()}.</p>
      )}
      {error && <p role="alert" className={styles.reservationError}>{error}</p>}
      <div className={styles.reservationActions}>
        {status === "HELD" && payment !== "SUCCESS" && (
          <Button disabled={pending !== null} onClick={checkout}>{pending === "checkout" ? "Opening checkout…" : payment === "PENDING" ? "Continue checkout" : `Pay ${seatPrice(reservation.totalAmountPaise)}`}</Button>
        )}
        {payment === "PENDING" && (
          <Button variant="outline" disabled={pending !== null} onClick={checkPayment}>{pending === "check" ? "Checking…" : "Check payment status"}</Button>
        )}
        {canCancel && <Button variant="outline" disabled={pending !== null} onClick={cancel}>{pending === "cancel" ? "Cancelling…" : "Cancel reservation"}</Button>}
        {status === "CONFIRMED" && <Button variant="outline" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Print receipt</Button>}
        <Link href="/account" className={buttonVariants({ variant: "ghost" })}>My bookings</Link>
        <Link href={choiceHref} className={buttonVariants({ variant: canCancel || payment === "PENDING" ? "ghost" : "primary" })}>Back to seats</Link>
      </div>
    </section>
  );
}
