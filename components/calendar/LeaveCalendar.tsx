"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ro } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";

type CalendarMeta = {
  holidays: Array<{ date: string; name: string }>;
  ownLeaveDays: string[];
  colleagueDays: Array<{ date: string; names: string[] }>;
  weekendDays: string[];
};

type LeaveCalendarProps = {
  selected: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
  year: number;
  onYearChange?: (year: number) => void;
};

export function LeaveCalendar({
  selected,
  onSelect,
  year,
  onYearChange,
}: LeaveCalendarProps) {
  const [meta, setMeta] = useState<CalendarMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/leaves/calendar-data?year=${year}`);
        const body = (await res.json()) as { data?: CalendarMeta; error?: string };
        if (!cancelled && res.ok && body.data) {
          setMeta(body.data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    meta?.holidays.forEach((h) => map.set(h.date, h.name));
    return map;
  }, [meta]);

  const colleagueMap = useMemo(() => {
    const map = new Map<string, string[]>();
    meta?.colleagueDays.forEach((c) => map.set(c.date, c.names));
    return map;
  }, [meta]);

  const ownLeaveSet = useMemo(
    () => new Set(meta?.ownLeaveDays ?? []),
    [meta?.ownLeaveDays]
  );

  const weekendSet = useMemo(
    () => new Set(meta?.weekendDays ?? []),
    [meta?.weekendDays]
  );

  function dayKey(date: Date) {
    return format(date, "yyyy-MM-dd");
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Se încarcă calendarul...</p>
      ) : null}
      <Calendar
        mode="range"
        locale={ro}
        selected={selected}
        onSelect={onSelect}
        numberOfMonths={1}
        defaultMonth={new Date(year, new Date().getMonth(), 1)}
        onMonthChange={(month) => {
          const newYear = month.getFullYear();
          if (newYear !== year) {
            onYearChange?.(newYear);
          }
        }}
        className="mx-auto w-full max-w-md [--cell-size:2.75rem] md:[--cell-size:3rem]"
        modifiers={{
          weekend: (date) => weekendSet.has(dayKey(date)),
          holiday: (date) => holidayMap.has(dayKey(date)),
          ownLeave: (date) => ownLeaveSet.has(dayKey(date)),
          colleague: (date) => colleagueMap.has(dayKey(date)),
        }}
        modifiersClassNames={{
          weekend: "bg-muted/80 text-muted-foreground",
          holiday: "bg-red-100 text-red-900 dark:bg-red-950/50 dark:text-red-200",
          ownLeave: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
          colleague:
            "bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
        }}
      />
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-muted" /> Weekend
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-red-100" /> Sărbătoare legală
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-amber-100" /> Cerere proprie
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded bg-sky-100" /> Coleg în concediu
        </span>
      </div>
    </div>
  );
}
