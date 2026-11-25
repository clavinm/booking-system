import type { City } from "@/types/workspace";

export type SeatState = "AVAILABLE" | "HELD" | "BOOKED" | "UNAVAILABLE";

export type SeatSection = {
  id: string;
  name: string;
  slotPricePaise: number;
  seats: { id: string; code: string; gridRow: number; gridColumn: number }[];
};

export type SeatLayout = {
  workspace: { id: string; name: string; city: City; neighborhood: string; timezone: string };
  sections: SeatSection[];
};

export type BookingSlot = { id: string; startsAt: string; endsAt: string };

export type SeatAvailability = {
  slotId: string;
  checkedAt: string;
  seats: { seatId: string; state: SeatState }[];
};

export type ReservationView = {
  id: string;
  status: "HELD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  expiresAt: string;
  checkedAt: string;
  totalAmountPaise: number;
  bookingReference: string | null;
  workspace: SeatLayout["workspace"];
  items: { seatCode: string; unitPricePaise: number; slot: BookingSlot }[];
};
