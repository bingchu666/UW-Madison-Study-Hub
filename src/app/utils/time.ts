export const getUserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export const DISPLAY_LOCALE = "en-US";

export const toDate = (value: string | number | Date | undefined | null): Date => {
  if (value instanceof Date) {
    return value;
  }
  if (value === undefined || value === null) {
    return new Date(NaN);
  }
  return new Date(value);
};

const parseSourceDateParts = (sourceDate?: string | null): { year: number; month: number; day: number } | null => {
  if (!sourceDate) {
    return null;
  }
  const [year, month, day] = sourceDate.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return { year, month, day };
};

export const parseSourceDate = (sourceDate?: string | null): Date => {
  const parts = parseSourceDateParts(sourceDate);
  if (!parts) {
    return new Date(NaN);
  }
  // Use local noon to keep all-day events pinned to the same local calendar date.
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
};

export const getEventAnchorDate = (
  value: string | number | Date | undefined | null,
  allDay?: boolean,
  sourceDate?: string | null,
): Date => {
  if (allDay && sourceDate) {
    return parseSourceDate(sourceDate);
  }
  return toDate(value);
};

export const getEventDeadlineDate = (
  value: string | number | Date | undefined | null,
  allDay?: boolean,
  sourceDate?: string | null,
): Date => {
  const date = getEventAnchorDate(value, allDay, sourceDate);
  if (Number.isNaN(date.getTime())) {
    return date;
  }
  if (!allDay || !sourceDate) {
    return date;
  }
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
};

export const formatLocalDate = (value: string | number | Date, opts?: Intl.DateTimeFormatOptions): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(opts || {}),
  }).format(date);
};

export const formatLocalTime = (value: string | number | Date, opts?: Intl.DateTimeFormatOptions): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return "TBA";
  }
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    ...(opts || {}),
  }).format(date);
};

export const formatLocalDateTime = (value: string | number | Date): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const formatLocalFullDateTime = (value: string | number | Date): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const formatAllDayLabel = (sourceDate?: string | null): string => {
  const date = parseSourceDate(sourceDate);
  if (Number.isNaN(date.getTime())) {
    return "All day";
  }
  return `${formatLocalDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} (all day)`;
};

export const formatTimeRange = (
  startUtc?: string | null,
  endUtc?: string | null,
  allDay?: boolean,
  sourceDate?: string | null,
): string => {
  if (allDay) {
    return formatAllDayLabel(sourceDate);
  }

  if (!startUtc) {
    return "TBA";
  }

  if (!endUtc) {
    return formatLocalTime(startUtc);
  }

  return `${formatLocalTime(startUtc)} - ${formatLocalTime(endUtc)}`;
};

export const isBetweenNowAndHours = (value: Date, hours: number, now = new Date()): boolean => {
  const end = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return value >= now && value <= end;
};

export const isBetweenNowAndDays = (value: Date, days: number, now = new Date()): boolean => {
  const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return value >= now && value <= end;
};

export const isAfterDays = (value: Date, days: number, now = new Date()): boolean => {
  const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return value > threshold;
};

export const getLocalWeekEnd = (now = new Date()): Date => {
  const end = new Date(now);
  const day = end.getDay();
  const delta = 6 - day;
  end.setDate(end.getDate() + delta);
  end.setHours(23, 59, 59, 999);
  return end;
};

export const isSameLocalDay = (a: Date, b: Date): boolean => {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

export const isSameLocalDayForEvent = (
  value: string | number | Date | undefined | null,
  day: Date,
  allDay?: boolean,
  sourceDate?: string | null,
): boolean => {
  const eventDate = getEventAnchorDate(value, allDay, sourceDate);
  if (Number.isNaN(eventDate.getTime())) {
    return false;
  }
  return isSameLocalDay(eventDate, day);
};

export const formatEnglishShortWeekday = (value: string | number | Date): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, { weekday: "short" }).format(date);
};

export const formatEnglishDayNumber = (value: string | number | Date): string => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, { day: "numeric" }).format(date);
};
