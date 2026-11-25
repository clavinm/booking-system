import type { BookingSlot } from "@/types/booking";

export function workspaceDate(timezone: string, instant = new Date()) {
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, calendar: "iso8601", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) => fields.find((field) => field.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function slotLabel(slot: BookingSlot, timezone: string) {
  const clock = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23", numberingSystem: "latn",
  });

  // Node and browsers can ship different ICU data for punctuation and day periods.
  const localTime = (instant: string) => {
    const fields = clock.formatToParts(new Date(instant));
    const hour = Number(fields.find(({ type }) => type === "hour")?.value);
    const minute = fields.find(({ type }) => type === "minute")?.value;
    return { time: `${hour % 12 || 12}:${minute}`, period: hour < 12 ? "AM" : "PM" };
  };

  const start = localTime(slot.startsAt);
  const end = localTime(slot.endsAt);
  const startPeriod = start.period === end.period ? "" : ` ${start.period}`;
  return `${start.time}${startPeriod} – ${end.time} ${end.period}`;
}

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const months = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function bookingDayLabel(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  return `${days[day.getUTCDay()]}, ${day.getUTCDate()} ${months[day.getUTCMonth()]}`;
}

const rupees = new Intl.NumberFormat("en-IN", {
  numberingSystem: "latn", minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export function seatPrice(paise: number) {
  const sign = paise < 0 ? "-" : "";
  return `${sign}₹${rupees.format(Math.abs(paise) / 100)}`;
}
