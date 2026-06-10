export type DateIntervalType =
  | "MILLISECOND" | "HUNDRETH" | "TENTH"
  | "SECOND" | "MINUTE" | "HOUR"
  | "DAY" | "DAY_OF_WEEK" | "WEEK"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

export type TruncationUnit =
  | "MINUTE" | "HOUR" | "DAY"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

export type OffsetUnit =
  | "SECOND" | "MINUTE" | "HOUR"
  | "DAY" | "WEEK"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

export type Month =
  | "JANUARY" | "FEBRUARY" | "MARCH" | "APRIL"
  | "MAY" | "JUNE" | "JULY" | "AUGUST"
  | "SEPTEMBER" | "OCTOBER" | "NOVEMBER" | "DECEMBER";

export interface TimeFrame {
  readonly from: TimeInstant;
  readonly to: TimeInstant;
}

export type TimeInstant =
  | { readonly mode: "now"; readonly offset?: TimeOffset }
  | { readonly mode: "begin"; readonly unit: TruncationUnit; readonly firstMonthOfYear?: Month; readonly offset?: TimeOffset }
  | { readonly mode: "end"; readonly unit: TruncationUnit; readonly firstMonthOfYear?: Month; readonly offset?: TimeOffset }
  | { readonly mode: "relative"; readonly offset: TimeOffset };

export interface TimeOffset {
  readonly amount: number;
  readonly unit: OffsetUnit;
}

const TRUNCATION_UNITS: ReadonlySet<string> = new Set([
  "MINUTE", "HOUR", "DAY", "MONTH", "QUARTER", "YEAR",
  "DECADE", "CENTURY", "MILLENIUM",
]);

const OFFSET_UNITS: ReadonlySet<string> = new Set([
  "SECOND", "MINUTE", "HOUR", "DAY", "WEEK",
  "MONTH", "QUARTER", "YEAR", "DECADE", "CENTURY", "MILLENIUM",
]);

const MONTHS: ReadonlySet<string> = new Set([
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]);

const MONTH_INDEX: Record<Month, number> = {
  JANUARY: 0, FEBRUARY: 1, MARCH: 2, APRIL: 3,
  MAY: 4, JUNE: 5, JULY: 6, AUGUST: 7,
  SEPTEMBER: 8, OCTOBER: 9, NOVEMBER: 10, DECEMBER: 11,
};

function isTruncationUnit(s: string): s is TruncationUnit {
  return TRUNCATION_UNITS.has(s);
}

function isOffsetUnit(s: string): s is OffsetUnit {
  return OFFSET_UNITS.has(s);
}

function isMonth(s: string): s is Month {
  return MONTHS.has(s);
}

function parseTimeOffset(expr: string): TimeOffset {
  const trimmed = expr.trim();
  if (trimmed.length === 0) throw new Error("Empty time offset expression");

  const isNegative = trimmed.startsWith("-");
  const isPositive = trimmed.startsWith("+");
  let i = isNegative || isPositive ? 1 : 0;

  let numberStr = "";
  for (; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ch >= "0" && ch <= "9") numberStr += ch;
    else break;
  }

  if (numberStr.length === 0) throw new Error(`Missing quantity in time offset: "${expr}"`);

  const unitStr = trimmed.substring(i).trim().toUpperCase();
  if (!isOffsetUnit(unitStr)) throw new Error(`Invalid offset unit: "${unitStr}"`);

  const amount = parseInt(numberStr, 10) * (isNegative ? -1 : 1);
  return { amount, unit: unitStr };
}

function parseTimeInstant(expr: string): TimeInstant {
  const trimmed = expr.trim().toLowerCase();
  if (trimmed.length === 0) throw new Error("Empty time instant expression");

  const isBegin = trimmed.startsWith("begin");
  const isEnd = trimmed.startsWith("end");

  if (!isBegin && !isEnd) {
    if (trimmed.startsWith("now")) {
      if (trimmed.length > 3) {
        return { mode: "now", offset: parseTimeOffset(trimmed.substring(3)) };
      }
      return { mode: "now" };
    }
    return { mode: "relative", offset: parseTimeOffset(trimmed) };
  }

  const bracketStart = trimmed.indexOf("[");
  const bracketEnd = trimmed.indexOf("]");
  if (bracketStart === -1 || bracketEnd === -1 || bracketStart >= bracketEnd) {
    throw new Error(`Missing brackets in time instant: "${expr}"`);
  }

  const bracketContent = trimmed.substring(bracketStart + 1, bracketEnd);
  const parts = bracketContent.split(/\s+/);
  if (parts.length > 2) {
    throw new Error(`Too many settings in brackets: "${expr}"`);
  }

  const unitStr = parts[0]!.toUpperCase();
  if (!isTruncationUnit(unitStr)) {
    throw new Error(`Invalid truncation unit: "${unitStr}"`);
  }

  let firstMonthOfYear: Month | undefined;
  if (parts.length === 2) {
    const monthStr = parts[1]!.toUpperCase();
    if (!isMonth(monthStr)) {
      throw new Error(`Invalid month: "${monthStr}"`);
    }
    firstMonthOfYear = monthStr;
  }

  let offset: TimeOffset | undefined;
  const afterBracket = trimmed.substring(bracketEnd + 1).trim();
  if (afterBracket.length > 0) {
    offset = parseTimeOffset(afterBracket);
  }

  return {
    mode: isBegin ? "begin" as const : "end" as const,
    unit: unitStr,
    ...(firstMonthOfYear !== undefined && { firstMonthOfYear }),
    ...(offset !== undefined && { offset }),
  };
}

export function parseTimeFrame(expr: string): TimeFrame {
  if (!expr || expr.trim().length === 0) {
    throw new Error("Empty time frame expression");
  }

  const lower = expr.toLowerCase().trim();
  const tillIndex = lower.indexOf("till");

  if (tillIndex === -1) {
    const instant = parseTimeInstant(lower);
    return { from: instant, to: { mode: "now" } };
  }

  const fromExpr = lower.substring(0, tillIndex);
  const toExpr = lower.substring(tillIndex + 4);
  return { from: parseTimeInstant(fromExpr), to: parseTimeInstant(toExpr) };
}

function applyOffset(date: Date, offset: TimeOffset): Date {
  const d = new Date(date.getTime());
  const { amount, unit } = offset;

  switch (unit) {
    case "MILLENIUM": d.setUTCFullYear(d.getUTCFullYear() + amount * 1000); break;
    case "CENTURY": d.setUTCFullYear(d.getUTCFullYear() + amount * 100); break;
    case "DECADE": d.setUTCFullYear(d.getUTCFullYear() + amount * 10); break;
    case "YEAR": d.setUTCFullYear(d.getUTCFullYear() + amount); break;
    case "QUARTER": d.setUTCMonth(d.getUTCMonth() + amount * 3); break;
    case "MONTH": d.setUTCMonth(d.getUTCMonth() + amount); break;
    case "WEEK": d.setUTCDate(d.getUTCDate() + amount * 7); break;
    case "DAY": d.setUTCDate(d.getUTCDate() + amount); break;
    case "HOUR": d.setUTCHours(d.getUTCHours() + amount); break;
    case "MINUTE": d.setUTCMinutes(d.getUTCMinutes() + amount); break;
    case "SECOND": d.setUTCSeconds(d.getUTCSeconds() + amount); break;
  }
  return d;
}

function getQuarterFirstMonth(firstMonthOfYear: number, currentMonth: number): number {
  for (let q = 3; q >= 0; q--) {
    const qStart = (firstMonthOfYear + q * 3) % 12;
    if (currentMonth >= qStart) return qStart;
  }
  return (firstMonthOfYear + 9) % 12;
}

function truncate(date: Date, unit: TruncationUnit, mode: "begin" | "end", firstMonthOfYear?: Month): Date {
  const d = new Date(date.getTime());
  const firstMonth = firstMonthOfYear ? MONTH_INDEX[firstMonthOfYear] : 0;

  switch (unit) {
    case "MILLENIUM": {
      const base = Math.floor(d.getUTCFullYear() / 1000);
      const inc = mode === "end" ? 1 : 0;
      d.setUTCFullYear((base + inc) * 1000, firstMonth, 1);
      d.setUTCHours(0, 0, 0, 0);
      break;
    }
    case "CENTURY": {
      const base = Math.floor(d.getUTCFullYear() / 100);
      const inc = mode === "end" ? 1 : 0;
      d.setUTCFullYear((base + inc) * 100, firstMonth, 1);
      d.setUTCHours(0, 0, 0, 0);
      break;
    }
    case "DECADE": {
      const base = Math.floor(d.getUTCFullYear() / 10);
      const inc = mode === "end" ? 1 : 0;
      d.setUTCFullYear((base + inc) * 10, firstMonth, 1);
      d.setUTCHours(0, 0, 0, 0);
      break;
    }
    case "YEAR": {
      const month = d.getUTCMonth();
      let yearInc: number;
      if (mode === "begin") yearInc = month < firstMonth ? -1 : 0;
      else yearInc = month < firstMonth ? 0 : 1;
      d.setUTCFullYear(d.getUTCFullYear() + yearInc, firstMonth, 1);
      d.setUTCHours(0, 0, 0, 0);
      break;
    }
    case "QUARTER": {
      const month = d.getUTCMonth();
      const quarterFirstMonth = getQuarterFirstMonth(firstMonth, month);
      if (mode === "begin") {
        const yearInc = quarterFirstMonth > month ? -1 : 0;
        d.setUTCFullYear(d.getUTCFullYear() + yearInc);
        d.setUTCMonth(quarterFirstMonth, 1);
      } else {
        d.setUTCMonth(quarterFirstMonth + 3, 1);
      }
      d.setUTCHours(0, 0, 0, 0);
      break;
    }
    case "MONTH":
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      if (mode === "end") d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "DAY":
      d.setUTCHours(0, 0, 0, 0);
      if (mode === "end") d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "HOUR":
      d.setUTCMinutes(0, 0, 0);
      if (mode === "end") d.setUTCHours(d.getUTCHours() + 1);
      break;
    case "MINUTE":
      d.setUTCSeconds(0, 0);
      if (mode === "end") d.setUTCMinutes(d.getUTCMinutes() + 1);
      break;
  }
  return d;
}

export function resolveInstant(instant: TimeInstant, referenceDate: Date): Date {
  switch (instant.mode) {
    case "now": {
      const d = new Date(referenceDate.getTime());
      return instant.offset ? applyOffset(d, instant.offset) : d;
    }
    case "begin":
    case "end": {
      const d = truncate(referenceDate, instant.unit, instant.mode, instant.firstMonthOfYear);
      return instant.offset ? applyOffset(d, instant.offset) : d;
    }
    case "relative":
      return applyOffset(new Date(referenceDate.getTime()), instant.offset);
  }
}

export function resolveTimeFrame(
  tf: TimeFrame,
  referenceDate: Date,
): { from: Date; to: Date } {
  let from = resolveInstant(tf.from, referenceDate);
  let to = tf.to.mode === "relative"
    ? resolveInstant(tf.to, from)
    : resolveInstant(tf.to, referenceDate);

  if (from > to) [from, to] = [to, from];
  return { from, to };
}
