import React, { useState, useEffect } from "react";
import { CalendarDays, Clock } from "lucide-react";

export default function LiveDateTime() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
     
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!time) return null; // Avoid hydration mismatch

  const formattedDate = time.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const formattedTime = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg shadow-sm">
      <div className="flex items-center gap-1.5 border-e border-slate-200 pe-3">
        <CalendarDays className="w-4 h-4 text-brand" />
        <span className="text-xs font-semibold text-slate-700">{formattedDate}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Clock className="w-4 h-4 text-brand" />
        <span className="text-xs font-bold text-slate-800 tracking-wide">{formattedTime}</span>
      </div>
    </div>
  );
}
