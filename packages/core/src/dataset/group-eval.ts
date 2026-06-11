import type { CellValue, ColumnId, TypedDataSet } from "./types.js";
import { ColumnType } from "./types.js";
import type { Aggregation, Interval, IntervalList } from "./group.js";
import type { FixedCalendarUnit } from "./group.js";
import type { Month, DayOfWeek } from "./date-interval.js";

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
