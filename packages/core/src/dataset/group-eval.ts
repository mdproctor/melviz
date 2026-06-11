import type { CellValue, ColumnId, TypedDataSet } from "./types.js";
import { ColumnType } from "./types.js";
import type { Aggregation, Interval, IntervalList } from "./group.js";
import type { FixedCalendarUnit } from "./group.js";
import type { Month, DayOfWeek } from "./date-interval.js";
import type { DateIntervalType } from "./date-interval.js";
import {
  APPROXIMATE_DURATION_MS,
  truncateToInterval,
  advanceByInterval,
} from "./date-interval.js";

export function computeAggregation(
  fn: Aggregation,
  values: readonly CellValue[],
): CellValue {
  switch (fn.fn) {
    case "COUNT":
      return { type: ColumnType.NUMBER, value: values.length };

    case "DISTINCT":
      return countDistinct(values);

    case "SUM":
      return sumValues(values);

    case "AVERAGE":
      return averageValues(values);

    case "MEDIAN":
      return medianValues(values);

    case "MIN":
      return minValue(values);

    case "MAX":
      return maxValue(values);

    case "JOIN":
      return joinValues(values, fn.separator);
  }
}

function countDistinct(values: readonly CellValue[]): CellValue {
  if (values.length === 0) {
    return { type: ColumnType.NUMBER, value: 0 };
  }

  const seen = new Set<string>();
  for (const val of values) {
    const key = cellValueKey(val);
    seen.add(key);
  }

  return { type: ColumnType.NUMBER, value: seen.size };
}

function cellValueKey(val: CellValue): string {
  if (val.type === "NULL") {
    return "NULL";
  }
  if (val.type === ColumnType.NUMBER) {
    return `NUM:${val.value}`;
  }
  if (val.type === ColumnType.DATE) {
    return `DATE:${val.value.getTime()}`;
  }
  if (val.type === ColumnType.TEXT) {
    return `TEXT:${val.value}`;
  }
  if (val.type === ColumnType.LABEL) {
    return `LABEL:${val.value}`;
  }
  return "UNKNOWN";
}

function sumValues(values: readonly CellValue[]): CellValue {
  let sum = 0;
  for (const val of values) {
    if (val.type === ColumnType.NUMBER) {
      sum += val.value;
    }
  }
  return { type: ColumnType.NUMBER, value: sum };
}

function averageValues(values: readonly CellValue[]): CellValue {
  let sum = 0;
  let count = 0;
  for (const val of values) {
    if (val.type === ColumnType.NUMBER) {
      sum += val.value;
      count++;
    }
  }

  if (count === 0) {
    return { type: "NULL" };
  }

  return { type: ColumnType.NUMBER, value: sum / count };
}

function medianValues(values: readonly CellValue[]): CellValue {
  const numbers: number[] = [];
  for (const val of values) {
    if (val.type === ColumnType.NUMBER) {
      numbers.push(val.value);
    }
  }

  if (numbers.length === 0) {
    return { type: "NULL" };
  }

  numbers.sort((a, b) => a - b);

  if (numbers.length % 2 === 1) {
    // Odd count: return middle element
    const mid = Math.floor(numbers.length / 2);
    return { type: ColumnType.NUMBER, value: numbers[mid]! };
  } else {
    // Even count: return average of two middle elements
    const mid2 = numbers.length / 2;
    const mid1 = mid2 - 1;
    return { type: ColumnType.NUMBER, value: (numbers[mid1]! + numbers[mid2]!) / 2 };
  }
}

function minValue(values: readonly CellValue[]): CellValue {
  let min: CellValue | undefined;

  for (const val of values) {
    if (val.type === "NULL") {
      continue;
    }

    if (min === undefined) {
      min = val;
      continue;
    }

    if (compareValues(val, min) < 0) {
      min = val;
    }
  }

  return min ?? { type: "NULL" };
}

function maxValue(values: readonly CellValue[]): CellValue {
  let max: CellValue | undefined;

  for (const val of values) {
    if (val.type === "NULL") {
      continue;
    }

    if (max === undefined) {
      max = val;
      continue;
    }

    if (compareValues(val, max) > 0) {
      max = val;
    }
  }

  return max ?? { type: "NULL" };
}

function compareValues(a: CellValue, b: CellValue): number {
  if (a.type === "NULL" || b.type === "NULL") {
    throw new Error("Cannot compare NULL values");
  }

  if (a.type === ColumnType.NUMBER && b.type === ColumnType.NUMBER) {
    return a.value - b.value;
  }

  if (a.type === ColumnType.DATE && b.type === ColumnType.DATE) {
    return a.value.getTime() - b.value.getTime();
  }

  if (
    (a.type === ColumnType.TEXT || a.type === ColumnType.LABEL) &&
    (b.type === ColumnType.TEXT || b.type === ColumnType.LABEL)
  ) {
    return a.value.localeCompare(b.value);
  }

  throw new Error(`Cannot compare values of types ${a.type} and ${b.type}`);
}

function joinValues(values: readonly CellValue[], separator: string): CellValue {
  const parts: string[] = [];

  for (const val of values) {
    if (val.type === "NULL") {
      continue;
    }

    if (val.type === ColumnType.NUMBER) {
      parts.push(String(val.value));
    } else if (val.type === ColumnType.DATE) {
      parts.push(val.value.toISOString());
    } else if (val.type === ColumnType.TEXT || val.type === ColumnType.LABEL) {
      parts.push(val.value);
    }
  }

  return { type: ColumnType.TEXT, value: parts.join(separator) };
}

export function buildDistinctIntervals(
  ds: TypedDataSet,
  sourceId: ColumnId,
): IntervalList {
  // Map unique values to their bucket (index and row indices)
  const buckets = new Map<string, { index: number; rowIndices: number[] }>();
  const bucketOrder: string[] = []; // Track first-seen order

  // Walk rows and build buckets
  for (let rowIdx = 0; rowIdx < ds.rows.length; rowIdx++) {
    const row = ds.rows[rowIdx]!;
    const cellValue = row.cell(sourceId);
    const bucketName = getBucketName(cellValue);

    let bucket = buckets.get(bucketName);
    if (bucket === undefined) {
      // First time seeing this value — create new bucket
      bucket = {
        index: buckets.size,
        rowIndices: [],
      };
      buckets.set(bucketName, bucket);
      bucketOrder.push(bucketName);
    }

    bucket.rowIndices.push(rowIdx);
  }

  // Convert map to IntervalList in first-seen order
  const intervals: Interval[] = [];
  for (const bucketName of bucketOrder) {
    const bucket = buckets.get(bucketName)!;
    intervals.push({
      name: bucketName,
      index: bucket.index,
      rowIndices: Object.freeze([...bucket.rowIndices]),
    });
  }

  return Object.freeze(intervals);
}

function getBucketName(val: CellValue): string {
  if (val.type === "NULL") {
    return "null";
  }
  if (val.type === ColumnType.NUMBER) {
    return String(val.value);
  }
  if (val.type === ColumnType.DATE) {
    return val.value.toISOString();
  }
  if (val.type === ColumnType.TEXT || val.type === ColumnType.LABEL) {
    return val.value;
  }
  return "unknown";
}

export function buildFixedCalendarIntervals(
  ds: TypedDataSet,
  sourceId: ColumnId,
  unit: FixedCalendarUnit,
  opts?: { firstMonthOfYear?: Month; firstDayOfWeek?: DayOfWeek },
): IntervalList {
  const bucketCount = getFixedBucketCount(unit);
  const firstMonth = opts?.firstMonthOfYear ?? 1;
  const firstDay = opts?.firstDayOfWeek ?? 1;

  // Pre-allocate row index arrays for each bucket
  const bucketRows: number[][] = [];
  for (let i = 0; i < bucketCount; i++) {
    bucketRows.push([]);
  }

  // Walk rows and assign to buckets
  for (let rowIdx = 0; rowIdx < ds.rows.length; rowIdx++) {
    const row = ds.rows[rowIdx]!;
    const cellValue = row.cell(sourceId);
    if (cellValue.type !== ColumnType.DATE) {
      continue; // skip NULLs and non-date values
    }

    const bucketIndex = getFixedBucketIndex(cellValue.value, unit, firstMonth, firstDay);
    bucketRows[bucketIndex]!.push(rowIdx);
  }

  // Build intervals
  const intervals: Interval[] = [];
  const nameOffset = getFixedNameOffset(unit);
  for (let i = 0; i < bucketCount; i++) {
    intervals.push({
      name: String(i + nameOffset),
      index: i,
      rowIndices: Object.freeze([...bucketRows[i]!]),
    });
  }

  return Object.freeze(intervals);
}

function getFixedBucketCount(unit: FixedCalendarUnit): number {
  switch (unit) {
    case "QUARTER": return 4;
    case "MONTH": return 12;
    case "DAY_OF_WEEK": return 7;
    case "HOUR": return 24;
    case "MINUTE": return 60;
    case "SECOND": return 60;
  }
}

/** Name offset: MONTH/QUARTER/DAY_OF_WEEK start at 1, HOUR/MINUTE/SECOND start at 0 */
function getFixedNameOffset(unit: FixedCalendarUnit): number {
  switch (unit) {
    case "QUARTER":
    case "MONTH":
    case "DAY_OF_WEEK":
      return 1;
    case "HOUR":
    case "MINUTE":
    case "SECOND":
      return 0;
  }
}

function getFixedBucketIndex(
  d: Date,
  unit: FixedCalendarUnit,
  firstMonth: Month,
  firstDay: DayOfWeek,
): number {
  switch (unit) {
    case "MONTH": {
      // Calendar month (1-based) mapped to bucket position with rotation
      const calMonth = d.getUTCMonth() + 1; // 1-12
      return ((calMonth - firstMonth + 12) % 12);
    }

    case "QUARTER": {
      // Determine which fiscal quarter the month falls into
      const calMonth = d.getUTCMonth() + 1; // 1-12
      const offset = ((calMonth - firstMonth + 12) % 12);
      return Math.floor(offset / 3);
    }

    case "DAY_OF_WEEK": {
      // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
      // ISO: 1=Mon, 2=Tue, ..., 7=Sun
      const isoDay = ((d.getUTCDay() + 6) % 7) + 1; // 1-7
      return ((isoDay - firstDay + 7) % 7);
    }

    case "HOUR":
      return d.getUTCHours();

    case "MINUTE":
      return d.getUTCMinutes();

    case "SECOND":
      return d.getUTCSeconds();
  }
}

/**
 * Ordered list of DateIntervalTypes from finest to coarsest,
 * excluding sub-second, DAY_OF_WEEK, and WEEK per spec §5.
 */
const DATE_INTERVAL_ORDER: readonly DateIntervalType[] = [
  "SECOND", "MINUTE", "HOUR", "DAY", "MONTH", "QUARTER",
  "YEAR", "DECADE", "CENTURY", "MILLENIUM",
];

export function buildDynamicDateIntervals(
  ds: TypedDataSet,
  sourceId: ColumnId,
  maxIntervals: number,
  opts?: { preferredUnit?: DateIntervalType; firstMonthOfYear?: Month },
): IntervalList {
  // 1. Collect non-null DATE values with row indices
  const entries: { rowIdx: number; date: Date }[] = [];
  for (let rowIdx = 0; rowIdx < ds.rows.length; rowIdx++) {
    const row = ds.rows[rowIdx]!;
    const cellValue = row.cell(sourceId);
    if (cellValue.type === ColumnType.DATE) {
      entries.push({ rowIdx, date: cellValue.value });
    }
  }

  if (entries.length === 0) {
    return Object.freeze([]);
  }

  // 2. Sort by date ascending
  entries.sort((a, b) => a.date.getTime() - b.date.getTime());

  const minDate = entries[0]!.date;
  const maxDate = entries[entries.length - 1]!.date;

  // 3. If min === max or only one date: single interval
  if (minDate.getTime() === maxDate.getTime()) {
    return Object.freeze([{
      name: formatIntervalName(minDate, "SECOND"),
      index: 0,
      rowIndices: Object.freeze(entries.map((e) => e.rowIdx)),
      minValue: new Date(minDate),
      maxValue: new Date(maxDate),
    }]);
  }

  // 4. Compute span
  const span = maxDate.getTime() - minDate.getTime();

  // 5. Walk DateIntervalType order to find appropriate unit
  let selectedType: DateIntervalType = "MILLENIUM";
  for (const type of DATE_INTERVAL_ORDER) {
    const numIntervals = span / APPROXIMATE_DURATION_MS[type];
    if (numIntervals < maxIntervals) {
      selectedType = type;
      break;
    }
  }

  // 6. Enforce preferredUnit — never go finer than preferred
  if (opts?.preferredUnit !== undefined) {
    const preferredIdx = DATE_INTERVAL_ORDER.indexOf(opts.preferredUnit);
    const selectedIdx = DATE_INTERVAL_ORDER.indexOf(selectedType);
    // If selected is finer (lower index) than preferred, use preferred
    if (preferredIdx >= 0 && selectedIdx >= 0 && selectedIdx < preferredIdx) {
      selectedType = opts.preferredUnit;
    }
  }

  // 7. Generate boundaries
  const truncOpts = opts?.firstMonthOfYear !== undefined
    ? { firstMonthOfYear: opts.firstMonthOfYear }
    : undefined;

  let boundaryStart = truncateToInterval(minDate, selectedType, truncOpts);
  const boundaries: Date[] = [boundaryStart];
  while (boundaryStart.getTime() <= maxDate.getTime()) {
    boundaryStart = advanceByInterval(boundaryStart, selectedType, 1);
    boundaries.push(boundaryStart);
  }

  // 8. Build intervals from boundary pairs and assign rows
  const intervals: Interval[] = [];
  let entryIdx = 0;

  for (let i = 0; i < boundaries.length - 1; i++) {
    const intervalStart = boundaries[i]!;
    const intervalEnd = boundaries[i + 1]!;
    const rowIndices: number[] = [];

    // Walk entries that fall within [intervalStart, intervalEnd)
    while (entryIdx < entries.length && entries[entryIdx]!.date.getTime() < intervalEnd.getTime()) {
      rowIndices.push(entries[entryIdx]!.rowIdx);
      entryIdx++;
    }

    intervals.push({
      name: formatIntervalName(intervalStart, selectedType),
      index: i,
      rowIndices: Object.freeze([...rowIndices]),
      minValue: new Date(intervalStart),
      maxValue: new Date(intervalEnd),
    });
  }

  return Object.freeze(intervals);
}

function formatIntervalName(d: Date, unit: DateIntervalType): string {
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const MM = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const HH = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");

  switch (unit) {
    case "MILLENIUM":
    case "CENTURY":
    case "DECADE":
    case "YEAR":
      return yyyy;
    case "QUARTER":
    case "MONTH":
      return `${yyyy}-${MM}`;
    case "WEEK":
    case "DAY":
    case "DAY_OF_WEEK":
      return `${yyyy}-${MM}-${dd}`;
    case "HOUR":
      return `${yyyy}-${MM}-${dd} ${HH}`;
    case "MINUTE":
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
    case "SECOND":
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    default:
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
  }
}

export function buildDynamicNumberIntervals(
  ds: TypedDataSet,
  sourceId: ColumnId,
  maxIntervals: number,
): IntervalList {
  // 1. Collect non-null NUMBER values with row indices
  const entries: { rowIdx: number; value: number }[] = [];
  for (let rowIdx = 0; rowIdx < ds.rows.length; rowIdx++) {
    const row = ds.rows[rowIdx]!;
    const cellValue = row.cell(sourceId);
    if (cellValue.type === ColumnType.NUMBER) {
      entries.push({ rowIdx, value: cellValue.value });
    }
  }

  if (entries.length === 0) {
    return Object.freeze([]);
  }

  // 2. Find min and max
  let min = entries[0]!.value;
  let max = entries[0]!.value;
  for (const entry of entries) {
    if (entry.value < min) min = entry.value;
    if (entry.value > max) max = entry.value;
  }

  // 3. Single value → single interval
  if (min === max) {
    return Object.freeze([{
      name: `${min}-${max}`,
      index: 0,
      rowIndices: Object.freeze(entries.map((e) => e.rowIdx)),
      minValue: min,
      maxValue: max,
    }]);
  }

  // 4. Compute bin width and generate bins
  const binWidth = (max - min) / maxIntervals;

  // Sort entries by value for efficient bin assignment
  entries.sort((a, b) => a.value - b.value);

  const intervals: Interval[] = [];
  let entryIdx = 0;

  for (let i = 0; i < maxIntervals; i++) {
    const binMin = min + i * binWidth;
    const binMax = min + (i + 1) * binWidth;
    const isLastBin = i === maxIntervals - 1;
    const rowIndices: number[] = [];

    // Walk sorted entries that fall within this bin
    // Last bin uses <= for upper bound (includes max)
    while (entryIdx < entries.length) {
      const val = entries[entryIdx]!.value;
      if (isLastBin ? val <= binMax : val < binMax) {
        rowIndices.push(entries[entryIdx]!.rowIdx);
        entryIdx++;
      } else {
        break;
      }
    }

    intervals.push({
      name: `${binMin}-${binMax}`,
      index: i,
      rowIndices: Object.freeze([...rowIndices]),
      minValue: binMin,
      maxValue: binMax,
    });
  }

  return Object.freeze(intervals);
}
