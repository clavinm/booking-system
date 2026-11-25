const errors = {
  RESERVATION_NOT_FOUND: { status: 404, message: "The reservation could not be found." },
  SLOT_NOT_FOUND: { status: 404, message: "That time slot could not be found." },
  SLOT_UNAVAILABLE: { status: 409, message: "That time slot is no longer available." },
  SEAT_CONFLICT: { status: 409, message: "Some seats are no longer available. Check the seat map and try again." },
  SEAT_COORDINATION_BUSY: { status: 409, message: "Another request is updating one of these seats. Try again in a moment." },
  RESERVATION_CLOSED: { status: 409, message: "This reservation can no longer be changed." },
  INVALID_CONFIRMATION: { status: 400, message: "Send an empty JSON object to check and confirm payment." },
  INVALID_IDEMPOTENCY_KEY: { status: 400, message: "Use a visible ASCII idempotency key with up to 128 characters." },
  IDEMPOTENCY_KEY_REUSED: { status: 409, message: "This idempotency key already belongs to a different request." },
  INVALID_PAYMENT_NOTIFICATION: { status: 400, message: "Invalid payment notification." },
  PAYMENT_MISMATCH: { status: 409, message: "The payment does not match this reservation." },
  PAYMENT_ALREADY_CAPTURED: { status: 409, message: "This payment has already been captured. Check its status." },
  PAYMENT_DECLINED: { status: 409, message: "The payment did not complete. You can try checkout again." },
  PAYMENT_UNAVAILABLE: { status: 503, message: "Payments are temporarily unavailable. Try again in a moment." },
  CHECKOUT_BUSY: { status: 503, message: "Checkout is opening. Try again in a moment." },
  PAYMENT_REQUIRED: { status: 409, message: "A successful payment is required to confirm this reservation." },
  RESERVATION_EXPIRED: { status: 410, message: "This reservation has expired. Choose seats again." },
  RESERVATION_BUSY: { status: 503, message: "Reservation updates are busy. Try again in a moment." },
} as const;

type ErrorCode = keyof typeof errors;

export class ReservationError extends Error {
  readonly status: number;

  constructor(readonly code: ErrorCode, readonly unavailableSeatIds?: string[]) {
    super(errors[code].message);
    this.status = errors[code].status;
  }
}
