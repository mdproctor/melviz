# GroupOp, SortOp, and applyOps Engine — Design Spec

**Date:** 2026-06-11
**Issue:** mdproctor/melviz#2
**Scope:** Complete Filter→Group→Sort pipeline for the TypeScript DataSet core model
**Supersedes:** `2026-06-09-gwt-to-typescript-migration-design.md` §4 `AggregateOp` (removed — whole-dataset aggregation is `GroupOp` with `groupingKey: null`, consistent with `01-core-engine.md` §2 which already documents this decision)

---

## 1. Design Principles

This design works from first principles, not from porting Java. The Java model's structural choices (CDI injection, mutable intervals, nullable function fields, class hierarchies for simple dispatch) are discarded. What survives is the **semantic model** — what the system computes — expressed through TypeScript discriminated unions, pure functions, and immutable data.

Key decisions:
- **Type-level enforcement for aggregation** — SUM/AVERAGE/MEDIAN on a non-NUMBER column is a compile error, not a runtime surprise
- **Runtime validation for grouping strategy × column type** — the YAML parser produces a `dynamic` strategy mode without knowing the column type; the engine resolves it to `distinct` or `dynamicRange` at execution time when the column type is known from the actual dataset
- **Explicit result column roles** — `key`, `aggregate`, `select` as a discriminated union, eliminating Java's null-function ambiguity
- **Single JOIN with separator** — replaces three near-identical Java enum values (JOIN, JOIN_COMMA, JOIN_HYPHEN)
- **Pure functions, no indexing/caching** — browser-context datasets fit in memory; caching wraps around the engine if needed later, never inside it
- **All date arithmetic in UTC** — eliminates the class of locale/DST bugs from Java's browser Date emulation
- **`date-interval.ts` is the canonical home for date arithmetic** — `timeframe.ts` is refactored to import from it, eliminating duplicated truncation and offset logic

### Java bugs fixed

- **MIN/MAX restricted to NUMBER columns:** `AggregateFunctionType._numericOnly` incorrectly includes MIN and MAX. Finding the earliest date (`MIN` on DATE) or lexicographic minimum (`MIN` on LABEL/TEXT) are valid operations. The TypeScript model corrects this by placing MIN/MAX in `UniversalAggregation`.
- **Rounding in aggregation:** Java's `AbstractFunction.round(value, 2)` applies 2-decimal rounding inside SUM, AVERAGE, MEDIAN, MIN, and MAX — but not COUNT or DISTINCT. Rounding MIN/MAX is lossy (the result may not exist in the input data). Rounding SUM loses precision for downstream consumers. Aggregation should compute exact results; display rounding belongs in the formatter layer.
- **AVERAGE divides by total rows instead of non-null count:** Java's `AverageFunction` divides by `rows.size()` (all rows including nulls) instead of the count of non-null values. With 5 rows all NULL: Java computes 0/5 = 0. SQL AVG returns NULL. The TypeScript model adopts SQL semantics — AVERAGE/MEDIAN with zero non-null values returns NULL.
- **Silent group-op discard:** Java's engine silently drops a second GroupOp when the first has no interval selection and `join` is false (returns false from `group()`, no error). The TypeScript engine treats this as an error.
- **TEXT columns forbidden from grouping:** Java throws `'text columns no grouping'` for TEXT columns via `ClientIntervalBuilderLocator`. The TypeScript model removes this restriction — TEXT is structurally identical to LABEL for grouping purposes. The LABEL/TEXT distinction affects column semantics (LABEL = categorical, TEXT = free-form), not whether grouping is permitted.

### Java dead code not mapped

- **`GroupStrategy.CUSTOM`:** `isColumnTypeSupported()` returns false for all types. No `IntervalBuilder` is registered for it in `ClientIntervalBuilderLocator`. Treated as dead infrastructure — not mapped.

---

## 2. Type Foundation — Aggregation and Result Columns

`sourceId` — the column in the input dataset being read. `columnId` — the column in the output dataset being produced. These may differ when a column is renamed in the output (e.g., `sourceId: "revenue"`, `columnId: "total_revenue"`).

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
- **`select`** — first value in each bucket by original row order in the input dataset (output type: same as source)

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
  | { readonly mode: "dynamicRange"; readonly preferredUnit?: DateIntervalType }
  | { readonly mode: "dynamic"; readonly preferredUnit?: DateIntervalType };

type FixedCalendarUnit =
  | "QUARTER" | "MONTH" | "DAY_OF_WEEK"
  | "HOUR" | "MINUTE" | "SECOND";
```

**`dynamic`** is the unresolved mode produced by the YAML parser when it encounters `strategy: DYNAMIC`. The engine resolves it at execution time based on the source column's type:

- LABEL / TEXT → `distinct` (`preferredUnit` ignored)
- NUMBER → `distinct` (`preferredUnit` ignored)
- DATE → `dynamicRange` with `preferredUnit` forwarded

The other three modes (`distinct`, `fixedCalendar`, `dynamicRange`) are fully resolved and can be constructed directly in code without going through YAML parsing.

**NUMBER + `dynamic` resolves to `distinct`, not `dynamicRange`.** Java routes all NUMBER columns to `IntervalBuilderDynamicLabel` (distinct by value). This is the correct default — the engine can't know whether numbers are categorical (HTTP status codes, priority levels) or continuous (temperatures, prices). Distinct is safe for both; `dynamicRange` would produce wrong results for categorical data. Users who want range bins on continuous numeric data must explicitly request `dynamicRange`.

**NUMBER + `dynamicRange` (equal-width bins) is a new capability not present in Java.** Java has no numeric range binning — `ClientIntervalBuilderLocator` always routes NUMBER to `IntervalBuilderDynamicLabel`. The TypeScript model adds `dynamicRange` on NUMBER as explicit opt-in for continuous numeric data.

### GroupingKey

```typescript
interface GroupingKey {
  readonly sourceId: ColumnId;
  readonly columnId: ColumnId;
  readonly strategy: GroupStrategy;
  readonly maxIntervals: number;        // default 15, applies to dynamicRange only
  readonly emptyIntervals: boolean;     // include empty buckets? default false
  readonly ascendingOrder: boolean;     // bucket sort order, default true
  readonly firstMonthOfYear?: Month;    // fiscal year start, default 1 (January)
  readonly firstDayOfWeek?: DayOfWeek;  // week start, default 1 (Monday)
}

type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;  // 1=Monday, 7=Sunday (ISO 8601)
```

`Month` and `DayOfWeek` are numeric, not string enums. The YAML parser converts `"JANUARY"` → `1`, `"MONDAY"` → `1` at the boundary. Both types live in `date-interval.ts` alongside `DateIntervalType`.

This is a deliberate refactoring of `timeframe.ts`'s existing `Month` string type — the string representation requires lookup tables (`MONTH_INDEX`) just to do arithmetic. The numeric representation is the right internal model; string names belong at the serialisation boundary.

**`maxIntervals` applies to `dynamicRange` only.** It controls range granularity (how wide the bins are). For `distinct` grouping, each unique value is definitionally its own bucket — there's no granularity to control. Java's `IntervalBuilderDynamicLabel` has an unimplemented `// TODO: create a composite interval when the maxIntervals are reached` — the TypeScript model does not implement this. Display-layer truncation handles the "too many buckets" case.

### Strategy × Column Type Compatibility (runtime-validated)

| Strategy | DATE | NUMBER | LABEL | TEXT |
|---|---|---|---|---|
| distinct | yes | yes | yes | yes |
| fixedCalendar | yes | — | — | — |
| dynamicRange | yes | yes (new) | — | — |
| dynamic | resolved at runtime based on column type |

`distinct` works on all column types. NUMBER + distinct is a valid use case (HTTP status codes, priority levels, rating scores). Java already groups NUMBER columns via `IntervalBuilderDynamicLabel` (distinct by value).

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

- **`groupingKey: null`** — aggregate all rows without partitioning. `kind: "key"` columns are invalid in this case (error `INVALID_OPERATION`: "Key columns require a grouping key"). `kind: "select"` produces the first row's value (by original row order) across the entire dataset.
- **`selectedIntervals`** — drill-down: narrow to rows in named buckets before applying the next operation.
- **`join`** — nested group join. When a second GroupOp follows a non-selection first GroupOp, `join: true` creates nested intervals within each parent bucket. Without `join` or `selectedIntervals`, a second GroupOp after a non-selection first GroupOp is an error `INVALID_OPERATION` (not silently dropped as in Java). See §7 for full semantics and worked example.

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
| any | distinct | One bucket per unique value. `Map<string, number[]>`. |
| DATE | fixedCalendar | Predetermined count: MONTH→12, QUARTER→4, DAY_OF_WEEK→7, HOUR→24, MINUTE→60, SECOND→60. Bucket assignment via UTC calendar field extraction. |
| DATE | dynamicRange | Find min/max. Pick smallest DateIntervalType producing ≤ maxIntervals buckets. Calendar-aligned boundaries via truncateToInterval/advanceByInterval. |
| NUMBER | dynamicRange | Find min/max. Equal-width bins capped at maxIntervals. **New capability** — Java uses distinct grouping for all NUMBER columns via `IntervalBuilderDynamicLabel`. `dynamicRange` on NUMBER must be explicitly requested; `dynamic` mode resolves to `distinct`. |

### Bucket Naming Conventions

Interval names must be deterministic because `selectedIntervals` matches by name.

| Strategy | Naming rule |
|---|---|
| **distinct** | TEXT/LABEL: the string value. NUMBER: `String(value)`. DATE: `date.toISOString()`. null: `"null"`. |
| **fixedCalendar MONTH** | Month index as string: `"1"` through `"12"` |
| **fixedCalendar QUARTER** | Quarter index as string: `"1"` through `"4"` |
| **fixedCalendar DAY_OF_WEEK** | Day index as string: `"1"` through `"7"` |
| **fixedCalendar HOUR** | `"0"` through `"23"` |
| **fixedCalendar MINUTE** | `"0"` through `"59"` |
| **fixedCalendar SECOND** | `"0"` through `"59"` |
| **dynamicRange (DATE)** | ISO 8601 UTC format, granularity-dependent (see below) |
| **dynamicRange (NUMBER)** | `"<min>-<max>"` (e.g. `"0-100"`) |

**Date interval naming by granularity** (matches Java `ClientIntervalBuilderDynamicDate.calculateName()`):

| Granularity | Format | Example |
|---|---|---|
| YEAR, DECADE, CENTURY, MILLENIUM | `"yyyy"` | `"2024"` |
| QUARTER, MONTH | `"yyyy-MM"` | `"2024-03"` |
| WEEK, DAY, DAY_OF_WEEK | `"yyyy-MM-dd"` | `"2024-03-15"` |
| HOUR | `"yyyy-MM-dd HH"` | `"2024-03-15 09"` |
| MINUTE | `"yyyy-MM-dd HH:mm"` | `"2024-03-15 09:30"` |
| SECOND | `"yyyy-MM-dd HH:mm:ss"` | `"2024-03-15 09:30:45"` |

### Date Arithmetic — `date-interval.ts`

**This is the canonical module for all date arithmetic in the codebase.** `timeframe.ts` is refactored to import from it — its existing `truncate()` and `applyOffset()` implementations move here. `TruncationUnit` and `OffsetUnit` remain in `timeframe.ts` as constrained subsets of the imported `DateIntervalType`: `type TruncationUnit = Extract<DateIntervalType, "MINUTE" | "HOUR" | ...>`.

```typescript
type DateIntervalType =
  | "MILLISECOND" | "HUNDRETH" | "TENTH"
  | "SECOND" | "MINUTE" | "HOUR"
  | "DAY" | "DAY_OF_WEEK" | "WEEK"
  | "MONTH" | "QUARTER" | "YEAR"
  | "DECADE" | "CENTURY" | "MILLENIUM";

type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

function truncateToInterval(
  date: Date,
  unit: DateIntervalType,
  opts?: { firstMonthOfYear?: Month },
): Date

function advanceByInterval(date: Date, unit: DateIntervalType, count: number): Date
```

`DateIntervalType` retains all 15 members (including sub-second) because `timeframe.ts`'s `OffsetUnit` already uses SECOND and the full set is needed for completeness. The bucketing engine only uses SECOND and above for interval generation, but the type itself is shared across both uses.

`truncateToInterval` — zeroes fields below the interval unit (YEAR → Jan 1 00:00:00 UTC). Supports fiscal year alignment via `firstMonthOfYear` for YEAR and QUARTER truncation (e.g., truncating to fiscal year start when the fiscal year begins in April). This subsumes `timeframe.ts`'s `truncate(date, unit, "begin", firstMonthOfYear)`. End-of-interval is composed: `advanceByInterval(truncateToInterval(date, unit, opts), unit, 1)`.

`advanceByInterval` — calendar arithmetic, not millisecond addition. Adding 1 month to Jan 31 → Feb 28/29.

All operations use UTC methods exclusively (`getUTCMonth`, `setUTCMonth`, etc.).

### Approximate Duration Table

Used by the dynamic range auto-sizing algorithm (step 3). These are approximations for interval comparison, not for actual boundary computation:

```typescript
const APPROXIMATE_DURATION_MS: Record<DateIntervalType, number> = {
  MILLISECOND: 1,
  HUNDRETH: 10,
  TENTH: 100,
  SECOND: 1_000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
  DAY: 86_400_000,
  DAY_OF_WEEK: 86_400_000,
  WEEK: 604_800_000,
  MONTH: 2_678_400_000,       // 31 days
  QUARTER: 8_035_200_000,     // 3 × 31 days
  YEAR: 32_140_800_000,       // 12 × 31 days
  DECADE: 321_408_000_000,
  CENTURY: 3_214_080_000_000,
  MILLENIUM: 32_140_800_000_000,
};
```

Matches the Java `DateIntervalType.DURATION_IN_MILLIS` values. These use rough approximations (months = 31 days). Actual interval boundaries use calendar-correct calculations via `truncateToInterval` / `advanceByInterval`.

### Dynamic Range Auto-Sizing Algorithm

1. Sort dates ascending, find min/max (skip nulls)
2. Compute `span = max - min` in milliseconds
3. Walk DateIntervalType from smallest to largest (MILLISECOND → MILLENIUM); first type where `span / APPROXIMATE_DURATION_MS[type] < maxIntervals` is selected
4. If `preferredUnit` is specified on the `dynamicRange` strategy and the computed type is finer-grained, use the preferred unit instead
5. Generate boundaries: `truncateToInterval(min, type, { firstMonthOfYear })` then `advanceByInterval()` until past max
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

"Empty/all-null" covers two cases: zero rows in the bucket, or all values are NULL. The principle: functions with identity elements (SUM→0, COUNT→0, JOIN→"") return them. Functions without (AVERAGE, MEDIAN, MIN, MAX) return NULL — the result is genuinely undefined.

| Function | NULL behavior | 0 rows | N rows, all NULL |
|---|---|---|---|
| COUNT | counts all rows including NULLs (`COUNT(*)`) | `{ type: "NUMBER", value: 0 }` | `{ type: "NUMBER", value: N }` |
| DISTINCT | NULLs count as one distinct value | `{ type: "NUMBER", value: 0 }` | `{ type: "NUMBER", value: 1 }` |
| SUM | skip NULLs | `{ type: "NUMBER", value: 0 }` | `{ type: "NUMBER", value: 0 }` |
| AVERAGE | skip NULLs from both sum and count | `{ type: "NULL" }` | `{ type: "NULL" }` |
| MEDIAN | skip NULLs | `{ type: "NULL" }` | `{ type: "NULL" }` |
| MIN | skip NULLs | `{ type: "NULL" }` | `{ type: "NULL" }` |
| MAX | skip NULLs | `{ type: "NULL" }` | `{ type: "NULL" }` |
| JOIN | skip NULLs | `{ type: "TEXT", value: "" }` | `{ type: "TEXT", value: "" }` |

**Java bug fix:** Java's `AverageFunction` divides by `rows.size()` (total rows including nulls) instead of the count of non-null values. With 5 rows all NULL: Java computes 0/5 = 0. SQL AVG returns NULL. The TypeScript model adopts SQL semantics — AVERAGE with zero non-null values is undefined, not zero.

COUNT uses `COUNT(*)` semantics deliberately — it counts rows in the bucket, not non-null values. This matches the Java `CountFunction` which returns `rows.size()`.

### No Rounding in the Aggregation Engine

Aggregation produces exact IEEE 754 double results. Java's 2-decimal rounding (via `AbstractFunction.round(value, 2)`) is a display concern — it belongs in the formatter/displayer layer, not in the computation engine.

Specifically:
- Rounding MIN/MAX is incorrect — the result may not exist in the input data
- Rounding SUM loses precision for downstream consumers (further aggregations, exports)
- COUNT and DISTINCT are already integers — rounding them is meaningless work (Java doesn't round them either)
- AVERAGE and MEDIAN produce fractional results that should be formatted at display time, not truncated during computation

### Type Safety Enforcement

When the engine encounters a `NumericAggregation` (SUM/AVERAGE/MEDIAN), it verifies the source column is `ColumnType.NUMBER` before computing. Mismatch is a thrown error (`TYPE_MISMATCH`): "SUM requires a NUMBER column, but '{columnId}' is {actualType}". Checked once per GroupOp evaluation, not per-row.

---

## 7. The applyOps Engine

```typescript
function applyOps(
  ds: TypedDataSet,
  ops: readonly DataSetOp[],
): TypedDataSet
```

### Step 1 — Validate Operation Ordering

Build a string from type discriminants (`F`, `G`, `S`), match against regex `F*G*S?`. Reject with `INVALID_OPERATION` error on mismatch.

### Step 2 — Apply Operations

The simple sequential reduce pattern (`ops.reduce((ds, op) => applyOp(ds, op))`) holds for cross-type transitions: filter→group materializes the filtered dataset before grouping, group→sort materializes the grouped dataset before sorting.

**Consecutive GroupOps are the exception.** A joined GroupOp needs the original dataset's columns and rows, not the parent GroupOp's materialized 2-row output. `applyOps` collects consecutive GroupOps and delegates to an internal `applyGroupSequence(originalDs, groupOps)` that maintains row partitions (bucket assignments) throughout the sequence and materializes once after the final GroupOp. This matches the Java engine's `InternalContext`, which preserves `context.dataSet` (the original dataset) across all group operations and calls `buildDataSet()` only at the end.

Operations:
- `FilterOp` → `applyFilter(ds, op)` (already implemented)
- Consecutive `GroupOp`s → `applyGroupSequence(ds, groupOps)` (new)
- `SortOp` → `applySort(ds, op)` (new)

### applyGroup Logic

1. **groupingKey is null** → whole-dataset aggregation.
   - Validation: `kind: "key"` result columns are invalid — error `INVALID_OPERATION`: "Key columns require a grouping key."
   - `kind: "aggregate"` columns: compute aggregation over all rows.
   - `kind: "select"` columns: first row's value by original row order.
   - Produce a single-row TypedDataSet.

2. **selectedIntervals is set** → interval selection (drill-down). Compute buckets for groupingKey, narrow to rows belonging to named intervals. If columns is empty, return filtered TypedDataSet (row narrowing only). Otherwise proceed to step 3 with the narrowed row set.

3. **Full group-by.** Resolve `dynamic` strategy to concrete mode based on column type. Compute buckets via the bucketing engine (§5). For each bucket: key columns → bucket name, aggregate columns → computeAggregation, select columns → first value by original row order. Discard empty buckets unless emptyIntervals is true. Sort buckets per ascendingOrder. Produce new TypedDataSet with one row per retained bucket.

### Output Column Construction

The output `TypedDataSet.columns` are constructed from the `ResultColumn` array:

- **key:** `{ id: columnId, name: columnId, type: ColumnType.LABEL }`
- **aggregate:** `{ id: columnId, name: columnId, type: <inferred from §2 result type table> }`
- **select:** `{ id: columnId, name: sourceColumn.name, type: sourceColumn.type }`

For key and aggregate columns, `name` = `columnId` (these are derived columns). For select columns, `name` preserves the source column's display name.

### Multiple GroupOps

**Without `join` or `selectedIntervals`:** a second GroupOp after a non-selection first GroupOp is an error `INVALID_OPERATION`: "Multiple group operations require either `selectedIntervals` (drill-down) or `join: true` (nested grouping) on subsequent groups." Java silently discards the second GroupOp — this is fixed.

**With `selectedIntervals`:** the engine computes buckets, narrows to rows in the named intervals, then subsequent operations run on the narrowed set. If both `selectedIntervals` and `join` are set, `selectedIntervals` takes precedence — the GroupOp performs interval selection.

**With `join: true`:** nested grouping. For each parent bucket, the child grouping runs on only that bucket's rows. The output flattens — each combination of (parent bucket, child bucket) becomes a row. The child GroupOp's `columns` array defines the output shape entirely. If the parent key is needed alongside child results, include it as a `select` column in the child GroupOp.

When consecutive GroupOps are processed via `applyGroupSequence`, only the final GroupOp's `columns` define the output shape. Earlier GroupOps use only `groupingKey` for bucket computation.

#### join: true — Worked Example

Input dataset:

| region | product | revenue |
|--------|---------|---------|
| East   | Widgets | 100     |
| East   | Gadgets | 200     |
| West   | Widgets | 150     |
| West   | Gadgets | 50      |

GroupOp 1: group by `region`, columns = `[key:region, aggregate:SUM(revenue)]`
→ Parent buckets: East (rows 0,1), West (rows 2,3)

GroupOp 2: `join: true`, group by `product`, columns = `[select:region, key:product, aggregate:SUM(revenue)]`
→ Sub-group within each parent:
- Within East (rows 0,1): Widgets (row 0), Gadgets (row 1)
- Within West (rows 2,3): Widgets (row 2), Gadgets (row 3)

Output (4 rows — one per parent×child combination):

| region | product | SUM(revenue) |
|--------|---------|-------------|
| East   | Widgets | 100         |
| East   | Gadgets | 200         |
| West   | Widgets | 150         |
| West   | Gadgets | 50          |

The `select:region` column takes the first value from each sub-bucket's rows. Since all rows within a sub-bucket share the same parent region, this consistently produces the parent's value.

### applySort Logic

1. Validate all referenced columns exist (`UNKNOWN_COLUMN` error if not)
2. Stable multi-column sort: compare by first SortColumn, break ties with subsequent columns
3. Comparison semantics per column type:
   - NUMBER: numeric comparison
   - DATE: UTC timestamp comparison (`getTime()`)
   - TEXT / LABEL: Unicode codepoint order (locale-insensitive, matching the filter spec's string comparison semantics)
4. NULL values sort last regardless of direction
5. Return new TypedDataSet with rows reordered

### Error Handling

All errors are thrown as `DataSetError` with the appropriate code:

| Error | Code |
|---|---|
| Column not found in dataset | `UNKNOWN_COLUMN` |
| SUM/AVERAGE/MEDIAN on non-NUMBER column | `TYPE_MISMATCH` |
| fixedCalendar on non-DATE column | `TYPE_MISMATCH` |
| dynamicRange on non-DATE/non-NUMBER column | `TYPE_MISMATCH` |
| Key columns with null groupingKey | `INVALID_OPERATION` |
| Second GroupOp without join or selectedIntervals | `INVALID_OPERATION` |
| Invalid operation sequence (not matching `F*G*S?`) | `INVALID_OPERATION` |

`INVALID_OPERATION` is a new `DataSetErrorCode` value — the operation is structurally well-formed but semantically invalid in context.

---

## 8. File Structure

```
packages/core/src/dataset/
  types.ts              — existing
  filter.ts             — existing
  filter-eval.ts        — existing
  timeframe.ts          — existing (refactored: imports date arithmetic from date-interval.ts;
                           TruncationUnit and OffsetUnit remain here as constrained subsets:
                           type TruncationUnit = Extract<DateIntervalType, "MINUTE" | "HOUR" | ...>)
  conversion.ts         — existing
  errors.ts             — existing (add INVALID_OPERATION code)

  date-interval.ts      — NEW: DateIntervalType (all 15 members), Month, DayOfWeek,
                           APPROXIMATE_DURATION_MS, truncateToInterval(),
                           advanceByInterval() — canonical home for all date arithmetic;
                           timeframe.ts's truncate() and applyOffset() move here
  group.ts              — NEW: GroupOp, GroupingKey, GroupStrategy, ResultColumn,
                           Aggregation, NumericAggregation, UniversalAggregation,
                           FixedCalendarUnit
  group-eval.ts         — NEW: applyGroup(), computeAggregation(), bucketing functions
  sort.ts               — NEW: SortOp, SortColumn, SortOrder
  sort-eval.ts          — NEW: applySort()
  ops.ts                — NEW: DataSetOp union, applyOps(), validateOpOrder()
```

Type definitions in `X.ts`, evaluation in `X-eval.ts` — matches existing filter/filter-eval split.

`date-interval.ts` is the canonical date arithmetic module. `timeframe.ts` is refactored to import `DateIntervalType`, truncation, and offset logic from it — eliminating the current duplication where both modules would implement calendar arithmetic independently.

---

## 9. YAML Wire Format Compatibility

The internal model differs from the YAML/Java wire format in several places. The YAML parser normalizes at parse time:

| YAML/Java | Internal model |
|---|---|
| `strategy: FIXED` + `intervalSize: MONTH` | `{ mode: "fixedCalendar", unit: "MONTH" }` |
| `strategy: DYNAMIC` | `{ mode: "dynamic" }` |
| `strategy: DYNAMIC` + `intervalSize: MONTH` | `{ mode: "dynamic", preferredUnit: "MONTH" }` |
| `function: JOIN_COMMA` | `{ fn: "JOIN", separator: ", " }` |
| `function: JOIN_HYPHEN` | `{ fn: "JOIN", separator: " - " }` |
| `function: null` (Java GroupFunction) | `{ kind: "key" }` or `{ kind: "select" }` depending on context |
| `firstMonthOfYear: JANUARY` | `firstMonthOfYear: 1` |
| `firstDayOfWeek: MONDAY` | `firstDayOfWeek: 1` |
