import type { ColumnId } from "./types.js";
import type { DateIntervalType, Month, DayOfWeek } from "./date-interval.js";

export type NumericAggregation =
  | { readonly fn: "SUM" }
  | { readonly fn: "AVERAGE" }
  | { readonly fn: "MEDIAN" };

export type UniversalAggregation =
  | { readonly fn: "COUNT" }
  | { readonly fn: "DISTINCT" }
  | { readonly fn: "MIN" }
  | { readonly fn: "MAX" }
  | { readonly fn: "JOIN"; readonly separator: string };

export type Aggregation = NumericAggregation | UniversalAggregation;

export type ResultColumn =
  | { readonly kind: "key"; readonly sourceId: ColumnId; readonly columnId: ColumnId }
  | { readonly kind: "aggregate"; readonly sourceId: ColumnId; readonly columnId: ColumnId;
      readonly fn: Aggregation }
  | { readonly kind: "select"; readonly sourceId: ColumnId; readonly columnId: ColumnId };

export type FixedCalendarUnit =
  | "QUARTER" | "MONTH" | "DAY_OF_WEEK"
  | "HOUR" | "MINUTE" | "SECOND";

export type GroupStrategy =
  | { readonly mode: "distinct" }
  | { readonly mode: "fixedCalendar"; readonly unit: FixedCalendarUnit }
  | { readonly mode: "dynamicRange"; readonly preferredUnit?: DateIntervalType }
  | { readonly mode: "dynamic"; readonly preferredUnit?: DateIntervalType };

export interface GroupingKey {
  readonly sourceId: ColumnId;
  readonly columnId: ColumnId;
  readonly strategy: GroupStrategy;
  readonly maxIntervals: number;
  readonly emptyIntervals: boolean;
  readonly ascendingOrder: boolean;
  readonly firstMonthOfYear?: Month;
  readonly firstDayOfWeek?: DayOfWeek;
}

export interface Interval {
  readonly name: string;
  readonly index: number;
  readonly rowIndices: readonly number[];
  readonly minValue?: Date | number;
  readonly maxValue?: Date | number;
}

export type IntervalList = readonly Interval[];

export interface GroupOp {
  readonly type: "group";
  readonly groupingKey: GroupingKey | null;
  readonly columns: readonly ResultColumn[];
  readonly selectedIntervals?: readonly string[];
  readonly join?: boolean;
}
