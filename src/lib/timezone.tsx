import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "scoreref-tz";

export const TIMEZONE_OPTIONS = [
  "UTC",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Jerusalem",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Lagos",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "Pacific/Auckland",
  "Pacific/Fiji",
  "Australia/Sydney",
] as const;

/** Detect browser timezone, falling back to UTC. */
export function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || "UTC";
  } catch {
    return "UTC";
  }
}

export function getSavedTimezone(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
  } catch { /* localStorage unavailable */ }
  return detectTimezone();
}

export function saveTimezone(tz: string) {
  try { localStorage.setItem(STORAGE_KEY, tz); } catch { /* ignore */ }
}

/* ---- Date/time helpers ---- */

interface DateFields {
  year: number; month: number; day: number;
  weekday: number; // 0=Sun..6=Sat
  hour: number; minute: number;
}

const WEEKDAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Extract date fields (year, month, day, weekday, hour, minute) in a given IANA timezone. */
export function getDateFields(date: Date, tz: string): DateFields {
  const parts = Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const obj: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") obj[p.type] = p.value;
  }
  return {
    year: parseInt(obj.year),
    month: parseInt(obj.month),
    day: parseInt(obj.day),
    weekday: WEEKDAY_KEYS.indexOf(obj.weekday as typeof WEEKDAY_KEYS[number]),
    hour: parseInt(obj.hour),
    minute: parseInt(obj.minute),
  };
}

/** Format a Unix timestamp (seconds) as HH:MM in the given timezone. */
export function formatKickoffTime(ts: number, tz: string): string {
  const fields = getDateFields(new Date(ts * 1000), tz);
  return fields.hour.toString().padStart(2, "0") + ":" + fields.minute.toString().padStart(2, "0");
}

/** Format a Date as YYYY-MM-DD in the given timezone. */
export function formatDateISO(date: Date, tz: string): string {
  const fields = getDateFields(date, tz);
  return (
    fields.year.toString() +
    "-" +
    fields.month.toString().padStart(2, "0") +
    "-" +
    fields.day.toString().padStart(2, "0")
  );
}

/** Format a Unix timestamp (seconds) as a short date string in the given timezone. */
export function formatDateShort(ts: number, tz: string): string {
  const fields = getDateFields(new Date(ts * 1000), tz);
  return `${fields.month}/${fields.day}/${fields.year}`;
}

/* ---- Context ---- */

interface TimezoneContextValue {
  timezone: string;
  setTimezone: (tz: string) => void;
}

const TimezoneContext = createContext<TimezoneContextValue | null>(null);

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState(getSavedTimezone);

  useEffect(() => {
    // Re-read in case localStorage changed (edge case)
    setTimezoneState(getSavedTimezone());
  }, []);

  const setTimezone = useCallback((tz: string) => {
    saveTimezone(tz);
    setTimezoneState(tz);
  }, []);

  return (
    <TimezoneContext.Provider value={{ timezone, setTimezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone() {
  const ctx = useContext(TimezoneContext);
  if (!ctx) throw new Error("useTimezone must be used within TimezoneProvider");
  return ctx;
}
