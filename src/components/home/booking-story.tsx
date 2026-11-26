import { Armchair, CalendarDays, CircleCheck, MapPin, Search, TicketCheck } from "lucide-react";
import styles from "@/components/home/home.module.css";

const steps = [
  { icon: Search, title: "Discover", description: "Compare spaces by city, opening hours, and what you need to work.", preview: <><MapPin size={17} /> City or neighbourhood</> },
  { icon: Armchair, title: "Select", description: "Choose a date and time, then pick a seat from the live map.", preview: <><CalendarDays size={17} /> Date, time, and seat</> },
  { icon: TicketCheck, title: "Reserve", description: "Review your selection. SeatSync holds it while you complete payment.", preview: <><Armchair size={17} /> Seat held at checkout</> },
  { icon: CircleCheck, title: "Confirm", description: "Find your booking reference and reservation details in My bookings.", preview: <><CircleCheck size={17} /> Booking confirmed</> },
] as const;

export function BookingStory() {
  return (
    <section className={styles.storySection} id="how-it-works" aria-labelledby="steps-title">
      <div className="container-wide">
        <div className={styles.sectionHeading}>
          <h2 id="steps-title" data-reveal-title>How SeatSync works</h2>
          <p>From finding a space to getting your booking reference.</p>
        </div>
        <ol className={styles.story} data-story data-reveal-group>
          {steps.map(({ icon: Icon, title, description, preview }, index) => (
            <li className={styles.storyStep} key={title} data-story-step data-reveal-item>
              <span className={styles.stepMarker} aria-hidden="true">{index + 1}</span>
              <div className={styles.stepBody}>
                <Icon size={25} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{description}</p>
                <div className={styles.stepPreview} aria-hidden="true">{preview}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
