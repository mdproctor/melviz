import type { CellValue, Column, ColumnId, TypedDataSet } from "./types.js";
import { ColumnType } from "./types.js";
import type { Aggregation, GroupOp, GroupStrategy, GroupingKey, Interval, IntervalList, ResultColumn } from "./group.js";
import type { FixedCalendarUnit } from "./group.js";
import type { Month, DayOfWeek } from "./date-interval.js";
import type { DateIntervalType } from "./date-interval.js";
import {
  APPROXIMATE_DURATION_MS,
  truncateToInterval,
  advanceByInterval,
} from "./date-interval.js";
import { createTypedRow } from "./conversion.js";
import { DataSetError } from "./errors.js";

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
    return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
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

// ────────────────────────────────────────────────────────────────────────────
// applyGroup — single GroupOp
// ────────────────────────────────────────────────────────────────────────────

export function applyGroup(ds: TypedDataSet, op: GroupOp): TypedDataSet {
  if (op.groupingKey === null) {
    return applyWholeDatasetAggregation(ds, op);
  }

  // selectedIntervals → drill-down (Case 2)
  if (op.selectedIntervals !== undefined && op.selectedIntervals.length > 0) {
    const intervals = computeBuckets(ds, op.groupingKey);
    const selected = filterToSelectedIntervals(intervals, op.selectedIntervals);
    const selectedRowIndices = collectRowIndices(selected);

    // If columns is empty → narrowing only
    if (op.columns.length === 0) {
      return narrowDataSet(ds, selectedRowIndices);
    }

    // Otherwise: build output from the selected rows grouped by bucket
    return materialise(ds, selected, op.columns, op.groupingKey);
  }

  // Case 3: Full group-by
  const resolvedKey = resolveStrategy(ds, op.groupingKey);
  validateStrategyColumnTypeCompat(ds, resolvedKey);

  let intervals = computeBuckets(ds, resolvedKey);

  // Optionally filter empty buckets
  if (!resolvedKey.emptyIntervals) {
    intervals = intervals.filter((iv) => iv.rowIndices.length > 0);
  }

  // Sort buckets
  intervals = sortBuckets(intervals, resolvedKey.ascendingOrder);

  return materialise(ds, intervals, op.columns, resolvedKey);
}

function applyWholeDatasetAggregation(ds: TypedDataSet, op: GroupOp): TypedDataSet {
  // Validate: no key columns allowed without a grouping key
  for (const col of op.columns) {
    if (col.kind === "key") {
      throw new DataSetError(
        "INVALID_OPERATION",
        "Key columns require a grouping key",
      );
    }
  }

  // If ALL columns are select (no aggregates), this is a column projection —
  // pass through all rows with only the selected columns (DashBuilder convention)
  const hasAggregates = op.columns.some(col => col.kind === "aggregate");
  if (!hasAggregates) {
    const outputColumns = buildOutputColumns(ds, op.columns);
    const rows = ds.rows.map(row => {
      const cells: CellValue[] = op.columns.map(col => row.cell(col.sourceId));
      return createTypedRow(cells, outputColumns);
    });
    return { columns: outputColumns, rows };
  }

  // Type-check numeric aggregations
  for (const col of op.columns) {
    if (col.kind === "aggregate") {
      validateAggregationColumnType(ds, col);
    }
  }

  const outputColumns = buildOutputColumns(ds, op.columns);
  const cells: CellValue[] = [];

  for (const col of op.columns) {
    if (col.kind === "aggregate") {
      const values = collectColumnValues(ds, col.sourceId, allRowIndices(ds));
      cells.push(computeAggregation(col.fn, values));
    } else if (col.kind === "select") {
      if (ds.rows.length === 0) {
        cells.push({ type: "NULL" as const });
      } else {
        cells.push(ds.rows[0]!.cell(col.sourceId));
      }
    }
  }

  const row = createTypedRow(cells, outputColumns);
  return { columns: outputColumns, rows: [row] };
}

function resolveStrategy(ds: TypedDataSet, key: GroupingKey): GroupingKey {
  if (key.strategy.mode !== "dynamic") {
    return key;
  }

  const sourceCol = findColumnInDataset(ds, key.sourceId);
  let resolved: GroupingKey;

  switch (sourceCol.type) {
    case ColumnType.LABEL:
    case ColumnType.TEXT:
    case ColumnType.NUMBER:
      resolved = { ...key, strategy: { mode: "distinct" } };
      break;
    case ColumnType.DATE: {
      const dynamicStrategy = key.strategy as { readonly mode: "dynamic"; readonly preferredUnit?: DateIntervalType };
      const rangeStrategy: GroupStrategy = dynamicStrategy.preferredUnit !== undefined
        ? { mode: "dynamicRange", preferredUnit: dynamicStrategy.preferredUnit }
        : { mode: "dynamicRange" };
      resolved = { ...key, strategy: rangeStrategy };
      break;
    }
  }

  return resolved;
}

function validateStrategyColumnTypeCompat(ds: TypedDataSet, key: GroupingKey): void {
  const sourceCol = findColumnInDataset(ds, key.sourceId);

  if (key.strategy.mode === "fixedCalendar" && sourceCol.type !== ColumnType.DATE) {
    throw new DataSetError(
      "TYPE_MISMATCH",
      `fixedCalendar strategy requires a DATE column, got ${sourceCol.type} for column "${key.sourceId}"`,
    );
  }

  if (key.strategy.mode === "dynamicRange" &&
    sourceCol.type !== ColumnType.DATE && sourceCol.type !== ColumnType.NUMBER) {
    throw new DataSetError(
      "TYPE_MISMATCH",
      `dynamicRange strategy requires a DATE or NUMBER column, got ${sourceCol.type} for column "${key.sourceId}"`,
    );
  }
}

function validateAggregationColumnType(ds: TypedDataSet, col: ResultColumn & { kind: "aggregate" }): void {
  const fn = col.fn.fn;
  if (fn === "SUM" || fn === "AVERAGE" || fn === "MEDIAN") {
    const sourceCol = findColumnInDataset(ds, col.sourceId);
    if (sourceCol.type !== ColumnType.NUMBER) {
      throw new DataSetError(
        "TYPE_MISMATCH",
        `${fn} requires a NUMBER column, got ${sourceCol.type} for column "${col.sourceId}"`,
      );
    }
  }
}

function computeBuckets(ds: TypedDataSet, key: GroupingKey): Interval[] {
  switch (key.strategy.mode) {
    case "distinct":
      return [...buildDistinctIntervals(ds, key.sourceId)];
    case "fixedCalendar": {
      const calOpts: { firstMonthOfYear?: Month; firstDayOfWeek?: DayOfWeek } = {};
      if (key.firstMonthOfYear !== undefined) calOpts.firstMonthOfYear = key.firstMonthOfYear;
      if (key.firstDayOfWeek !== undefined) calOpts.firstDayOfWeek = key.firstDayOfWeek;
      return [...buildFixedCalendarIntervals(ds, key.sourceId, key.strategy.unit, calOpts)];
    }
    case "dynamicRange": {
      const sourceCol = findColumnInDataset(ds, key.sourceId);
      if (sourceCol.type === ColumnType.DATE) {
        const dateOpts: { preferredUnit?: DateIntervalType; firstMonthOfYear?: Month } = {};
        if (key.strategy.preferredUnit !== undefined) dateOpts.preferredUnit = key.strategy.preferredUnit;
        if (key.firstMonthOfYear !== undefined) dateOpts.firstMonthOfYear = key.firstMonthOfYear;
        return [...buildDynamicDateIntervals(ds, key.sourceId, key.maxIntervals, dateOpts)];
      }
      return [...buildDynamicNumberIntervals(ds, key.sourceId, key.maxIntervals)];
    }
    case "dynamic":
      // Should have been resolved by resolveStrategy before reaching here
      throw new DataSetError("INVALID_OPERATION", "Unresolved dynamic strategy");
  }
}

function filterToSelectedIntervals(
  intervals: readonly Interval[],
  selected: readonly string[],
): Interval[] {
  const selectedSet = new Set(selected);
  return intervals.filter((iv) => selectedSet.has(iv.name));
}

function collectRowIndices(intervals: readonly Interval[]): number[] {
  const indices: number[] = [];
  for (const iv of intervals) {
    for (const idx of iv.rowIndices) {
      indices.push(idx);
    }
  }
  // Sort to preserve original row order
  indices.sort((a, b) => a - b);
  return indices;
}

function narrowDataSet(ds: TypedDataSet, rowIndices: readonly number[]): TypedDataSet {
  const rows = rowIndices.map((idx) => ds.rows[idx]!);
  return { columns: ds.columns, rows };
}

function allRowIndices(ds: TypedDataSet): number[] {
  const indices: number[] = [];
  for (let i = 0; i < ds.rows.length; i++) {
    indices.push(i);
  }
  return indices;
}

function collectColumnValues(
  ds: TypedDataSet,
  sourceId: ColumnId,
  rowIndices: readonly number[],
): CellValue[] {
  const values: CellValue[] = [];
  for (const idx of rowIndices) {
    values.push(ds.rows[idx]!.cell(sourceId));
  }
  return values;
}

function buildOutputColumns(
  ds: TypedDataSet,
  resultColumns: readonly ResultColumn[],
): Column[] {
  const columns: Column[] = [];

  for (const rc of resultColumns) {
    switch (rc.kind) {
      case "key":
        columns.push({
          id: rc.columnId,
          name: rc.columnId as string,
          type: ColumnType.LABEL,
        });
        break;
      case "aggregate":
        columns.push({
          id: rc.columnId,
          name: rc.columnId as string,
          type: inferAggregateColumnType(ds, rc),
        });
        break;
      case "select": {
        const sourceCol = findColumnInDataset(ds, rc.sourceId);
        columns.push({
          id: rc.columnId,
          name: sourceCol.name,
          type: sourceCol.type,
        });
        break;
      }
    }
  }

  return columns;
}

function inferAggregateColumnType(
  ds: TypedDataSet,
  rc: ResultColumn & { kind: "aggregate" },
): ColumnType {
  const fn = rc.fn.fn;
  switch (fn) {
    case "SUM":
    case "AVERAGE":
    case "MEDIAN":
    case "COUNT":
    case "DISTINCT":
      return ColumnType.NUMBER;
    case "MIN":
    case "MAX":
      return findColumnInDataset(ds, rc.sourceId).type;
    case "JOIN":
      return ColumnType.TEXT;
  }
}

function materialise(
  ds: TypedDataSet,
  intervals: readonly Interval[],
  resultColumns: readonly ResultColumn[],
  key: GroupingKey,
): TypedDataSet {
  // Validate aggregation column types before materialising
  for (const col of resultColumns) {
    if (col.kind === "aggregate") {
      validateAggregationColumnType(ds, col as ResultColumn & { kind: "aggregate" });
    }
  }

  const outputColumns = buildOutputColumns(ds, resultColumns);
  const rows = [];

  for (const interval of intervals) {
    const cells: CellValue[] = [];

    for (const rc of resultColumns) {
      switch (rc.kind) {
        case "key":
          cells.push({ type: ColumnType.LABEL, value: interval.name });
          break;
        case "aggregate": {
          const values = collectColumnValues(ds, rc.sourceId, interval.rowIndices);
          cells.push(computeAggregation(rc.fn, values));
          break;
        }
        case "select": {
          if (interval.rowIndices.length === 0) {
            cells.push({ type: "NULL" as const });
          } else {
            // First row by original row order
            const minRowIdx = Math.min(...interval.rowIndices);
            cells.push(ds.rows[minRowIdx]!.cell(rc.sourceId));
          }
          break;
        }
      }
    }

    rows.push(createTypedRow(cells, outputColumns));
  }

  return { columns: outputColumns, rows };
}

function sortBuckets(intervals: readonly Interval[], ascending: boolean): Interval[] {
  const sorted = [...intervals];
  if (!ascending) {
    sorted.reverse();
  }
  return sorted;
}

function findColumnInDataset(ds: TypedDataSet, columnId: ColumnId): Column {
  const col = ds.columns.find((c) => c.id === columnId)
    ?? ds.columns.find((c) => (c.id as string).toLowerCase() === (columnId as string).toLowerCase());
  if (col === undefined) {
    throw new DataSetError("UNKNOWN_COLUMN", `Column "${columnId}" not found`);
  }
  return col;
}

// ────────────────────────────────────────────────────────────────────────────
// applyGroupSequence — consecutive GroupOps with deferred materialisation
// ────────────────────────────────────────────────────────────────────────────

export function applyGroupSequence(ds: TypedDataSet, ops: readonly GroupOp[]): TypedDataSet {
  if (ops.length === 0) {
    return ds;
  }

  if (ops.length === 1) {
    return applyGroup(ds, ops[0]!);
  }

  // Validate: subsequent GroupOps must have selectedIntervals or join: true
  for (let i = 1; i < ops.length; i++) {
    const op = ops[i]!;
    const hasSelectedIntervals = op.selectedIntervals !== undefined && op.selectedIntervals.length > 0;
    const hasJoin = op.join === true;
    if (!hasSelectedIntervals && !hasJoin) {
      throw new DataSetError(
        "INVALID_OPERATION",
        "Multiple group operations require either selectedIntervals (drill-down) or join: true (nested grouping) on subsequent groups",
      );
    }
  }

  // Process GroupOps sequentially, tracking partitions
  // A partition is a set of row indices from the original dataset
  type Partition = { parentLabel?: string; rowIndices: number[] };
  let partitions: Partition[] = [{ rowIndices: allRowIndices(ds) }];

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const isFinal = i === ops.length - 1;

    if (op.groupingKey === null) {
      // Whole-dataset aggregation on current partitions — only meaningful as final
      if (isFinal) {
        return applyGroup(ds, op);
      }
      continue;
    }

    const hasSelectedIntervals = op.selectedIntervals !== undefined && op.selectedIntervals.length > 0;

    if (hasSelectedIntervals) {
      // Drill-down: narrow partitions to selected intervals
      const newPartitions: Partition[] = [];
      for (const partition of partitions) {
        const subDs = narrowDataSet(ds, partition.rowIndices);
        const resolvedKey = resolveStrategy(ds, op.groupingKey);
        const intervals = computeBuckets(subDs, resolvedKey);
        const selected = filterToSelectedIntervals(intervals, op.selectedIntervals!);
        // Map sub-dataset row indices back to original dataset row indices
        const selectedOriginalIndices: number[] = [];
        for (const iv of selected) {
          for (const subIdx of iv.rowIndices) {
            selectedOriginalIndices.push(partition.rowIndices[subIdx]!);
          }
        }
        selectedOriginalIndices.sort((a, b) => a - b);
        newPartitions.push({ ...partition, rowIndices: selectedOriginalIndices });
      }
      partitions = newPartitions;
    } else if (op.join === true) {
      // Nested grouping: for each parent partition, compute child buckets
      const newPartitions: Partition[] = [];
      for (const partition of partitions) {
        const subDs = narrowDataSet(ds, partition.rowIndices);
        const resolvedKey = resolveStrategy(ds, op.groupingKey);
        validateStrategyColumnTypeCompat(ds, resolvedKey);

        let intervals = computeBuckets(subDs, resolvedKey);

        if (!resolvedKey.emptyIntervals) {
          intervals = intervals.filter((iv) => iv.rowIndices.length > 0);
        }

        intervals = sortBuckets(intervals, resolvedKey.ascendingOrder);

        for (const iv of intervals) {
          // Map sub-dataset row indices back to original dataset row indices
          const originalIndices = iv.rowIndices.map((subIdx) => partition.rowIndices[subIdx]!);
          const child: Partition = { rowIndices: originalIndices };
          if (partition.parentLabel !== undefined) child.parentLabel = partition.parentLabel;
          newPartitions.push(child);
        }
      }
      partitions = newPartitions;
    } else if (i === 0) {
      // First GroupOp: standard grouping to establish partitions
      const resolvedKey = resolveStrategy(ds, op.groupingKey);
      validateStrategyColumnTypeCompat(ds, resolvedKey);

      let intervals = computeBuckets(ds, resolvedKey);

      if (!resolvedKey.emptyIntervals) {
        intervals = intervals.filter((iv) => iv.rowIndices.length > 0);
      }

      intervals = sortBuckets(intervals, resolvedKey.ascendingOrder);

      partitions = intervals.map((iv) => ({
        parentLabel: iv.name,
        rowIndices: [...iv.rowIndices],
      }));
    }
  }

  // Materialise using the final GroupOp's columns
  const finalOp = ops[ops.length - 1]!;
  const resultColumns = finalOp.columns;

  // Validate aggregation column types
  for (const col of resultColumns) {
    if (col.kind === "aggregate") {
      validateAggregationColumnType(ds, col as ResultColumn & { kind: "aggregate" });
    }
  }

  const outputColumns = buildOutputColumns(ds, resultColumns);
  const rows = [];

  for (const partition of partitions) {
    const cells: CellValue[] = [];

    for (const rc of resultColumns) {
      switch (rc.kind) {
        case "key":
          // For key columns, we need to compute the bucket name from the partition's rows
          // If we have a grouping key on the final op, use it
          if (finalOp.groupingKey !== null) {
            // Compute the bucket for this partition using the final groupingKey
            const subDs = narrowDataSet(ds, partition.rowIndices);
            const resolvedKey = resolveStrategy(ds, finalOp.groupingKey);
            const intervals = computeBuckets(subDs, resolvedKey);
            // The partition should map to a single bucket value
            if (intervals.length > 0) {
              cells.push({ type: ColumnType.LABEL, value: intervals[0]!.name });
            } else {
              cells.push({ type: "NULL" as const });
            }
          } else {
            cells.push({ type: "NULL" as const });
          }
          break;
        case "aggregate": {
          const values = collectColumnValues(ds, rc.sourceId, partition.rowIndices);
          cells.push(computeAggregation(rc.fn, values));
          break;
        }
        case "select": {
          if (partition.rowIndices.length === 0) {
            cells.push({ type: "NULL" as const });
          } else {
            const minRowIdx = Math.min(...partition.rowIndices);
            cells.push(ds.rows[minRowIdx]!.cell(rc.sourceId));
          }
          break;
        }
      }
    }

    rows.push(createTypedRow(cells, outputColumns));
  }

  return { columns: outputColumns, rows };
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
