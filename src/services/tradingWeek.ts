export interface TradingWeekRange {
  start: Date;
  end: Date;
}

export const MARKET_TIME_ZONE = "America/New_York";

export function getCurrentTradingWeek(referenceDate = new Date()): TradingWeekRange {
  const day = referenceDate.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + mondayOffset);

  const fridayClose = new Date(start);
  fridayClose.setDate(start.getDate() + 4);
  fridayClose.setHours(23, 59, 59, 999);

  return {
    start,
    end: referenceDate > fridayClose ? fridayClose : referenceDate
  };
}

export function getCurrentTradingDayRange(referenceDate = new Date()): TradingWeekRange {
  const day = referenceDate.getDay();
  const offset = day === 0 ? -2 : day === 6 ? -1 : 0;

  const start = new Date(referenceDate);
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);

  if (offset === 0) {
    end.setTime(referenceDate.getTime());
  } else {
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

export function getCurrentMarketSessionRange(referenceDate = new Date()): TradingWeekRange {
  const easternParts = getZonedDateTimeParts(referenceDate);
  const offset = easternParts.weekday === 0 ? -2 : easternParts.weekday === 6 ? -1 : 0;
  const sessionDate = addCalendarDays(easternParts.year, easternParts.month, easternParts.day, offset);
  const start = zonedTimeToUtc(sessionDate.year, sessionDate.month, sessionDate.day, 9, 30, 0);
  const close = zonedTimeToUtc(sessionDate.year, sessionDate.month, sessionDate.day, 16, 0, 0);

  if (offset !== 0 || referenceDate >= close) {
    return { start, end: close };
  }

  if (referenceDate < start) {
    return { start, end: start };
  }

  return { start, end: referenceDate };
}

export function formatMarketTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatMarketDateTime(date: Date): string {
  return `${new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date)} ET`;
}

export function formatFinnhubDate(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  return `${year}-${month}-${day}`;
}

export function toUnixSeconds(date: Date): string {
  return String(Math.floor(date.getTime() / 1000));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function getZonedDateTimeParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKET_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: weekdayToNumber(parts.weekday)
  };
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const guessParts = getZonedDateTimeParts(new Date(utcGuess));
  const zonedGuess = Date.UTC(
    guessParts.year,
    guessParts.month - 1,
    guessParts.day,
    guessParts.hour,
    guessParts.minute,
    guessParts.second
  );
  const requested = Date.UTC(year, month - 1, day, hour, minute, second);

  return new Date(utcGuess - (zonedGuess - requested));
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  offset: number
): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day + offset, 12, 0, 0));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function weekdayToNumber(value: unknown): number {
  switch (value) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return 0;
  }
}
