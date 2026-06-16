import { z } from "zod";
import type { ColumnId, DataSetId } from "./types.js";
import type { FilterExpression, FilterOp, CoreFunctionType } from "./filter.js";
import type { GroupOp, GroupingKey, GroupStrategy, ResultColumn, Aggregation } from "./group.js";
import type { FixedCalendarUnit } from "./group.js";
import type { DateIntervalType, Month, DayOfWeek } from "./date-interval.js";
import type { SortOp, SortColumn } from "./sort.js";
import type { DataSetLookup } from "./lookup.js";
import { createLookup } from "./lookup.js";

// Core function type enum schema
const coreFunctionTypeSchema = z.enum([
  "IS_NULL", "NOT_NULL",
  "EQUALS_TO", "NOT_EQUALS_TO",
  "LIKE_TO",
  "GREATER_THAN", "GREATER_OR_EQUALS_TO",
  "LOWER_THAN", "LOWER_OR_EQUALS_TO",
  "BETWEEN",
  "TIME_FRAME",
  "IN", "NOT_IN",
]);

// Filter leaf schema (unresolved)
const filterLeafSchema = z.object({
  column: z.string(),
  function: coreFunctionTypeSchema,
  args: z.array(z.union([z.string(), z.number()])).default([]),
});

// Recursive filter node schema
type FilterNodeInput = z.output<typeof filterLeafSchema>
  | { and: FilterNodeInput[] }
  | { or: FilterNodeInput[] }
  | { not: FilterNodeInput };

const filterNodeSchema = z.lazy(() =>
  z.union([
    filterLeafSchema,
    z.object({ and: z.array(filterNodeSchema) }),
    z.object({ or: z.array(filterNodeSchema) }),
    z.object({ not: filterNodeSchema }),
  ])
) as z.ZodType<FilterNodeInput>;

// Aggregation function schema
const aggregationFnSchema = z.enum([
  "COUNT", "DISTINCT", "SUM", "AVERAGE", "MEDIAN", "MIN", "MAX", "JOIN",
]);

// Group strategy schemas
const groupStrategySchema = z.string().default("distinct");

const dateIntervalTypeSchema = z.enum([
  "MILLISECOND", "HUNDRETH", "TENTH",
  "SECOND", "MINUTE", "HOUR",
  "DAY", "DAY_OF_WEEK", "WEEK",
  "MONTH", "QUARTER", "YEAR",
  "DECADE", "CENTURY", "MILLENIUM",
]);

const fixedCalendarUnitSchema = z.enum([
  "QUARTER", "MONTH", "DAY_OF_WEEK",
  "HOUR", "MINUTE", "SECOND",
]);

const monthSchema = z.enum([
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]);

const dayOfWeekSchema = z.enum([
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
]);

const columnGroupSchema = z.object({
  source: z.string(),
  id: z.string().optional(),
  strategy: groupStrategySchema.optional(),
  groupStrategy: z.string().optional(),
  unit: fixedCalendarUnitSchema.optional(),
  preferredUnit: dateIntervalTypeSchema.optional(),
  maxIntervals: z.number().default(15),
  emptyIntervals: z.boolean().default(false),
  ascendingOrder: z.boolean().default(true),
  firstMonthOfYear: monthSchema.optional(),
  firstDayOfWeek: dayOfWeekSchema.optional(),
}).transform((cg) => ({
  ...cg,
  strategy: cg.strategy ?? cg.groupStrategy?.toLowerCase() ?? "distinct",
}));

const columnSchemaRaw = z.object({
  source: z.string(),
  id: z.string().optional(),
  column: z.string().optional(),
  function: z.string().optional(),
  separator: z.string().optional(),
});

const columnSchema = columnSchemaRaw.transform((col) => ({
  source: col.source,
  id: col.id ?? col.column,
  function: col.function ? col.function.toUpperCase() as z.infer<typeof aggregationFnSchema> : undefined,
  separator: col.separator,
}));

const groupEntrySchemaRaw = z.object({
  columnGroup: columnGroupSchema.optional(),
  columns: z.array(columnSchema).optional(),
  functions: z.array(columnSchema).optional(),
  selectedIntervals: z.array(z.string()).optional(),
  join: z.boolean().optional(),
});

const groupEntrySchema = groupEntrySchemaRaw.transform((entry) => ({
  ...entry,
  columns: entry.columns ?? entry.functions ?? [],
}));

const sortOrderSchema = z.enum(["ASCENDING", "DESCENDING"]).default("ASCENDING");

const sortColumnSchema = z.object({
  column: z.string(),
  order: sortOrderSchema.optional(),
  sortOrder: sortOrderSchema.optional(),
}).transform((col) => ({
  column: col.column,
  order: col.order ?? col.sortOrder ?? ("ASCENDING" as const),
}));

const lookupSchema = z.object({
  uuid: z.string().optional(),
  dataSetUuid: z.string().optional(),
  filter: z.array(filterNodeSchema).optional(),
  group: z.array(groupEntrySchema).optional(),
  groupOps: z.array(groupEntrySchema).optional(),
  sort: z.array(sortColumnSchema).optional(),
  sortOps: z.array(sortColumnSchema).optional(),
}).transform((parsed) => ({
  uuid: parsed.uuid ?? parsed.dataSetUuid ?? "",
  filter: parsed.filter,
  group: parsed.group ?? parsed.groupOps,
  sort: parsed.sort ?? parsed.sortOps,
}));

export function parseLookup(raw: unknown): DataSetLookup {
  const parsed = lookupSchema.parse(raw);
  const dataSetId = parsed.uuid as DataSetId;
  const operations: (FilterOp | GroupOp | SortOp)[] = [];

  // Parse filter (implicit AND)
  if (parsed.filter && parsed.filter.length > 0) {
    const expressions = parseFilterExpressions(parsed.filter);
    operations.push({
      type: "filter",
      expressions,
    });
  }

  // Parse group operations
  if (parsed.group) {
    for (const groupEntry of parsed.group) {
      operations.push(parseGroupEntry(groupEntry));
    }
  }

  // Parse sort operation
  if (parsed.sort && parsed.sort.length > 0) {
    const columns: SortColumn[] = parsed.sort.map(col => ({
      columnId: col.column as ColumnId,
      order: col.order,
    }));
    operations.push({
      type: "sort",
      columns,
    });
  }

  // Use createLookup to validate op ordering
  return createLookup(dataSetId, operations);
}

function parseFilterExpressions(nodes: z.infer<typeof filterNodeSchema>[]): FilterExpression[] {
  return nodes.map(parseFilterNode);
}

function parseFilterNode(node: z.infer<typeof filterNodeSchema>): FilterExpression {
  // Check for combinators
  if ("and" in node) {
    return {
      type: "and",
      children: node.and.map(parseFilterNode),
    };
  }
  if ("or" in node) {
    return {
      type: "or",
      children: node.or.map(parseFilterNode),
    };
  }
  if ("not" in node) {
    return {
      type: "not",
      child: parseFilterNode(node.not),
    };
  }

  // Must be a leaf
  if ("column" in node && "function" in node) {
    return {
      type: "unresolved",
      columnId: node.column as ColumnId,
      fn: node.function as CoreFunctionType,
      args: node.args.map(String),
    };
  }

  throw new Error("Invalid filter node structure");
}

function parseGroupEntry(entry: z.infer<typeof groupEntrySchema>): GroupOp {
  let groupingKey: GroupingKey | null = null;

  if (entry.columnGroup) {
    const cg = entry.columnGroup;
    const strategy = parseGroupStrategy(cg.strategy, cg.unit, cg.preferredUnit);

    groupingKey = {
      sourceId: cg.source as ColumnId,
      columnId: (cg.id ?? cg.source) as ColumnId,
      strategy,
      maxIntervals: cg.maxIntervals,
      emptyIntervals: cg.emptyIntervals,
      ascendingOrder: cg.ascendingOrder,
      ...(cg.firstMonthOfYear && { firstMonthOfYear: monthNameToNumber(cg.firstMonthOfYear) }),
      ...(cg.firstDayOfWeek && { firstDayOfWeek: dayOfWeekNameToNumber(cg.firstDayOfWeek) }),
    };
  }

  const columns: ResultColumn[] = entry.columns.map(col => {
    const sourceId = col.source as ColumnId;
    const columnId = (col.id ?? col.source) as ColumnId;

    // Key column: source matches columnGroup.source
    if (entry.columnGroup && col.source === entry.columnGroup.source) {
      return { kind: "key", sourceId, columnId };
    }

    // Aggregate column: has function
    if (col.function) {
      const fn = parseAggregation(col.function, col.separator);
      return { kind: "aggregate", sourceId, columnId, fn };
    }

    // Select column: no function
    return { kind: "select", sourceId, columnId };
  });

  return {
    type: "group",
    groupingKey,
    columns,
    ...(entry.selectedIntervals && { selectedIntervals: entry.selectedIntervals }),
    ...(entry.join !== undefined && { join: entry.join }),
  };
}

function parseGroupStrategy(
  strategy: string,
  unit?: z.infer<typeof fixedCalendarUnitSchema>,
  preferredUnit?: z.infer<typeof dateIntervalTypeSchema>,
): GroupStrategy {
  switch (strategy) {
    case "distinct":
      return { mode: "distinct" };
    case "fixedCalendar":
      if (!unit) throw new Error("fixedCalendar strategy requires 'unit' field");
      return { mode: "fixedCalendar", unit };
    case "dynamicRange":
      return { mode: "dynamicRange", ...(preferredUnit && { preferredUnit }) };
    case "dynamic":
      return { mode: "dynamic", ...(preferredUnit && { preferredUnit }) };
    default:
      return { mode: "distinct" };
  }
}

function parseAggregation(
  fn: z.infer<typeof aggregationFnSchema>,
  separator?: string,
): Aggregation {
  switch (fn) {
    case "COUNT":
      return { fn: "COUNT" };
    case "DISTINCT":
      return { fn: "DISTINCT" };
    case "SUM":
      return { fn: "SUM" };
    case "AVERAGE":
      return { fn: "AVERAGE" };
    case "MEDIAN":
      return { fn: "MEDIAN" };
    case "MIN":
      return { fn: "MIN" };
    case "MAX":
      return { fn: "MAX" };
    case "JOIN":
      return { fn: "JOIN", separator: separator ?? ", " };
  }
}

function monthNameToNumber(name: string): Month {
  const map: Record<string, Month> = {
    JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4,
    MAY: 5, JUNE: 6, JULY: 7, AUGUST: 8,
    SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
  };
  return map[name]!;
}

function dayOfWeekNameToNumber(name: string): DayOfWeek {
  const map: Record<string, DayOfWeek> = {
    MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
    FRIDAY: 5, SATURDAY: 6, SUNDAY: 7,
  };
  return map[name]!;
}
