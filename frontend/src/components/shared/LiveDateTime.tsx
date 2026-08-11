import React, { useState, useEffect } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function LiveDateTime() {
  const { language } = useLocalization();
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!time) return null; // Avoid hydration mismatch

  const locale = language === "ar" ? "ar-SA-u-nu-latn" : "en-US";

  const formattedDate = time.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const formattedTime = time.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border bg-surface-subtle px-3 py-1.5 shadow-sm"
      data-testid="live-date-time"
    >
      <div className="flex items-center gap-1.5 border-e border-border pe-3">
        <CalendarDays className="size-4 text-brand" />
        <span className="text-xs font-semibold text-foreground-muted">{formattedDate}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Clock className="size-4 text-brand" />
        <span className="text-xs font-bold tracking-wide text-foreground" dir="ltr">{formattedTime}</span>
      </div>
    </div>
  );
}
