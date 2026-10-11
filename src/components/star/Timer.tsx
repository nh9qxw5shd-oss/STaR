"use client";

import { useEffect, useState } from "react";
import { fmtHMS } from "@/lib/star/format";

/** HH:MM:SS since `start`, ticking each second; frozen at `end` when given. */
export function Timer({ start, end, className = "" }: { start: string | null | undefined; end?: string | null; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (end) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [end]);
  if (!start) return <span className={className}>--:--:--</span>;
  const until = end ? new Date(end).getTime() : now;
  return (
    <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>
      {until == null ? "--:--:--" : fmtHMS(until - new Date(start).getTime())}
    </span>
  );
}
