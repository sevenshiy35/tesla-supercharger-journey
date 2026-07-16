import { formatCheckInDisplayDate } from "@/lib/journey/calculations";
import type { VisitTimePrecision } from "@/types/admin";

interface VisitTimeProps {
  checkedInAt: string;
  timezone: string;
  precision: VisitTimePrecision;
  className?: string;
}

export function VisitTime({ checkedInAt, timezone, precision, className }: VisitTimeProps) {
  return (
    <time dateTime={checkedInAt} className={`font-data ${className ?? ""}`}>
      {formatCheckInDisplayDate(checkedInAt, "en", precision, timezone)}
    </time>
  );
}
