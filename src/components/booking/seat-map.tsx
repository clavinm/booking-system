import { Armchair, Check, Clock3, LockKeyhole, Minus, Plus, X } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { seatPrice } from "@/lib/booking-format";
import type { SeatSection, SeatState } from "@/types/booking";
import styles from "./booking.module.css";

const labels = {
  AVAILABLE: "Available",
  SELECTED: "Selected",
  HELD: "Temporarily held",
  BOOKED: "Booked",
  UNAVAILABLE: "Unavailable",
} as const;

const stateIcons = { AVAILABLE: Armchair, SELECTED: Check, HELD: Clock3, BOOKED: LockKeyhole, UNAVAILABLE: X };

const zoomLevels = [
  { label: "75%", size: 38 },
  { label: "100%", size: 46 },
  { label: "125%", size: 56 },
  { label: "150%", size: 68 },
];

export function SeatMap({
  sections, states, selected, canSelect, toggle,
}: {
  sections: SeatSection[];
  states: Map<string, SeatState>;
  selected: ReadonlySet<string>;
  canSelect: boolean;
  toggle: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);

  return (
    <section className={styles.map} aria-labelledby="seat-map-title">
      <div className={styles.mapHeading}>
        <div>
          <h2 id="seat-map-title">Seat map</h2>
          <p>Prices are per seat for 30 minutes.</p>
        </div>
        <div className={styles.zoom} role="group" aria-label="Seat map zoom">
          <Button variant="outline" size="small" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>
            <Minus size={16} aria-hidden="true" />
          </Button>
          <output aria-label="Zoom level">{zoomLevels[zoom].label}</output>
          <Button variant="outline" size="small" aria-label="Zoom in" disabled={zoom === zoomLevels.length - 1} onClick={() => setZoom(zoom + 1)}>
            <Plus size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <ul className={styles.legend} aria-label="Seat availability legend">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((state) => {
          const Icon = stateIcons[state];
          return <li key={state}><span className={styles.legendMark} data-state={state}><Icon size={11} aria-hidden="true" /></span>{labels[state]}</li>;
        })}
      </ul>

      <div className={styles.sections} style={{ "--seat-size": `${zoomLevels[zoom].size}px` } as CSSProperties}>
        {sections.filter((section) => section.seats.length > 0).map((section) => {
          const columns = Math.max(...section.seats.map((seat) => seat.gridColumn));
          return (
            <section className={styles.section} key={section.id} aria-label={section.name}>
              <div className={styles.sectionHeader}>
                <h3>{section.name}</h3>
                <span>{seatPrice(section.slotPricePaise)}</span>
              </div>
              <div className={styles.seatOverflow}>
                <div className={styles.seatGrid} style={{ gridTemplateColumns: `repeat(${columns}, var(--seat-size))` }}>
                  {section.seats.map((seat) => {
                    const state = states.get(seat.id) ?? "UNAVAILABLE";
                    const pressed = selected.has(seat.id);
                    const display = pressed ? "SELECTED" : state;
                    const Icon = stateIcons[display];

                    return (
                      <button
                        key={seat.id}
                        type="button"
                        className={styles.seat}
                        data-state={display}
                        style={{ gridRow: seat.gridRow, gridColumn: seat.gridColumn }}
                        aria-label={`${seat.code}, ${labels[display]}`}
                        aria-pressed={pressed}
                        disabled={!canSelect || state !== "AVAILABLE"}
                        onClick={() => toggle(seat.id)}
                      >
                        <Icon size={17} aria-hidden="true" />
                        {seat.code}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
