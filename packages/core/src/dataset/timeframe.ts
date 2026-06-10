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
