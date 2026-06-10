# 01 -- Core Engine

**Scope:** The data model, query abstraction, operation engine, interval builders, expression evaluation, YAML parsing, and lookup constraints. This is the heart of Melviz -- the machinery that turns raw data into the grouped, filtered, sorted datasets that displayers render.

**Java source being replaced:** The `melviz-dataset` module (131 files, ~14,200 LOC) plus `ClientIntervalBuilderDynamicDate` from `melviz-dataset-client`. Not all 131 files produce TypeScript equivalents -- marshalling boilerplate, Errai annotations, GWT interop, and the indexing/caching infrastructure are eliminated. What remains is the semantic core: data model, query model, operations, interval builders, and constraints.

**Package location:** `packages/core/src/dataset/`

---

## 1. DataSet Model

### The duality: DataSet vs TypedDataSet

Two representations exist for different purposes. This is a deliberate design choice, not an accident.

**DataSet** is the wire format. It carries `string[][]` and exists at exactly two boundaries:

1. YAML parsing -- the raw parsed structure before type coercion.
2. iframe serialization -- the `postMessage` payload sent to/from React components.

**TypedDataSet** is the internal format. All engine operations -- filter, group, sort, aggregate -- operate on `TypedDataSet`. Values are parsed once at the boundary and never re-parsed.

```typescript
// packages/core/src/dataset/types.ts

// --- Branded types ---
// These are compile-time incompatible despite being strings at runtime.
// Passing a DataSetId where a ColumnId is expected is a type error.

export type ColumnId = string & { readonly __brand: "ColumnId" };
export type DataSetId = string & { readonly __brand: "DataSetId" };

// --- Column types ---
// Direct port of org.melviz.dataset.ColumnType.
// LABEL and TEXT are both strings but differ in grouping eligibility:
// LABEL columns can be grouped on; TEXT columns cannot.

export enum ColumnType {
  DATE = "DATE",
  NUMBER = "NUMBER",
  LABEL = "LABEL",
  TEXT = "TEXT",
}

// --- Column definition ---

export interface Column {
  readonly id: ColumnId;
  readonly name: string;
  readonly type: ColumnType;
  readonly settings?: ColumnSettings;
}

export interface ColumnSettings {
  readonly columnId: ColumnId;
  readonly columnName: string;
  readonly valueExpression?: string;   // JSONata expression for value transforms
  readonly emptyTemplate?: string;     // display template when value is null
  readonly valuePattern?: string;      // format pattern (date/number)
}

// --- Cell values (discriminated union) ---
// The tag field is `type`, matching the column's ColumnType.
// This replaces the Java pattern of storing everything as Object
// and casting at every read site.

export type CellValue =
  | { readonly type: ColumnType.TEXT; readonly value: string }
  | { readonly type: ColumnType.NUMBER; readonly value: number }
  | { readonly type: ColumnType.DATE; readonly value: Date }
  | { readonly type: ColumnType.LABEL; readonly value: string };

// --- TypedDataSet (internal, used everywhere) ---

export interface TypedDataSet {
  readonly columns: readonly Column[];
  readonly rows: readonly TypedRow[];
}

export interface TypedRow {
  readonly cells: readonly CellValue[];
  cell(columnId: ColumnId): CellValue;
  number(columnId: ColumnId): number;
  text(columnId: ColumnId): string;
  date(columnId: ColumnId): Date;
}

// --- DataSet (wire format, used only at boundaries) ---

export interface DataSet {
  readonly columns: readonly Column[];
  readonly data: readonly (readonly string[])[];
}
```

### Boundary conversion

Conversion happens in exactly two places, and both are explicit function calls -- never implicit coercion:

```typescript
// packages/core/src/dataset/conversion.ts

/**
 * Parses a wire-format DataSet into a TypedDataSet.
 * Called once after YAML parsing and once after receiving postMessage from an iframe.
 * All date strings are parsed as UTC. Number strings use parseFloat (no locale).
 */
export function toTypedDataSet(ds: DataSet): TypedDataSet { ... }

/**
 * Serializes a TypedDataSet to wire format for postMessage to iframes.
 * Dates are serialized as ISO 8601 UTC strings. Numbers as unformatted strings.
 */
export function toWireDataSet(ds: TypedDataSet): DataSet { ... }
```

---

## 2. DataSetLookup -- The Query Abstraction

This is the most consequential type in the engine. A `DataSetLookup` says: "take dataset X, apply these operations in sequence, return rows N through M." It is the query language for Melviz datasets.

### Java source

`org.melviz.dataset.DataSetLookup` -- 324 LOC. Fields: `dataSetUUID`, `operationList` (ordered `List<DataSetOp>`), `rowOffset`, `numberOfRows` (-1 = all), `testMode`, `metadata`.

### TypeScript equivalent

```typescript
// packages/core/src/dataset/lookup.ts

export interface DataSetLookup {
  readonly dataSetId: DataSetId;
  readonly operations: readonly DataSetOp[];
  readonly rowOffset: number;
  readonly rowCount: number;  // -1 = all rows
  readonly metadata: Readonly<Record<string, unknown>>;
}
```

### DataSetLookup vs DataSetRef

These are separate concepts that must not be conflated:

- **DataSetRef** = "here is a dataset; it lives at this URL or is embedded inline." It answers _where does the data come from?_
- **DataSetLookup** = "take dataset X, group by column A, aggregate column B with SUM, sort by B descending, return rows 0-10." It answers _what transformation do I want?_

A displayer's configuration includes both: a `DataSetRef` (or inline `DataSetDef`) to locate the data, and a `DataSetLookup` to describe the query. The lookup references the dataset by its `DataSetId`.

### YAML format for lookup

In YAML dashboard definitions, the lookup appears inside a displayer's configuration:

```yaml
displayer:
  type: BARCHART
  lookup:
    uuid: my-dataset
    group:
      - columnGroup:
          source: region
        functions:
          - source: region
          - source: revenue
            function: SUM
    sort:
      - column: revenue
        order: DESCENDING
    filter:
      - column: status
        function: EQUALS_TO
        args:
          - "active"
```

The YAML parser constructs a `DataSetLookup` from this structure. The `group`, `sort`, and `filter` keys become entries in the `operations` array, always in the canonical order: filters first, then groups, then sort (enforced by the engine -- see section 3.5).

### Operation types

The `DataSetOp` discriminated union:

```typescript
export type DataSetOp =
  | FilterOp
  | GroupOp
  | SortOp;

// Note: there is no separate AggregateOp.
// Aggregation is part of GroupOp via GroupFunction.
// This matches the Java model where DataSetGroup carries both
// the ColumnGroup (how to split) and GroupFunctions (what to compute per interval).
```

The Java `DataSetOpType` enum has three values: `FILTER`, `GROUP`, `SORT`. The TypeScript discriminated union mirrors this exactly. There is no fourth type -- aggregation is expressed through `GroupFunction` within a `GroupOp`.

---

## 3. DataSet Operations -- Complete Enumeration

### 3.1 Filter Operations

The Java `CoreFunctionType` enum has 13 values. Each has a parameter count and column-type compatibility rules. The TypeScript port must preserve all 13 values exactly -- dashboard YAML files in the wild use them.

#### CoreFunctionType mapping

```typescript
// packages/core/src/dataset/filter.ts

// --- Universal filters (valid for all column types) ---

type UniversalFilter =
  | { fn: "IS_NULL" }
  | { fn: "NOT_NULL" }
  | { fn: "EQUALS_TO"; value: string | number | Date }
  | { fn: "NOT_EQUALS_TO"; value: string | number | Date };

// --- Numeric filters (ColumnType.NUMBER only) ---

type NumericFilter =
  | UniversalFilter
  | { fn: "GREATER_THAN"; value: number }
  | { fn: "GREATER_OR_EQUALS_TO"; value: number }
  | { fn: "LOWER_THAN"; value: number }
  | { fn: "LOWER_OR_EQUALS_TO"; value: number }
  | { fn: "BETWEEN"; low: number; high: number }
  | { fn: "IN"; values: readonly number[] }
  | { fn: "NOT_IN"; values: readonly number[] };

// --- Text/Label filters (ColumnType.TEXT and ColumnType.LABEL) ---

type TextFilter =
  | UniversalFilter
  | { fn: "LIKE_TO"; pattern: string; caseSensitive: boolean }
  | { fn: "IN"; values: readonly string[] }
  | { fn: "NOT_IN"; values: readonly string[] };

// --- Date filters (ColumnType.DATE only) ---

type DateFilter =
  | UniversalFilter
  | { fn: "GREATER_THAN"; value: Date }
  | { fn: "GREATER_OR_EQUALS_TO"; value: Date }
  | { fn: "LOWER_THAN"; value: Date }
  | { fn: "LOWER_OR_EQUALS_TO"; value: Date }
  | { fn: "BETWEEN"; start: Date; end: Date }
  | { fn: "TIME_FRAME"; timeFrame: TimeFrame };
```

#### Column-type compatibility (from Java `CoreFunctionType.supportsType()`)

| Function | DATE | NUMBER | LABEL | TEXT |
|----------|------|--------|-------|------|
| IS_NULL | yes | yes | yes | yes |
| NOT_NULL | yes | yes | yes | yes |
| EQUALS_TO | yes | yes | yes | yes |
| NOT_EQUALS_TO | yes | yes | yes | yes |
| LIKE_TO | no | no | yes | yes |
| GREATER_THAN | yes | yes | yes | yes |
| GREATER_OR_EQUALS_TO | yes | yes | yes | yes |
| LOWER_THAN | yes | yes | yes | yes |
| LOWER_OR_EQUALS_TO | yes | yes | yes | yes |
| BETWEEN | yes | yes | yes | yes |
| TIME_FRAME | yes | no | no | no |
| IN | no | yes | yes | yes |
| NOT_IN | no | yes | yes | yes |

#### LIKE_TO wildcard syntax

The `LIKE_TO` function emulates SQL `LIKE`. Four wildcard patterns:

- `_` -- matches exactly one character
- `%` -- matches zero or more characters
- `[charlist]` -- matches any single character in the set
- `[^charlist]` -- matches any single character NOT in the set

The second parameter is a boolean controlling case sensitivity. Implementation must convert these patterns to a regular expression at match time.

#### TIME_FRAME

`TimeFrame` is a relative date range expression. Format: `"<from> till <to>"` where each endpoint is a `TimeInstant` that can reference `now`, `begin[unit]`, or `end[unit]` with optional offsets.

Examples:
- `"now till 10second"` -- next 10 seconds
- `"begin[year] till now"` -- start of this year to now
- `"begin[year March] -1year till now"` -- beginning of last fiscal year to now

```typescript
export interface TimeFrame {
  readonly from: TimeInstant;
  readonly to: TimeInstant;
}

export interface TimeInstant {
  readonly mode: "now" | "begin" | "end" | "relative";
  readonly unit?: DateIntervalType;
  readonly offset?: { readonly amount: number; readonly unit: DateIntervalType };
  readonly firstMonthOfYear?: Month;
}
```

The `TimeFrame` parser must be ported from `org.melviz.dataset.date.TimeFrame` (107 LOC) and `TimeInstant`. This is a self-contained parsing problem with no browser API dependencies.

#### Logical composition (recursive FilterExpression)

The Java model uses `LogicalExprFilter` extending `ColumnFilter`, with `LogicalExprType` (AND, OR, NOT) and a recursive `logicalTerms` list. The TypeScript equivalent uses a discriminated union:

```typescript
export type FilterExpression =
  | { type: "column"; columnId: ColumnId; filter: ColumnFilter }
  | { type: "and"; children: readonly FilterExpression[] }
  | { type: "or"; children: readonly FilterExpression[] }
  | { type: "not"; child: FilterExpression };

// ColumnFilter is the type-specific filter:
export type ColumnFilter =
  | NumericFilter
  | TextFilter
  | DateFilter;

// FilterOp wraps a list of FilterExpressions (the top-level operation):
export interface FilterOp {
  readonly type: "filter";
  readonly expressions: readonly FilterExpression[];
}
```

The Java `LogicalExprFilter` has a subtlety worth preserving: child filters inherit the `columnId` from their parent when their own `columnId` is null. In TypeScript, this inheritance happens at parse time -- by the time a `FilterExpression` tree is constructed, every leaf node has an explicit `columnId`.

### 3.2 Group Operations

Grouping is the most complex operation. It involves splitting a dataset into intervals (buckets), then computing aggregate functions over each interval.

#### ColumnGroup

Ported from `org.melviz.dataset.group.ColumnGroup` (191 LOC):

```typescript
export interface ColumnGroup {
  readonly sourceId: ColumnId;     // the column being grouped
  readonly columnId: ColumnId;     // the output column name (can differ from sourceId)
  readonly strategy: GroupStrategy;
  readonly maxIntervals: number;   // default 15
  readonly intervalSize?: string;  // DateIntervalType name for FIXED strategy
  readonly emptyIntervals: boolean;
  readonly ascendingOrder: boolean;
  readonly firstMonthOfYear: Month;   // default JANUARY
  readonly firstDayOfWeek: DayOfWeek; // default MONDAY
  readonly postEnabled: boolean;      // default true
}

export type GroupStrategy = "FIXED" | "DYNAMIC" | "CUSTOM";
```

`GroupStrategy` column-type compatibility (from Java `GroupStrategy.isColumnTypeSupported()`):
- **DYNAMIC**: all column types
- **FIXED**: DATE and NUMBER only
- **CUSTOM**: any (intervals defined externally)

#### GroupFunction

Ported from `org.melviz.dataset.group.GroupFunction` (97 LOC):

```typescript
export interface GroupFunction {
  readonly sourceId: ColumnId;             // source column to read values from
  readonly columnId: ColumnId;             // output column id in the result
  readonly function: AggregateFunctionType | null;  // null = select first value
}
```

When `function` is null, the engine picks the first value in each interval for that column. This is how the group column itself appears in results -- it has no aggregate function; it takes the interval name.

#### AggregateFunctionType

All 10 values from `org.melviz.dataset.group.AggregateFunctionType`:

```typescript
export type AggregateFunctionType =
  | "COUNT"
  | "DISTINCT"
  | "AVERAGE"
  | "SUM"
  | "MIN"
  | "MAX"
  | "MEDIAN"
  | "JOIN"
  | "JOIN_COMMA"
  | "JOIN_HYPHEN";
```

#### Column-type compatibility

AVERAGE, MEDIAN, SUM, MAX, MIN require `ColumnType.NUMBER`. The rest work on any column type.

#### Result type inference

From `AggregateFunctionType.getResultType()`:

```typescript
export function aggregateResultType(
  fn: AggregateFunctionType,
  sourceType: ColumnType
): ColumnType {
  // MIN and MAX preserve the source column type
  if (fn === "MIN" || fn === "MAX") return sourceType;

  // JOIN variants produce TEXT
  if (fn === "JOIN" || fn === "JOIN_COMMA" || fn === "JOIN_HYPHEN") {
    return ColumnType.TEXT;
  }

  // Everything else produces NUMBER
  // (COUNT, DISTINCT, AVERAGE, SUM, MEDIAN)
  return ColumnType.NUMBER;
}
```

#### GroupOp

```typescript
export interface GroupOp {
  readonly type: "group";
  readonly columnGroup: ColumnGroup | null;  // null = column selection / aggregation only
  readonly groupFunctions: readonly GroupFunction[];
  readonly selectedIntervals?: readonly Interval[];  // for drill-down interval selection
  readonly join?: boolean;  // nested group join
}
```

When `columnGroup` is null, the `GroupOp` performs pure column selection and/or whole-dataset aggregation without splitting into intervals. This is how you express "give me the SUM of column X across the entire dataset" without grouping.

#### Interval selection for drill-down

The `selectedIntervals` field enables interactive drill-down. When a user clicks a bar in a bar chart, the displayer creates a new `GroupOp` with `selectedIntervals` set to the clicked interval. The engine filters the dataset to only rows belonging to those intervals, then applies the next group/sort operations.

### 3.3 Date Interval Builders

Date grouping is where JSONata cannot help. JSONata has no concept of calendar-aligned buckets, fiscal quarters, or configurable first-day-of-week. The TypeScript engine must implement interval builders from scratch, porting the logic from `IntervalBuilderFixedDate` (108 LOC) and `ClientIntervalBuilderDynamicDate` (383 LOC).

#### DateIntervalType

All 15 values from `org.melviz.dataset.group.DateIntervalType`, with their durations in milliseconds:

```typescript
export type DateIntervalType =
  | "MILLISECOND"   //          1 ms
  | "HUNDRETH"      //         10 ms
  | "TENTH"         //        100 ms
  | "SECOND"        //      1,000 ms
  | "MINUTE"        //     60,000 ms
  | "HOUR"          //  3,600,000 ms
  | "DAY"           // 86,400,000 ms
  | "DAY_OF_WEEK"   // 86,400,000 ms (same duration as DAY)
  | "WEEK"          // 604,800,000 ms
  | "MONTH"         // 2,678,400,000 ms (31 days -- approximate)
  | "QUARTER"       // 8,035,200,000 ms (3 * 31 days -- approximate)
  | "YEAR"          // 32,140,800,000 ms (12 * 31 days -- approximate)
  | "DECADE"        // ~10 years
  | "CENTURY"       // ~100 years
  | "MILLENIUM";    // ~1000 years

export const DATE_INTERVAL_DURATION_MS: Record<DateIntervalType, number> = {
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
```

The durations use the same approximations as the Java code (months = 31 days). These are used for interval size comparison, not for actual date arithmetic. Actual interval boundaries use calendar-correct calculations.

#### Fixed intervals

Only six `DateIntervalType` values are supported as fixed intervals: QUARTER, MONTH, DAY_OF_WEEK, HOUR, MINUTE, SECOND. These produce a predetermined number of buckets (e.g., MONTH always produces 12 buckets, QUARTER always produces 4).

```typescript
export const FIXED_INTERVALS_SUPPORTED: readonly DateIntervalType[] = [
  "QUARTER", "MONTH", "DAY_OF_WEEK", "HOUR", "MINUTE", "SECOND",
] as const;
```

The fixed interval builder produces named, calendar-aligned buckets:

```typescript
export interface IntervalBuilder {
  build(dataSet: TypedDataSet, columnGroup: ColumnGroup): IntervalList;
}

export interface Interval {
  readonly name: string;        // human-readable label (e.g., "Q1", "January", "Monday")
  readonly type: string;        // DateIntervalType name
  readonly index: number;       // position in the interval list
  readonly rowIndices: readonly number[];  // rows belonging to this interval
}

export type IntervalList = readonly Interval[];
```

Each fixed interval type has its own bucket generator. For example, `MONTH` produces 12 intervals named by month, starting from `firstMonthOfYear`. `DAY_OF_WEEK` produces 7 intervals starting from `firstDayOfWeek`. `QUARTER` produces 4 intervals starting from the quarter containing `firstMonthOfYear`.

After generating the interval list, values from the source column are indexed into intervals by examining each date value and determining which bucket it falls into.

#### Dynamic date intervals

The dynamic interval builder (`ClientIntervalBuilderDynamicDate`) auto-selects an interval size based on the data range. Algorithm:

1. Sort the date column ascending.
2. Find `minDate` and `maxDate` (skipping nulls).
3. Calculate `span = maxDate - minDate` in milliseconds.
4. Iterate `DateIntervalType` values from smallest (MILLISECOND) to largest (MILLENIUM). For each, compute `numIntervals = span / durationMs`. The first type where `numIntervals < maxIntervals` (default 15) is selected.
5. If a `preferredSize` (from `columnGroup.intervalSize`) is specified and the computed type is smaller than the preferred size, use the preferred size instead.
6. Generate interval boundaries using calendar-correct date arithmetic (set month boundaries on the 1st, year boundaries on Jan 1, etc.).
7. Walk the sorted values and assign each to its interval.

```typescript
export function buildDynamicDateIntervals(
  dataSet: TypedDataSet,
  columnGroup: ColumnGroup
): IntervalList {
  // 1. Sort, find min/max
  // 2. Calculate interval type
  // 3. Generate boundaries with firstIntervalDate / nextIntervalDate
  // 4. Assign rows to intervals
  // 5. Reverse if !ascendingOrder
  ...
}
```

The `firstIntervalDate` function truncates a date to the beginning of its interval period. For YEAR, it zeroes month/day/hours/minutes/seconds. For MONTH, it zeroes day/hours/minutes/seconds. And so on down the hierarchy.

The `nextIntervalDate` function advances a date by one interval using calendar arithmetic (not millisecond addition). Adding a month to January 31 yields February 28/29, not March 3.

**CRITICAL CONSTRAINT:** All date operations use UTC-based arithmetic, not locale-dependent browser `Date` methods. The Java code uses `Date.setMonth()`, `Date.setDate()`, etc., which are locale-sensitive in GWT's browser Date emulation. The TypeScript port must NOT replicate this behavior. Instead:

- Store dates as millisecond-precision UTC timestamps internally.
- Calendar calculations (month lengths, quarter boundaries, day-of-week) use a fixed-offset model with no DST transitions.
- Interval naming uses explicit format patterns, not `toLocaleString()`.
- This is a testability constraint: tests must produce identical results regardless of the machine's timezone.

### 3.4 Sort Operations

Sort is the simplest operation. From `org.melviz.dataset.sort.DataSetSort`:

```typescript
export interface SortOp {
  readonly type: "sort";
  readonly columns: readonly ColumnSort[];
}

export interface ColumnSort {
  readonly columnId: ColumnId;
  readonly order: "ASCENDING" | "DESCENDING";
}
```

The sort implementation compares values according to their `ColumnType`:
- **NUMBER**: numeric comparison
- **DATE**: timestamp comparison
- **TEXT/LABEL**: string comparison (locale-independent -- use `<`/`>` on strings, not `localeCompare`)

Multi-column sort applies columns in order as tiebreakers.

### 3.5 DataSetOpEngine Replacement

The Java `SharedDataSetOpEngine` (719 LOC) enforces an operation ordering pattern: `F*G*S?` -- zero or more filters, then zero or more groups, then zero or one sort. This constraint is preserved.

The TypeScript replacement is a pure function with no mutable state, no indexing infrastructure, and no caching layer:

```typescript
// packages/core/src/dataset/engine.ts

/**
 * Apply a sequence of operations to a TypedDataSet.
 *
 * Operation order is enforced: filters first, then groups, then sort.
 * Throws if operations are out of order.
 *
 * Every operation is a pure function -- no mutation, no side effects,
 * no browser API dependencies.
 */
export function applyOps(
  ds: TypedDataSet,
  ops: readonly DataSetOp[]
): TypedDataSet {
  validateOpSequence(ops);  // throws on invalid F*G*S? pattern

  return ops.reduce<TypedDataSet>((dataset, op) => {
    switch (op.type) {
      case "filter": return applyFilter(dataset, op);
      case "group":  return applyGroup(dataset, op);
      case "sort":   return applySort(dataset, op);
    }
  }, ds);
}
```

Behind each arm of the switch:

- **`applyFilter`**: Implements all 13 `CoreFunctionType` values with column-type dispatch. Evaluates `FilterExpression` trees recursively -- AND requires all children to match, OR requires any, NOT inverts. Returns a new `TypedDataSet` containing only matching rows.

- **`applyGroup`**: Implements FIXED, DYNAMIC, and CUSTOM grouping strategies. For date columns, delegates to the interval builders (section 3.3). For label columns, uses `IntervalBuilderDynamicLabel` (groups by distinct values). For number columns with FIXED strategy, creates equal-width numeric bins. Computes all `GroupFunction` aggregate values per interval. Returns a new `TypedDataSet` where each row is one interval.

- **`applySort`**: Column-aware comparison with `ColumnType` dispatch. Supports multi-column sort. Returns a new `TypedDataSet` with rows reordered.

What the TypeScript engine does NOT port:

- **Indexing** (`DataSetIndex`, `DataSetGroupIndex`, `DataSetFilterIndex`, `DataSetSortIndex`). The Java engine caches intermediate results for repeated lookups on the same dataset. The TypeScript engine recomputes from scratch. If profiling shows this matters, memoization can be added later without changing the API.
- **Chronometer** instrumentation. Performance measurement uses standard browser `performance.now()` when needed, not a dedicated timing abstraction.
- **DataSetHandler / InternalContext**. The Java engine's internal state machine for processing nested groups. The TypeScript version uses function composition instead.

### Pure functions, no browser APIs

This is an explicit design constraint, not a preference:

- No `window`, `document`, `navigator`, `location`, or `history` references.
- No `Intl.NumberFormat` or `Intl.DateTimeFormat` for formatting within operations. Number formatting uses explicit patterns. Date interval naming uses explicit format strings.
- No `setTimeout`, `requestAnimationFrame`, or `Promise` -- operations are synchronous.
- Date handling uses UTC-based arithmetic, not locale-dependent `Date` constructor or `Date.prototype` methods.

The engine must produce identical results when run in Node.js, a browser, a Web Worker, or a test harness. If a function's output depends on which timezone the machine is configured in, that function is broken.

---

## 4. Expression Evaluation

### JSONata is for value expressions ONLY

JSONata replaces `Global.eval()` for one specific purpose: column `valueExpression` transforms. These are per-cell computations defined in `ColumnSettings.valueExpression` that transform a value before display.

**JSONata handles:**
- Column value expressions (e.g., `value * 100`, `$uppercase(value)`)

**Pure TypeScript handles:**
- Filter evaluation (all 13 CoreFunctionType values)
- Group interval building (fixed and dynamic)
- Sort comparison
- Aggregate function computation (COUNT, SUM, AVERAGE, etc.)

This separation is not negotiable. JSONata is a general-purpose query language -- using it for filter/group/sort would be both slower and harder to type-check than purpose-built TypeScript functions.

### Bridge pattern

```typescript
// packages/core/src/expression/jsonata-bridge.ts
import jsonata from "jsonata";

// This file is the ONLY place `any` is tolerated in the core engine.
// The jsonata library's type definitions use `any` extensively.
// This bridge quarantines the type unsafety.

export function evaluate(expression: string, data: unknown): string {
  const expr = jsonata(expression);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const result = expr.evaluate(data as jsonata.Focus) as unknown;
  return String(result ?? "");
}
```

```typescript
// packages/core/src/expression/evaluator.ts
import { evaluate as jsonataEval } from "./jsonata-bridge";

export function evaluateExpression(
  value: string,
  expression: string | undefined
): string {
  if (!expression || expression === "value") return value;
  return jsonataEval(expression, { value });
}
```

---

## 5. YAML Parsing

### Direct import, Zod validation

```typescript
// packages/core/src/yaml/parser.ts
import yaml from "js-yaml";
import { runtimeModelSchema } from "./schema";

export function parseYaml(content: string): RuntimeModel {
  const raw = yaml.load(content);
  return runtimeModelSchema.parse(raw);
}
```

### Backward-compatible field names

The Java codebase uses field names that differ from what the YAML surface syntax uses. Zod `.transform()` handles the mapping, accepting both forms:

```typescript
// packages/core/src/yaml/schema.ts
import { z } from "zod";

// Accept both "layoutTemplates" (Java internal name) and "pages" (YAML convention)
const runtimeModelSchema = z.object({
  // The YAML format uses "pages" but the Java RuntimeModel calls them "layoutTemplates"
  pages: z.array(pageSchema).optional(),
  layoutTemplates: z.array(pageSchema).optional(),
  // The YAML format uses "datasets" but Java uses "clientDataSets"
  datasets: z.array(dataSetDefSchema).optional(),
  clientDataSets: z.array(dataSetDefSchema).optional(),
}).transform((raw) => ({
  pages: raw.pages ?? raw.layoutTemplates ?? [],
  datasets: raw.datasets ?? raw.clientDataSets ?? [],
}));
```

This ensures existing YAML dashboards using either naming convention continue to work without modification.

---

## 6. DataSetLookupConstraints

### What this is

`DataSetLookupConstraints` (Java: 398 LOC, extends `DataSetConstraints`) validates whether a `DataSetLookup` is structurally valid for a given displayer type. It operates at the **operation level** -- checking the shape of the lookup query itself.

This is distinct from `ComponentCapabilities` (covered in 04-displayer-framework.md), which operates at the **component level** -- declaring what data shape a chart component expects.

The relationship: `ComponentCapabilities` says "this bar chart needs a category column and one or more measure columns." `DataSetLookupConstraints` says "the lookup must have exactly 1 group operation, the group must have at least 2 `GroupFunction` entries, and the first column must be LABEL type."

### TypeScript equivalent

```typescript
// packages/core/src/dataset/lookup-constraints.ts

export interface DataSetLookupConstraints {
  // Filter operations
  readonly filterAllowed: boolean;          // can the lookup include filter ops?

  // Group operations
  readonly groupAllowed: boolean;           // can the lookup include group ops?
  readonly groupRequired: boolean;          // must the lookup include a group op?
  readonly maxGroups: number;               // max group ops allowed (-1 = unlimited)
  readonly groupColumn: boolean;            // include a group column in results?
  readonly functionRequired: boolean;       // must group functions use aggregation?

  // Column constraints (inherited from DataSetConstraints)
  readonly minColumns: number;              // min columns in result (-1 = no limit)
  readonly maxColumns: number;              // max columns in result (-1 = no limit)
  readonly columnTypes?: readonly (readonly ColumnType[])[];  // valid type combinations
  readonly uniqueColumnIds: boolean;        // are duplicate column IDs forbidden?
  readonly extraColumnsAllowed: boolean;    // allow columns beyond the defined types?
  readonly extraColumnsType?: ColumnType;   // required type for extra columns

  // Editor labels
  readonly groupsTitle: string;             // label for the group column in editor UI
  readonly columnsTitle: string;            // label for measure columns in editor UI
}
```

### Validation

```typescript
export interface ValidationError {
  readonly code: number;
  readonly message: string;
}

/**
 * Validates a DataSetLookup against constraints.
 *
 * Error codes:
 *   100 = column type mismatch
 *   101 = column count out of bounds
 *   200 = too many group operations
 *   201 = group operation present but not allowed
 *   203 = group operation required but missing
 *   204 = duplicate column ID
 */
export function validateLookup(
  lookup: DataSetLookup,
  constraints: DataSetLookupConstraints,
  metadata?: DataSetMetadata
): ValidationError | null { ... }
```

The validation function checks:

1. If `!groupAllowed` and the lookup contains a group op with a non-null `columnGroup`, return error 201.
2. If `groupRequired` and no group op exists, return error 203.
3. If `maxGroups !== -1` and the number of group ops exceeds it, return error 200.
4. If a group op exists, check its `GroupFunction` list against `minColumns`, `maxColumns`.
5. If `uniqueColumnIds`, check for duplicate column IDs in the group function list (error 204).
6. If `metadata` is provided, check each `GroupFunction`'s source column type against the `columnTypes` combinations.

### Editor lookup generation

`DataSetLookupConstraints` also has a `newDataSetLookup()` factory method that generates a valid lookup for a given dataset's metadata. This is used by the editor when a user first assigns a dataset to a displayer -- it creates a sensible default lookup that satisfies the constraints.

```typescript
export function createDefaultLookup(
  metadata: DataSetMetadata,
  constraints: DataSetLookupConstraints
): DataSetLookup { ... }
```

The algorithm:
1. If `groupRequired`, find the first LABEL or DATE column and add it as the group column.
2. Fill remaining column slots with the best-matching columns from the dataset, preferring the column types specified in `columnTypes`.
3. For NUMBER targets with `functionRequired`, add `SUM` as the aggregate function. If no NUMBER column is available, fall back to `COUNT`.
4. Generate unique column IDs to avoid collisions.

---

## Appendix: Java File Inventory

What follows is a categorization of the 131 files in `melviz-dataset`, indicating what happens to each category in the TypeScript port.

| Category | File Count | Disposition |
|----------|-----------|-------------|
| Core model (DataSet, Column, ColumnType, etc.) | ~12 | Ported as TypeScript interfaces/types |
| DataSetLookup and builders | ~8 | Ported, simplified (no builder pattern needed) |
| Filter model (CoreFunctionType, ColumnFilter, LogicalExprFilter, etc.) | ~8 | Ported as discriminated unions |
| Group model (ColumnGroup, GroupFunction, AggregateFunctionType, Interval, etc.) | ~12 | Ported, interval builders rewritten |
| Sort model | ~4 | Ported (trivial) |
| Date model (TimeFrame, TimeInstant, Month, DayOfWeek, Quarter) | ~6 | Ported |
| Engine (SharedDataSetOpEngine, algorithms, handlers) | ~10 | Replaced by pure functions |
| Indexing infrastructure (DataSetIndex, DataSetGroupIndex, etc.) | ~15 | Eliminated (no caching layer) |
| JSON marshallers | ~10 | Eliminated (Zod schemas replace) |
| Factory / Builder / Registry patterns | ~10 | Eliminated (direct construction) |
| Errai annotations, CDI, IoC wiring | ~8 | Eliminated (React context replaces DI) |
| Constraints and validation | ~4 | Ported |
| Aggregate function implementations | ~12 | Ported as pure functions |
| Test infrastructure | ~12 | Replaced by Vitest equivalents |
