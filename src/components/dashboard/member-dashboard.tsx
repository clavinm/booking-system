import { ArrowUpRight, CalendarDays, CreditCard, MapPin, UserRound } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "@/components/account/account-forms";
import { buttonVariants } from "@/components/ui/button";
import { bookingDayLabel, seatPrice, slotLabel, workspaceDate } from "@/lib/booking-format";
import { bookingTabs, readUserBookings, type BookingTab } from "@/repositories/dashboard";
import type { ReservationView } from "@/types/booking";
import styles from "./dashboard.module.css";

const labels: Record<BookingTab, string> = {
  upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled", expired: "Expired",
};
const statusLabels = { HELD: "On hold", CONFIRMED: "Confirmed", CANCELLED: "Cancelled", EXPIRED: "Expired" } as const;
const paymentLabels = { PENDING: "Pending", SUCCESS: "Paid", FAILED: "Failed", REFUNDED: "Refunded" } as const;

type Member = { id: string; name: string; email: string; role: string };

function BookingsRow({ booking, completed }: { booking: ReservationView; completed: boolean }) {
  const slot = booking.items[0]?.slot;
  const timezone = booking.workspace.timezone;
  return (
    <li className={styles.bookingRow}>
      <span className={styles.dateTile} aria-hidden="true">
        {slot ? new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: timezone }).format(new Date(slot.startsAt)) : <CalendarDays size={21} />}
        {slot && <strong>{workspaceDate(timezone, new Date(slot.startsAt)).slice(-2)}</strong>}
      </span>
      <div className={styles.bookingInfo}>
        <h3>{booking.workspace.name}</h3>
        <p><MapPin size={14} aria-hidden="true" /> {booking.workspace.neighborhood}, {booking.workspace.city}</p>
        {slot && <p>{bookingDayLabel(workspaceDate(timezone, new Date(slot.startsAt)))} · {slotLabel(slot, timezone)}</p>}
        <p>{booking.items.map(({ seatCode }) => seatCode).join(", ")}</p>
      </div>
      <div className={styles.bookingMeta}>
        <span className={styles.status} data-state={booking.status}>{completed ? "Completed" : statusLabels[booking.status]}</span>
        <strong>{seatPrice(booking.totalAmountPaise)}</strong>
      </div>
      <Link className={styles.rowLink} href={`/reservations/${booking.id}`}>View details <ArrowUpRight size={16} aria-hidden="true" /></Link>
    </li>
  );
}

export async function MemberDashboard({ user, tab, page }: { user: Member; tab: BookingTab; page: number }) {
  const data = await readUserBookings(user.id, tab, page);
  const firstName = user.name.trim().split(/\s+/)[0];
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

  return (
    <div className={styles.shell}>
      <header className={styles.banner}>
        <div>
          <p className={styles.bannerLabel}>My bookings</p>
          <h1>Welcome, {firstName}.</h1>
          <p>See your reservations and pick up where you left off.</p>
        </div>
        <Link className={buttonVariants()} href="/workspaces">Find a workspace <ArrowUpRight size={18} aria-hidden="true" /></Link>
      </header>
      <div className={styles.memberGrid}>
        <section className={styles.panel} aria-labelledby="bookings-heading">
          <div className={styles.sectionHead}><h2 id="bookings-heading">Reservations</h2></div>
          <nav className={styles.tabs} aria-label="Reservation status">
            {bookingTabs.map((item) => (
              <Link key={item} href={{ pathname: "/account", query: { view: item } }} aria-current={item === tab ? "page" : undefined}>{labels[item]}</Link>
            ))}
          </nav>
          <div key={`${tab}-${page}`} className={styles.listContent}>
            {data.bookings.length ? (
              <ul className={styles.bookingList}>
                {data.bookings.map((booking) => <BookingsRow key={booking.id} booking={booking} completed={tab === "completed"} />)}
              </ul>
            ) : (
              <div className={styles.empty}>
                <CalendarDays size={26} aria-hidden="true" />
                <h3>No {labels[tab].toLowerCase()} reservations</h3>
                {tab === "upcoming" && page === 1 && <Link href="/workspaces">Explore workspaces <ArrowUpRight size={15} aria-hidden="true" /></Link>}
              </div>
            )}
          </div>
          {(page > 1 || data.hasNext) && <nav className={styles.pagination} aria-label="Reservation pages">
            {page > 1 && <Link href={{ pathname: "/account", query: { view: tab, page: page - 1 } }}>Previous</Link>}
            <span>Page {page}</span>
            {data.hasNext && <Link href={{ pathname: "/account", query: { view: tab, page: page + 1 } }}>Next</Link>}
          </nav>}
        </section>
        <aside className={styles.side}>
          <section className={styles.panel} aria-labelledby="profile-heading">
            <div className={styles.sectionHead}><UserRound size={19} aria-hidden="true" /><h2 id="profile-heading">Profile</h2></div>
            <dl className={styles.profile}><div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div></dl>
            <div className={styles.profileActions}>
              {user.role === "ADMIN" && <Link className={buttonVariants({ size: "small", variant: "outline" })} href="/admin">Admin dashboard</Link>}
              <SignOutButton />
            </div>
          </section>
          <section className={styles.panel} aria-labelledby="payment-history">
            <div className={styles.sectionHead}><CreditCard size={19} aria-hidden="true" /><h2 id="payment-history">Recent payments</h2></div>
            {data.payments.length ? <ul className={styles.payments}>
              {data.payments.map((payment) => <li key={payment.id}>
                <div><Link href={`/reservations/${payment.reservationId}`}>{payment.reservation.workspace.name}</Link><small>{date.format(payment.createdAt)}</small></div>
                <div><strong>{seatPrice(payment.amountPaise)}</strong><small>{paymentLabels[payment.status]}</small></div>
              </li>)}
            </ul> : <p className={styles.panelNote}>Your payments will appear here.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
