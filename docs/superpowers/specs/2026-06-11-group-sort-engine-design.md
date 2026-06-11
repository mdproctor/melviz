# GroupOp, SortOp, and applyOps Engine — Design Spec

**Date:** 2026-06-11
**Issue:** mdproctor/melviz#2
**Scope:** Complete Filter→Group→Sort pipeline for the TypeScript DataSet core model

---

## 1. Design Principles

This design works from first principles, not from porting Java. The Java model's structural choices (CDI injection, mutable intervals, nullable function fields, class hierarchies for simple dispatch) are discarded. What survives is the **semantic model** — what the system computes — expressed through TypeScript discriminated unions, pure functions, and immutable data.

Key decisions:
- **Type-level enforcement for aggregation** — SUM/AVERAGE/MEDIAN on a non-NUMBER column is a compile error, not a runtime surprise
- **Runtime validation for grouping strategy** — the YAML parser doesn't know column types at parse time, so strategy×column-type compatibility is checked when the engine runs
- **Explicit result column roles** — `key`, `aggregate`, `select` as a discriminated union, eliminating Java's null-function ambiguity
- **Single JOIN with separator** — replaces three near-identical Java enum values (JOIN, JOIN_COMMA, JOIN_HYPHEN)
- **Pure functions, no indexing/caching** — browser-context datasets fit in memory; caching wraps around the engine if needed later, never inside it
- **All date arithmetic in UTC** — eliminates the class of locale/DST bugs from Java's browser Date emulation

---

## 2. Type Foundation — Aggregation and Result Columns

### Aggregation Functions

```typescript
// Functions that require NUMBER columns
type NumericAggregation =
  | { readonly fn: "SUM" }
  | { readonly fn: "AVERAGE" }
  | { readonly fn: "MEDIAN" };

// Functions that work on any column type
type UniversalAggregation =
  | { readonly fn: "COUNT" }
  | { readonly fn: "DISTINCT" }
  | { readonly fn: "MIN" }
  | { readonly fn: "MAX" }
  | { readonly fn: "JOIN"; readonly separator: string };

type Aggregation = NumericAggregation | UniversalAggregation;
```

### Aggregation Type Signatures

| Category | Functions | Input constraint | Output type |
|---|---|---|---|
| Counting | COUNT, DISTINCT | any column type | NUMBER |
| Numeric reduction | SUM, AVERAGE, MEDIAN | NUMBER only | NUMBER |
| Extrema | MIN, MAX | any comparable | same as input |
| Concatenation | JOIN | any column type | TEXT |

### Result Columns

```typescript
type ResultColumn =
  | { readonly kind: "key"; readonly sourceId: ColumnId; readonly columnId: ColumnId }
  | { readonly kind: "aggregate"; readonly sourceId: ColumnId; readonly columnId: ColumnId;
      readonly fn: Aggregation }
  | { readonly kind: "select"; readonly sourceId: ColumnId; readonly columnId: ColumnId };
```

- **`key`** — the grouping column; values are interval/bucket names (output type: LABEL)
- **`aggregate`** — computed summary per bucket
- **`select`** — first value in each bucket for that column (output type: same as source)

### Result Type Inference

| ResultColumn kind | Output ColumnType |
|---|---|
| key | LABEL |
| select | same as source column |
| aggregate + SUM/AVERAGE/MEDIAN/COUNT/DISTINCT | NUMBER |
| aggregate + MIN/MAX | same as source column |
| aggregate + JOIN | TEXT |

---

## 3. Grouping Specification

### GroupStrategy

```typescript
type GroupStrategy =
  | { readonly mode: "distinct" }
  | { readonly mode: "fixedCalendar"; readonly unit: FixedCalendarUnit }
  | { readonly mode: "dynamicRange"; readonly preferredUnit?: DateIntervalType };

type FixedCalendarUnit =
  | "QUARTER" | "MONTH" | "DAY_OF_WEEK"
  | "HOUR" | "MINUTE" | "SECOND";
```

### GroupingKey

```typescript
interface GroupingKey {
  readonly sourceId: ColumnId;
  readonly columnId: ColumnId;
  readonly strategy: GroupStrategy;
  readonly maxIntervals: number;        // default 15, applies to dynamicRange
  readonly emptyIntervals: boolean;     // include empty buckets? default false
  readonly ascendingOrder: boolean;     // bucket sort order, default true
  readonly firstMonthOfYear?: Month;    // fiscal year start, default JANUARY
  readonly firstDayOfWeek?: DayOfWeek;  // week start, default MONDAY
}

type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;  // 1=Monday, 7=Sunday (ISO 8601)
```

### Strategy × Column Type Compatibility (runtime-validated)

| Strategy | DATE | NUMBER | LABEL | TEXT |
|---|---|---|---|---|
| distinct | — | — | yes | yes |
| fixedCalendar | yes | — | — | — |
| dynamicRange | yes | yes | — | — |

---

## 4. Operations

### GroupOp

```typescript
interface GroupOp {
  readonly type: "group";
  readonly groupingKey: GroupingKey | null;  // null = whole-dataset aggregation
  readonly columns: readonly ResultColumn[];
  readonly selectedIntervals?: readonly string[];
  readonly join?: boolean;
}
```

- `groupingKey: null` — aggregate all rows without partitioning
- `selectedIntervals` — drill-down: narrow to rows in named buckets
- `join` — nested group join for sequential GroupOps

### SortOp

```typescript
type SortOrder = "ASCENDING" | "DESCENDING";

interface SortOp {
  readonly type: "sort";
  readonly columns: readonly SortColumn[];
}

interface SortColumn {
  readonly columnId: ColumnId;
  readonly order: SortOrder;
}
```

### DataSetOp Union

```typescript
type DataSetOp = FilterOp | GroupOp | SortOp;
```

---

## 5. Bucketing Engine (Internal)

### Interval

```typescript
interface Interval {
  readonly name: string;
  readonly index: number;
  readonly rowIndices: readonly number[];
  readonly minValue?: Date | number;
  readonly maxValue?: Date | number;
}

type IntervalList = readonly Interval[];
```

### Bucketing Dispatch

| Column Type | Strategy | Logic |
|---|---|---|
| LABEL / TEXT | distinct | One bucket per unique value. `Map<string, number[]>`. |
| DATE | fixedCalendar | Predetermined count: MONTH→12, QUARTER→4, DAY_OF_WEEK→7, HOUR→24, MINUTE→60, SECOND→60. Bucket assignment via UTC calendar field extraction. |
| DATE | dynamicRange | Find min/max. Pick smallest DateIntervalType producing ≤ maxIntervals buckets. Calendar-aligned boundaries via truncateToInterval/advanceByInterval. |
| NUMBER | dynamicRange | Find min/max. Equal-width bins capped at maxIntervals. |

### Date Arithmetic

```typescript
type DateIntervalType =
  | "SECOND" | "MINUTE" | "HOUR"
  | "DAY" | "DAY_OF_WEEK" | "WEEK"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

function truncateToInterval(date: Date, unit: DateIntervalType): Date
function advanceByInterval(date: Date, unit: DateIntervalType, count: number): Date
```

`truncateToInterval` — zeroes fields below the interval unit (YEAR → Jan 1 00:00:00 UTC).

`advanceByInterval` — calendar arithmetic, not millisecond addition. Adding 1 month to Jan 31 → Feb 28/29.

All operations use UTC methods exclusively (`getUTCMonth`, `setUTCMonth`, etc.).

Sub-second granularities (MILLISECOND, HUNDRETH, TENTH) are omitted — no interval builder supports them in practice. Adding them later is non-breaking.

### Dynamic Range Auto-Sizing Algorithm

1. Sort dates ascending, find min/max (skip nulls)
2. Compute `span = max - min` in milliseconds
3. Walk DateIntervalType from smallest to largest; first type where `span / approximateDurationMs < maxIntervals` is selected
4. If strategy specifies a preferred size and the computed type is finer-grained, use the preferred size
5. Generate boundaries: `truncateToInterval(min, type)` then `advanceByInterval()` until past max
6. Walk sorted values, assign each to its interval

---

## 6. Aggregation Engine

```typescript
function computeAggregation(
  fn: Aggregation,
  values: readonly CellValue[],
): CellValue
```

### NULL Handling (SQL semantics)

| Function | NULL behavior | Empty input |
|---|---|---|
| COUNT | counts all rows including NULLs | `{ type: "NUMBER", value: 0 }` |
| DISTINCT | NULLs count as one distinct value | `{ type: "NUMBER", value: 0 }` |
| SUM | skip NULLs | `{ type: "NUMBER", value: 0 }` |
| AVERAGE | skip NULLs from sum and count | `{ type: "NUMBER", value: 0 }` |
| MEDIAN | skip NULLs | `{ type: "NUMBER", value: 0 }` |
| MIN | skip NULLs | `{ type: "NULL" }` |
| MAX | skip NULLs | `{ type: "NULL" }` |
| JOIN | skip NULLs | `{ type: "TEXT", value: "" }` |

MIN/MAX return NULL on empty input — there is no minimum of nothing.

### Precision

Numeric results rounded to 2 decimal places (matching Java behavior).

### Type Safety Enforcement

When the engine encounters a `NumericAggregation` (SUM/AVERAGE/MEDIAN), it verifies the source column is `ColumnType.NUMBER` before computing. Mismatch is a thrown error, not a silent zero. Checked once per GroupOp evaluation, not per-row.

---

## 7. The applyOps Engine

```typescript
function applyOps(
  ds: TypedDataSet,
  ops: readonly DataSetOp[],
): TypedDataSet
```

### Step 1 — Validate Operation Ordering

Build a string from type discriminants (`F`, `G`, `S`), match against regex `F*G*S?`. Reject with descriptive error on mismatch.

### Step 2 — Apply Operations Sequentially

Each op transforms the TypedDataSet:

- `FilterOp` → `applyFilter(ds, op)` (already implemented)
- `GroupOp` → `applyGroup(ds, op)` (new)
- `SortOp` → `applySort(ds, op)` (new)

### applyGroup Logic

1. **groupingKey is null** → whole-dataset aggregation. Compute each aggregate ResultColumn over all rows. Produce a single-row TypedDataSet.

2. **selectedIntervals is set** → interval selection (drill-down). Compute buckets, filter to rows in named intervals. If columns is empty, return filtered dataset. Otherwise proceed to step 3 with filtered rows.

3. **Full group-by.** Compute buckets. For each bucket: key columns → bucket name, aggregate columns → computeAggregation, select columns → first value. Discard empty buckets unless emptyIntervals is true. Sort buckets per ascendingOrder. Produce new TypedDataSet with one row per retained bucket.

### applySort Logic

1. Validate all referenced columns exist
2. Stable multi-column sort: compare by first SortColumn, break ties with subsequent columns
3. NULL values sort last regardless of direction
4. Return new TypedDataSet with rows reordered

### Multiple GroupOps

Sequential GroupOps: first produces a grouped dataset, second operates on that result. Supports drill-down: group1 with selectedIntervals narrows data, group2 re-groups.

### Error Handling

Thrown errors with descriptive messages, not silent fallbacks:
- "Column 'revenue' not found in dataset"
- "SUM requires a NUMBER column, but 'name' is TEXT"
- "Fixed calendar grouping requires a DATE column, but 'price' is NUMBER"

---

## 8. File Structure

```
packages/core/src/dataset/
  types.ts              — existing
  filter.ts             — existing
  filter-eval.ts        — existing
  timeframe.ts          — existing
  conversion.ts         — existing
  errors.ts             — existing

  group.ts              — NEW: GroupOp, GroupingKey, GroupStrategy, ResultColumn,
                           Aggregation, NumericAggregation, UniversalAggregation,
                           FixedCalendarUnit, Month, DayOfWeek
  group-eval.ts         — NEW: applyGroup(), computeAggregation(), bucketing
  sort.ts               — NEW: SortOp, SortColumn, SortOrder
  sort-eval.ts          — NEW: applySort()
  ops.ts                — NEW: DataSetOp union, applyOps(), validateOpOrder()
  date-interval.ts      — NEW: DateIntervalType, truncateToInterval(),
                           advanceByInterval(), date arithmetic
```

Type definitions in `X.ts`, evaluation in `X-eval.ts` — matches existing filter/filter-eval split.

`date-interval.ts` is separate from `group.ts` — self-contained date arithmetic with no dependency on grouping types.

---

## 9. YAML Wire Format Compatibility

The internal model differs from the YAML/Java wire format in several places. The YAML parser normalizes at parse time:

| YAML/Java | Internal model |
|---|---|
| `strategy: FIXED` + `intervalSize: MONTH` | `{ mode: "fixedCalendar", unit: "MONTH" }` |
| `strategy: DYNAMIC` | `{ mode: "dynamicRange" }` or `{ mode: "distinct" }` (based on column type) |
| `strategy: DYNAMIC` + `intervalSize: MONTH` | `{ mode: "dynamicRange", preferredUnit: "MONTH" }` |
| `function: JOIN_COMMA` | `{ fn: "JOIN", separator: ", " }` |
| `function: JOIN_HYPHEN` | `{ fn: "JOIN", separator: " - " }` |
| `function: null` (Java GroupFunction) | `{ kind: "key" }` or `{ kind: "select" }` depending on context |
| `firstMonthOfYear: JANUARY` | `firstMonthOfYear: 1` |
| `firstDayOfWeek: MONDAY` | `firstDayOfWeek: 1` |
