# Phase 7 dashboards and transitions

## User dashboard

Sign in and open **My bookings**. Upcoming includes active holds and confirmed bookings whose slots have yet to end. Booking details have cancellation and, for confirmed bookings, a printable receipt. The dashboard also shows completed, cancelled, and expired reservations, recent payments, and your profile.

1. The [account page](../src/app/account/page.tsx) reads the authenticated user on the server. Next.js streams the signed-in view behind a Suspense boundary.
2. [Dashboard queries](../src/repositories/dashboard.ts) use the authenticated account ID to scope both reservation and payment queries. The tabs and page number only control the filters. PostgreSQL supplies the time used to classify bookings and holds.
3. The [reservation service](../src/services/reservations.ts) verifies the owner again when cancelling. It releases the inventory in the same transaction as the status change. The printable receipt uses a print stylesheet and the booking reference from the saved reservation.

## Admin dashboard

Open **Admin dashboard** from the profile of an administrator. For a local SeatSync account you intend to make an admin, use `npm run db:grant-admin -- you@example.com`.

- [The metrics API](../src/app/api/admin/metrics/route.ts) checks the role on the server. Counts come from PostgreSQL. Seat occupancy divides booked by available-to-book seat/time-slot pairs for the next seven days, across published workspaces. Captured sandbox payments count recorded successful provider captures, including payments that arrived after a hold expired. Recorded conflicts count rejected hold requests from the start of Phase 7 logging.
- [Admin forms](../src/components/dashboard/admin-dashboard.tsx) let administrators rename or publish a workspace, reposition or deactivate seats, create or toggle time slots, and review or cancel reservations. Only seated inventory and time slots within the existing catalog are edited here.
- [The server action](../src/app/admin/actions.ts) checks the role again and validates each input. [Inventory changes](../src/services/admin.ts) lock the workspace while checking for active holds or bookings, so availability cannot change halfway through a write. Version checks reject edits from a stale seat or slot form. A new slot and its seat inventory commit together. Cancellation reuses the existing booking engine and writes an audit entry.

## Motion

The [root layout](../src/app/layout.tsx) uses React’s View Transition to let supporting browsers animate the old and new page content during client navigation. The [global stylesheet](../src/app/globals.css) keeps the header steady and sets the timing, easing, and reduced-motion rules. The home hero uses a staged entrance with a short offset between the photo and copy. Cards and buttons respond to hover and press. Dashboard tab changes move only the relevant content.

The design uses SeatSync’s navy and rose palette, original workspace photos, and a subtle floor-plan grid in the dashboard banner. The transition reference informed the pacing. [Piven Ilya’s contacts page](https://pivenilya.com/contacts)
