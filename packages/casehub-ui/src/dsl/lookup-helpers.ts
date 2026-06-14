import type { DataSetId, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import { createLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { DataSetOp } from "@casehub/data/dist/dataset/ops.js";
import type { FilterOp, FilterExpression, CoreFunctionType } from "@casehub/data/dist/dataset/filter.js";
import type {
  GroupOp,
  ResultColumn,
  GroupingKey,
  GroupStrategy,
  Aggregation,
  FixedCalendarUnit,
} from "@casehub/data/dist/dataset/group.js";
import type { SortOp, SortColumn, SortOrder } from "@casehub/data/dist/dataset/sort.js";

// Main lookup builder
export function lookup(dataSetId: string, ...ops: DataSetOp[]): DataSetLookup {
  return createLookup(dataSetId as DataSetId, ops);
}

// Group builders
export function groupBy(source: string | null, ...resultColumns: ResultColumn[]): GroupOp {
  if (source === null) {
    return Object.freeze({
      type: "group" as const,
      groupingKey: null,
      columns: Object.freeze(processResultColumns(null, resultColumns)),
    });
  }

  const groupingKey: GroupingKey = Object.freeze({
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    strategy: Object.freeze({ mode: "distinct" as const }),
    maxIntervals: 15,
    emptyIntervals: false,
    ascendingOrder: true,
  });

  return Object.freeze({
    type: "group" as const,
    groupingKey,
    columns: Object.freeze(processResultColumns(source, resultColumns)),
  });
}

export function groupByCalendar(
  source: string,
  unit: FixedCalendarUnit,
  ...resultColumns: ResultColumn[]
): GroupOp {
  const groupingKey: GroupingKey = Object.freeze({
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    strategy: Object.freeze({ mode: "fixedCalendar" as const, unit }),
    maxIntervals: 15,
    emptyIntervals: false,
    ascendingOrder: true,
  });

  return Object.freeze({
    type: "group" as const,
    groupingKey,
    columns: Object.freeze(processResultColumns(source, resultColumns)),
  });
}

// Process result columns to infer kind for col() helper
function processResultColumns(
  groupSource: string | null,
  columns: readonly ResultColumn[],
): readonly ResultColumn[] {
  return columns.map((col) => {
    // If this is a select column and its source matches the group key, make it a key column
    if (col.kind === "select" && groupSource !== null && col.sourceId === (groupSource as ColumnId)) {
      return Object.freeze({
        ...col,
        kind: "key" as const,
      });
    }
    return col;
  });
}

// Filter builders
export function filterBy(
  column: string,
  fn: CoreFunctionType,
  ...args: readonly (string | number | Date)[]
): FilterOp {
  const serializedArgs = args.map((arg) => {
    if (arg instanceof Date) {
      return arg.toISOString();
    }
    return String(arg);
  });

  const expression: FilterExpression = Object.freeze({
    type: "unresolved" as const,
    columnId: column as ColumnId,
    fn,
    args: Object.freeze(serializedArgs),
  });

  return Object.freeze({
    type: "filter" as const,
    expressions: Object.freeze([expression]),
  });
}

export function and(...filters: FilterOp[]): FilterOp {
  const allExpressions = filters.flatMap((f) => f.expressions);
  const combinedExpression: FilterExpression = Object.freeze({
    type: "and" as const,
    children: Object.freeze(allExpressions),
  });

  return Object.freeze({
    type: "filter" as const,
    expressions: Object.freeze([combinedExpression]),
  });
}

export function or(...filters: FilterOp[]): FilterOp {
  const allExpressions = filters.flatMap((f) => f.expressions);
  const combinedExpression: FilterExpression = Object.freeze({
    type: "or" as const,
    children: Object.freeze(allExpressions),
  });

  return Object.freeze({
    type: "filter" as const,
    expressions: Object.freeze([combinedExpression]),
  });
}

export function not(filter: FilterOp): FilterOp {
  const expression: FilterExpression = Object.freeze({
    type: "not" as const,
    child: filter.expressions[0]!,
  });

  return Object.freeze({
    type: "filter" as const,
    expressions: Object.freeze([expression]),
  });
}

// Sort builder
export function sortBy(column: string, order: SortOrder = "ASCENDING"): SortOp {
  const sortColumn: SortColumn = Object.freeze({
    columnId: column as ColumnId,
    order,
  });

  return Object.freeze({
    type: "sort" as const,
    columns: Object.freeze([sortColumn]),
  });
}

// Result column helpers
export function col(source: string): ResultColumn {
  return Object.freeze({
    kind: "select" as const, // Default to select; groupBy() will change to "key" if needed
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
  });
}

export function sum(source: string): ResultColumn {
  const fn: Aggregation = Object.freeze({ fn: "SUM" as const });
  return Object.freeze({
    kind: "aggregate" as const,
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    fn,
  });
}

export function avg(source: string): ResultColumn {
  const fn: Aggregation = Object.freeze({ fn: "AVERAGE" as const });
  return Object.freeze({
    kind: "aggregate" as const,
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    fn,
  });
}

export function count(source: string): ResultColumn {
  const fn: Aggregation = Object.freeze({ fn: "COUNT" as const });
  return Object.freeze({
    kind: "aggregate" as const,
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    fn,
  });
}

export function min(source: string): ResultColumn {
  const fn: Aggregation = Object.freeze({ fn: "MIN" as const });
  return Object.freeze({
    kind: "aggregate" as const,
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    fn,
  });
}

export function max(source: string): ResultColumn {
  const fn: Aggregation = Object.freeze({ fn: "MAX" as const });
  return Object.freeze({
    kind: "aggregate" as const,
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    fn,
  });
}

export function distinct(source: string): ResultColumn {
  const fn: Aggregation = Object.freeze({ fn: "DISTINCT" as const });
  return Object.freeze({
    kind: "aggregate" as const,
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    fn,
  });
}

export function join(source: string, separator: string = ","): ResultColumn {
  const fn: Aggregation = Object.freeze({ fn: "JOIN" as const, separator });
  return Object.freeze({
    kind: "aggregate" as const,
    sourceId: source as ColumnId,
    columnId: source as ColumnId,
    fn,
  });
}
