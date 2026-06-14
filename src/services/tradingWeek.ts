export interface TradingWeekRange {
  start: Date;
  end: Date;
}

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
  const day = referenceDate.getDay();
  const offset = day === 0 ? -2 : day === 6 ? -1 : 0;

  const sessionDate = new Date(referenceDate);
  sessionDate.setDate(sessionDate.getDate() + offset);

  const start = new Date(sessionDate);
  start.setHours(8, 30, 0, 0);

  const close = new Date(sessionDate);
  close.setHours(15, 0, 0, 0);

  if (offset !== 0 || referenceDate > close) {
    return { start, end: close };
  }

  if (referenceDate < start) {
    return { start, end: start };
  }

  return { start, end: referenceDate };
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
