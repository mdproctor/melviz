import {
  type DateIntervalType,
  type Month,
  truncateToInterval,
  advanceByInterval,
} from "./date-interval.js";

export type { DateIntervalType, Month };

export type TruncationUnit = Extract<
  DateIntervalType,
  | "MINUTE" | "HOUR" | "DAY"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM"
>;

export type OffsetUnit = Extract<
  DateIntervalType,
  | "SECOND" | "MINUTE" | "HOUR"
  | "DAY" | "WEEK"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM"
>;

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

const MONTH_NAME_TO_NUMBER: Record<string, Month> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4,
  MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8,
  SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

function isTruncationUnit(s: string): s is TruncationUnit {
  return TRUNCATION_UNITS.has(s);
}

function isOffsetUnit(s: string): s is OffsetUnit {
  return OFFSET_UNITS.has(s);
}

function isMonth(s: string): boolean {
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
    firstMonthOfYear = MONTH_NAME_TO_NUMBER[monthStr]!;
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
  return advanceByInterval(date, offset.unit, offset.amount);
}

function truncate(date: Date, unit: TruncationUnit, mode: "begin" | "end", firstMonthOfYear?: Month): Date {
  const opts = firstMonthOfYear ? { firstMonthOfYear } : undefined;
  const truncated = truncateToInterval(date, unit, opts);
  return mode === "end" ? advanceByInterval(truncated, unit, 1) : truncated;
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
