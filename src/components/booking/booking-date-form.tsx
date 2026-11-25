import Form from "next/form";
import styles from "./booking.module.css";
import { Button } from "@/components/ui/button";

export function BookingDateForm({
  workspaceId, date, earliestDate, actionLabel, compact = false,
}: {
  workspaceId: string;
  date: string;
  earliestDate: string;
  actionLabel: string;
  compact?: boolean;
}) {
  return (
    <Form action={`/workspaces/${workspaceId}/seats`} className={compact ? `${styles.dateForm} ${styles.compactDate}` : styles.dateForm}>
      <label className="field-label">Date
        <input type="date" name="date" defaultValue={date} min={earliestDate} required />
      </label>
      <Button type="submit" variant={compact ? "outline" : "primary"}>{actionLabel}</Button>
    </Form>
  );
}
