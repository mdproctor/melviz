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
