"use client";

import { useEffect, useState } from "react";

const madridTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Madrid",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function formatMadridTime(date: Date) {
  const values = Object.fromEntries(
    madridTimeFormatter
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );

  return `${values.hour}:${values.minute}:${values.second}`;
}

export default function TeacherLiveClock({ compact = false }: { compact?: boolean }) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => setTime(formatMadridTime(new Date()));

    updateTime();
    const timer = window.setInterval(updateTime, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const label = compact ? "Madrid" : "Madrid time";

  return (
    <div
      className={`teacher-live-clock ${compact ? "is-mobile" : "is-header"}`}
      role="timer"
      aria-label={time ? `Madrid time ${time}` : "Madrid time loading"}
    >
      <span>{label}</span>
      <time dateTime={time || undefined}>{time || "--:--:--"}</time>
    </div>
  );
}
