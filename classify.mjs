import { DateTime } from "luxon";

export function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function parseTableDate(value, zone = "Australia/Sydney") {
  const text = cleanText(value);
  if (!text) return null;

  const formats = ["d LLL yyyy", "dd LLL yyyy", "d LLLL yyyy"];
  for (const format of formats) {
    const parsed = DateTime.fromFormat(text, format, {
      zone,
      locale: "en"
    });
    if (parsed.isValid) return parsed.startOf("day");
  }

  return null;
}

export function extractTime(value) {
  const text = cleanText(value);
  const match = text.match(/\b(\d{1,2}):(\d{2})\s*([AP]M)\b/i);
  if (!match) return null;
  return `${match[1]}:${match[2]} ${match[3].toUpperCase()}`;
}

export function combineDateAndTime(date, timeText, zone = "Australia/Sydney") {
  if (!date || !date.isValid || !timeText) return null;

  const parsed = DateTime.fromFormat(
    `${date.toFormat("yyyy-LL-dd")} ${timeText}`,
    "yyyy-LL-dd h:mm a",
    { zone, locale: "en" }
  );

  return parsed.isValid ? parsed : null;
}

export function dateOnly(value, zone = "Australia/Sydney") {
  if (!value) return null;
  if (DateTime.isDateTime(value)) {
    return value.setZone(zone).toFormat("yyyy-LL-dd");
  }
  const parsed = DateTime.fromISO(String(value), { zone });
  return parsed.isValid ? parsed.toFormat("yyyy-LL-dd") : null;
}

export function todayInZone(zone = "Australia/Sydney") {
  return DateTime.now().setZone(zone).startOf("day");
}

export function daysBetween(start, end) {
  if (!start?.isValid || !end?.isValid) return null;
  return Math.floor(end.startOf("day").diff(start.startOf("day"), "days").days);
}
