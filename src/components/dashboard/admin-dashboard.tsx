import { CalendarClock, LayoutGrid, ListChecks, Store } from "lucide-react";
import Link from "next/link";
import { updateInventory } from "@/app/admin/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { bookingDayLabel, seatPrice, slotLabel, workspaceDate } from "@/lib/booking-format";
import { readAdminInventory, readAdminMetrics } from "@/repositories/dashboard";
import styles from "./dashboard.module.css";

const panels = [
  { id: "workspace", label: "Workspace", Icon: Store },
  { id: "seat", label: "Seat layout", Icon: LayoutGrid },
  { id: "slot", label: "Time slots", Icon: CalendarClock },
  { id: "cancel", label: "Reservations", Icon: ListChecks },
] as const;
const states = { CONFIRMED: "Confirmed", HELD: "On hold", CANCELLED: "Cancelled", EXPIRED: "Expired" };

function ActiveField({ active }: { active: boolean }) {
  return <label className={styles.field}>Availability <select name="active" defaultValue={String(active)}><option value="true">Active</option><option value="false">Inactive</option></select></label>;
}

function FormFields({ kind, workspace, id, version, page }: { kind: string; workspace: string; id?: string; version?: number; page?: number }) {
  return <>
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="workspaceId" value={workspace} />
    {id && <input type="hidden" name="id" value={id} />}
    {page !== undefined && <input type="hidden" name="page" value={page} />}
    {version !== undefined && <input type="hidden" name="version" value={version} />}
  </>;
}

export async function AdminDashboard({ workspaceId, panel, saved, error, page }: {
  workspaceId?: string; panel?: string; saved: boolean; error?: string; page: number;
}) {
  const [metrics, inventory] = await Promise.all([readAdminMetrics(), readAdminInventory(workspaceId, page)]);
  const { workspaces, workspace, seats, slots, reservations } = inventory;
  const current = panels.some(({ id }) => id === panel) ? panel : panel === "add-slot" ? "slot" : "workspace";
  const canPage = current === "slot" || current === "cancel";
  const hasNext = current === "slot" ? inventory.moreSlots : inventory.moreReservations;
  const percent = metrics.offeredSlots ? Math.round(1000 * metrics.bookedSlots / metrics.offeredSlots) / 10 : 0;
  const stats = [
    ["Total reservations", metrics.total], ["Confirmed bookings", metrics.confirmed], ["Active holds", metrics.held],
    ["Cancelled", metrics.cancelled], ["Expired", metrics.expired], ["Recorded conflicts", metrics.conflicts],
    ["Captured sandbox payments", seatPrice(Number(metrics.capturedPaise))],
  ] as const;
  const timestamp = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

  return (
    <div className={styles.shell}>
      <header className={styles.banner}>
        <div><p className={styles.bannerLabel}>SeatSync operations</p><h1>Admin dashboard</h1><p>Monitor reservations and manage workspace inventory.</p></div>
        <Link className={buttonVariants({ variant: "outline" })} href="/account">My bookings</Link>
      </header>
      <section className={styles.panel} aria-labelledby="admin-overview">
        <div className={styles.sectionHead}><h2 id="admin-overview">Overview</h2><small>As of {timestamp.format(metrics.asOf)} IST</small></div>
        <dl className={styles.metrics}>{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className={styles.occupancy}>
          <div><h3>Seat occupancy</h3><p>Next seven days · {metrics.bookedSlots} of {metrics.offeredSlots} bookable seat-slots</p></div>
          <div className={styles.meter}><strong>{percent}%</strong><meter min={0} max={100} value={percent} aria-label="Seat occupancy" /></div>
        </div>
      </section>
      {workspace && <section className={styles.panel} aria-labelledby="admin-inventory">
        <div className={styles.sectionHead}><h2 id="admin-inventory">Inventory management</h2></div>
        <form className={styles.workspacePicker} action="/admin">
          <label className={styles.field}>Workspace<select name="workspace" defaultValue={workspace.id}>{workspaces.map((item) =>
            <option key={item.id} value={item.id}>{item.name} · {item.city}</option>)}</select></label>
          <input type="hidden" name="panel" value={current} />
          <Button type="submit" variant="outline">Open workspace</Button>
        </form>
        <nav className={styles.tabs} aria-label="Inventory sections">{panels.map(({ id, label, Icon }) =>
          <Link key={id} href={{ pathname: "/admin", query: { workspace: workspace.id, panel: id } }} aria-current={current === id ? "page" : undefined}>
            <Icon size={16} aria-hidden="true" />{label}
          </Link>)}</nav>
        {saved && <p className={styles.feedback} role="status">Changes saved.</p>}
        {error && <p className={styles.feedback} data-error role="alert">{error}</p>}
        <div key={`${workspace.id}-${current}-${page}`} className={styles.adminPanel}>
          {current === "workspace" && <form action={updateInventory} className={styles.editForm}>
            <FormFields kind="workspace" workspace={workspace.id} />
            <label className={styles.field}>Workspace name<input name="name" required maxLength={100} defaultValue={workspace.name} /></label>
            <label className={styles.field}>Visibility<select name="published" defaultValue={String(workspace.published)}><option value="true">Published</option><option value="false">Hidden</option></select></label>
            <Button type="submit">Save workspace</Button>
          </form>}
          {current === "seat" && <>
            <p className={styles.panelNote}>Choose a seat to edit its position or availability.</p>
            <div className={styles.editList}>{seats.map((seat) => <details key={`${seat.id}-${seat.version}`}>
              <summary><strong>{seat.code}</strong><span>{seat.category.name} · Row {seat.gridRow}, column {seat.gridColumn} · {seat.active ? "Active" : "Inactive"}</span></summary>
              <form action={updateInventory} className={styles.editForm}>
                <FormFields kind="seat" workspace={workspace.id} id={seat.id} version={seat.version} />
                <label className={styles.field}>Row<input name="row" type="number" min={1} max={100} required defaultValue={seat.gridRow} /></label>
                <label className={styles.field}>Column<input name="column" type="number" min={1} max={100} required defaultValue={seat.gridColumn} /></label>
                <ActiveField active={seat.active} /><Button type="submit">Save seat</Button>
              </form>
            </details>)}</div>
          </>}
          {current === "slot" && <>
            <form action={updateInventory} className={styles.editForm}>
              <FormFields kind="add-slot" workspace={workspace.id} />
              <label className={styles.field}>Add a slot (IST)<input name="start" type="datetime-local" step={1800} required /></label>
              <Button type="submit">Add 30-minute slot</Button>
            </form>
            <p className={styles.panelNote}>Upcoming slots</p>
            <div className={styles.editList}>{slots.map((slot) => <details key={`${slot.id}-${slot.version}`}>
              <summary><strong>{bookingDayLabel(workspaceDate(workspace.timezone, slot.startsAt))}</strong><span>{slotLabel({ id: slot.id, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() }, workspace.timezone)} · {slot.active ? "Active" : "Inactive"}</span></summary>
              <form action={updateInventory} className={styles.editForm}>
                <FormFields kind="slot" workspace={workspace.id} id={slot.id} version={slot.version} page={page} />
                <ActiveField active={slot.active} /><Button type="submit">Save slot</Button>
              </form>
            </details>)}</div>
          </>}
          {current === "cancel" && <>
            {reservations.length ? <div className={styles.editList}>{reservations.map((booking) => <details key={`${booking.id}-${booking.status}`}>
              <summary><strong>{booking.ownerName}</strong><span>{states[booking.status]} · {booking.items.map(({ seatCode }) => seatCode).join(", ")} · {seatPrice(booking.totalAmountPaise)}</span></summary>
              <div className={styles.recordDetails}>
                {booking.bookingReference && <p>Reference {booking.bookingReference}</p>}
                {booking.items[0] && <p>{timestamp.format(new Date(booking.items[0].slot.startsAt))} IST</p>}
                {(booking.status === "HELD" || booking.status === "CONFIRMED") && booking.items[0] &&
                  Date.parse(booking.items[0].slot.startsAt) > Date.parse(booking.checkedAt) && <form action={updateInventory} className={styles.editForm}>
                    <FormFields kind="cancel" workspace={workspace.id} id={booking.id} page={page} />
                    <Button type="submit" variant="outline">Cancel reservation</Button>
                  </form>}
              </div>
            </details>)}</div> : <p className={styles.panelNote}>There are no reservations for this workspace.</p>}
          </>}
        </div>
        {canPage && (page > 1 || hasNext) && <nav className={styles.pagination} aria-label="Inventory pages">
          {page > 1 && <Link href={{ pathname: "/admin", query: { workspace: workspace.id, panel: current, page: page - 1 } }}>Previous</Link>}
          <span>Page {page}</span>
          {hasNext && <Link href={{ pathname: "/admin", query: { workspace: workspace.id, panel: current, page: page + 1 } }}>Next</Link>}
        </nav>}
      </section>}
    </div>
  );
}
