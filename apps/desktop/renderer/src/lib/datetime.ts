import { format } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

export function zonedDate(utc: string | Date, timezone: string) {
  return toZonedTime(typeof utc === "string" ? new Date(utc) : utc, timezone);
}

export function formatZoned(utc: string | Date, timezone: string, pattern: string) {
  return format(zonedDate(utc, timezone), pattern);
}

export function zonedWallTimeToUtc(date: string, time: string, timezone: string) {
  return fromZonedTime(`${date}T${time}`, timezone).toISOString();
}

export function dateInputValue(utc: string | Date, timezone: string) {
  return format(zonedDate(utc, timezone), "yyyy-MM-dd");
}

export function timeInputValue(utc: string | Date, timezone: string) {
  return format(zonedDate(utc, timezone), "HH:mm");
}

export function sameZonedDay(utc: string | Date, day: Date, timezone: string) {
  return format(zonedDate(utc, timezone), "yyyy-MM-dd") === format(day, "yyyy-MM-dd");
}

export function zonedHourPosition(utc: string | Date, timezone: string) {
  const date = zonedDate(utc, timezone);
  return date.getHours() + date.getMinutes() / 60;
}

export function zonedDateKey(utc: string | Date, timezone: string) {
  return format(zonedDate(utc, timezone), "yyyy-MM-dd");
}

export function zonedNow(timezone: string) {
  return zonedDate(new Date(), timezone);
}

export function zonedDayBoundsUtc(day: Date, timezone: string) {
  const key = format(day, "yyyy-MM-dd");
  return {
    startUtc: fromZonedTime(`${key}T00:00`, timezone).toISOString(),
    endUtc: fromZonedTime(`${key}T23:59:59.999`, timezone).toISOString()
  };
}

export function zonedDateTimeToUtc(day: Date, time: string, timezone: string) {
  return fromZonedTime(`${format(day, "yyyy-MM-dd")}T${time}`, timezone).toISOString();
}
