export type DateIntervalType =
  | "MILLISECOND" | "HUNDRETH" | "TENTH"
  | "SECOND" | "MINUTE" | "HOUR"
  | "DAY" | "DAY_OF_WEEK" | "WEEK"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const APPROXIMATE_DURATION_MS: Readonly<Record<DateIntervalType, number>> = {
  MILLISECOND: 1,
  HUNDRETH: 10,
  TENTH: 100,
  SECOND: 1_000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
  DAY_OF_WEEK: 86_400_000,
  WEEK: 604_800_000,
  MONTH: 2_678_400_000,
  QUARTER: 8_035_200_000,
  YEAR: 32_140_800_000,
  DECADE: 321_408_000_000,
  CENTURY: 3_214_080_000_000,
  MILLENIUM: 32_140_800_000_000,
};

export interface TruncateOptions {
  /**
   * First month of the fiscal year (1-based). Default: 1 (January).
   * Used for YEAR and QUARTER truncation.
   */
  firstMonthOfYear?: Month;
}

/**
 * Helper to find the quarter start month for a fiscal year.
 * @param firstMonth0Based - First month of fiscal year (0-based)
 * @param currentMonth0Based - Current month (0-based)
 * @returns Start month of the quarter (0-based)
 */
function getQuarterFirstMonth(firstMonth0Based: number, currentMonth0Based: number): number {
  const quarters = [
    firstMonth0Based,
    (firstMonth0Based + 3) % 12,
    (firstMonth0Based + 6) % 12,
    (firstMonth0Based + 9) % 12,
  ];

  // Find which quarter the current month falls into
  for (let i = 0; i < 4; i++) {
    const qStart = quarters[i]!;
    const qEnd = i === 3 ? firstMonth0Based : quarters[i + 1]!;

    if (qStart < qEnd) {
      // Normal case: quarter doesn't wrap around year
      if (currentMonth0Based >= qStart && currentMonth0Based < qEnd) {
        return qStart;
      }
    } else {
      // Quarter wraps around year end (e.g., Q4 starting in Oct for April fiscal year)
      if (currentMonth0Based >= qStart || currentMonth0Based < qEnd) {
        return qStart;
      }
    }
  }

  // Should never reach here
  return firstMonth0Based;
}

/**
 * Truncate a date to the start of a given interval unit.
 * Does not mutate the input date.
 * All date operations use UTC methods.
 *
 * @param date - The date to truncate
 * @param unit - The interval unit
 * @param opts - Options for truncation (e.g., firstMonthOfYear for fiscal year)
 * @returns A new Date truncated to the start of the interval
 */
export function truncateToInterval(
  date: Date,
  unit: DateIntervalType,
  opts?: TruncateOptions
): Date {
  const result = new Date(date);
  const firstMonthOfYear = opts?.firstMonthOfYear ?? 1;
  const firstMonth0Based = firstMonthOfYear - 1;

  switch (unit) {
    case "MILLISECOND":
      return result;

    case "HUNDRETH":
      result.setUTCMilliseconds(Math.floor(result.getUTCMilliseconds() / 10) * 10);
      return result;

    case "TENTH":
      result.setUTCMilliseconds(Math.floor(result.getUTCMilliseconds() / 100) * 100);
      return result;

    case "SECOND":
      result.setUTCMilliseconds(0);
      return result;

    case "MINUTE":
      result.setUTCSeconds(0, 0);
      return result;

    case "HOUR":
      result.setUTCMinutes(0, 0, 0);
      return result;

    case "DAY":
    case "DAY_OF_WEEK":
    case "WEEK":
      result.setUTCHours(0, 0, 0, 0);
      return result;

    case "MONTH":
      result.setUTCDate(1);
      result.setUTCHours(0, 0, 0, 0);
      return result;

    case "QUARTER": {
      const currentMonth0Based = result.getUTCMonth();
      const quarterStartMonth = getQuarterFirstMonth(firstMonth0Based, currentMonth0Based);
      result.setUTCMonth(quarterStartMonth, 1);
      result.setUTCHours(0, 0, 0, 0);
      return result;
    }

    case "YEAR": {
      const currentMonth0Based = result.getUTCMonth();
      const currentYear = result.getUTCFullYear();

      // If we're before the fiscal year start month, use previous year's fiscal year start
      if (currentMonth0Based < firstMonth0Based) {
        result.setUTCFullYear(currentYear - 1, firstMonth0Based, 1);
      } else {
        result.setUTCFullYear(currentYear, firstMonth0Based, 1);
      }
      result.setUTCHours(0, 0, 0, 0);
      return result;
    }

    case "DECADE": {
      const year = result.getUTCFullYear();
      result.setUTCFullYear(Math.floor(year / 10) * 10, firstMonth0Based, 1);
      result.setUTCHours(0, 0, 0, 0);
      return result;
    }

    case "CENTURY": {
      const year = result.getUTCFullYear();
      result.setUTCFullYear(Math.floor(year / 100) * 100, firstMonth0Based, 1);
      result.setUTCHours(0, 0, 0, 0);
      return result;
    }

    case "MILLENIUM": {
      const year = result.getUTCFullYear();
      result.setUTCFullYear(Math.floor(year / 1000) * 1000, firstMonth0Based, 1);
      result.setUTCHours(0, 0, 0, 0);
      return result;
    }
  }
}

/**
 * Advance a date by a given number of intervals.
 * Does not mutate the input date.
 * All date operations use UTC methods.
 *
 * @param date - The date to advance
 * @param unit - The interval unit
 * @param count - Number of intervals to advance (can be negative)
 * @returns A new Date advanced by the specified interval count
 */
export function advanceByInterval(
  date: Date,
  unit: DateIntervalType,
  count: number
): Date {
  const result = new Date(date);

  switch (unit) {
    case "MILLISECOND":
      result.setTime(result.getTime() + count);
      return result;

    case "HUNDRETH":
      result.setTime(result.getTime() + count * 10);
      return result;

    case "TENTH":
      result.setTime(result.getTime() + count * 100);
      return result;

    case "SECOND":
      result.setTime(result.getTime() + count * 1_000);
      return result;

    case "MINUTE":
      result.setTime(result.getTime() + count * 60_000);
      return result;

    case "HOUR":
      result.setTime(result.getTime() + count * 3_600_000);
      return result;

    case "DAY":
    case "DAY_OF_WEEK":
      result.setTime(result.getTime() + count * 86_400_000);
      return result;

    case "WEEK":
      result.setTime(result.getTime() + count * 7 * 86_400_000);
      return result;

    case "MONTH":
      result.setUTCMonth(result.getUTCMonth() + count);
      return result;

    case "QUARTER":
      result.setUTCMonth(result.getUTCMonth() + count * 3);
      return result;

    case "YEAR":
      result.setUTCFullYear(result.getUTCFullYear() + count);
      return result;

    case "DECADE":
      result.setUTCFullYear(result.getUTCFullYear() + count * 10);
      return result;

    case "CENTURY":
      result.setUTCFullYear(result.getUTCFullYear() + count * 100);
      return result;

    case "MILLENIUM":
      result.setUTCFullYear(result.getUTCFullYear() + count * 1000);
      return result;
  }
}
