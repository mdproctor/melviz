# Expression Evaluator & DataSetLookup Design

Covers issues #4 (expression evaluator / JSONata bridge) and #5 (DataSetLookup + YAML parser).

---

## 1. JSONata Bridge (`expression/jsonata-bridge.ts`)

Typed boundary around the `jsonata` npm package. The ONLY file that imports `jsonata`. Everything else goes through this API.

### API

```typescript
export interface CompiledExpression {
  evaluate(data: unknown, bindings?: Record<string, unknown>): Promise<unknown>;
}

export function compile(expression: string): CompiledExpression;
export function compileOrCached(expression: string): CompiledExpression;
export function clearCache(): void;
```

### Design decisions

- **No convenience `evaluate()` at this layer** — callers go through `compile()` or `compileOrCached()` then call `.evaluate()`. Forces awareness of the compile step.
- **Expression cache** — `Map<string, CompiledExpression>` keyed by expression string. Cell-level expressions reuse the same expression across all rows in a column — cache makes this zero-overhead after first compilation. A plain Map is sufficient (dashboard expressions are a bounded set); `clearCache()` provides manual eviction for testing and lifecycle management.
- **Errors**: syntax errors from `compile()` throw `ExpressionError` immediately. Runtime evaluation errors from `.evaluate()` reject the promise with `ExpressionError`.
- **Generic wrapper** — serves both cell-level `valueExpression` (issue #4) and future document-level transforms (ExternalDataSetDef, later phase). The bridge doesn't know about either use case.

### Async constraint

JSONata v2's `evaluate()` is an `async function` — it always returns a `Promise`, even for trivially synchronous expressions like `value * 100`. No sync evaluation path exists in the library. This is a design constraint inherited from JSONata, not a choice.

For cell-level `valueExpression`, this means each cell evaluation enters the microtask queue. For a 500-row × 10-column table, that's up to 5000 microtask entries. Mitigation: batch evaluation at the column level with `Promise.all(values.map(v => evaluateExpression(v, expr)))` — the expression is compiled once (cached), and the async overhead is amortized.

A future JSONata version or alternative library with a sync path would allow the evaluator to become synchronous without API change — callers already `await`, which is a no-op on a resolved Promise.

---

## 2. Expression Evaluator (`expression/evaluator.ts`)

High-level API for `ColumnSettings.valueExpression` evaluation. Consumes the bridge, adds the `{ value }` binding convention and string coercion.

### API

```typescript
export function evaluateExpression(
  value: string | null,
  expression: string | undefined,
  onError?: (error: ExpressionError) => void,
): Promise<string | null>;
```

### Null semantics

| Value | Expression | Result | Reason |
|-------|-----------|--------|--------|
| `null` | `undefined` | `null` | No expression, no data |
| `null` | `"value"` | `null` | Identity expression, pass through |
| `null` | `"value ?? 'N/A'"` | `"N/A"` | Expression handles null explicitly |
| `null` | `"value * 100"` | `null` | JSONata: `null * 100` → undefined → null |
| `"42"` | `"value * 100"` | `"4200"` | Normal transform |
| `"hello"` | `"$uppercase(value)"` | `"HELLO"` | Normal transform |
| `"hello"` | (throws) | `"hello"` | Graceful degradation |

### Fast paths (no JSONata call)

- expression is `undefined` / `null` / empty string → return value unchanged
- expression === `"value"` → return value unchanged

### String coercion rules

JSONata can return any type. The evaluator coerces to `string | null`:

| JSONata result | Evaluator output | Rule |
|----------------|-----------------|------|
| `string` | pass through | Direct |
| `number` | `String(n)` — e.g., `4200` → `"4200"` | Numeric coercion |
| `boolean` | `String(b)` — e.g., `true` → `"true"` | Boolean coercion |
| `null` / `undefined` | `null` | Null propagation |
| `object` / `array` | original value + `onError(TYPE_COERCION_FAILED)` | Cell expressions must produce scalars |

Objects and arrays are wrong results for cell-level `valueExpression` — they indicate the expression is misused in this context. The evaluator invokes `onError` and returns the original value (graceful degradation).

### Error handling

- Returns original value on any evaluation failure (graceful degradation)
- Errors surfaced via optional `onError` callback — never swallowed, never thrown
- `emptyTemplate` precedence over `valueExpression` is a displayer concern, not handled here

---

## 3. DataSetLookup (`dataset/lookup.ts`)

Query abstraction: "take dataset X, apply these operations."

### Model

```typescript
export interface DataSetLookup {
  readonly dataSetId: DataSetId;
  readonly operations: readonly DataSetOp[];
}
```

### Factory

```typescript
export function createLookup(
  dataSetId: DataSetId,
  operations: readonly DataSetOp[],
): DataSetLookup;
```

### Design decisions

- **No pagination** — `rowOffset` / `rowCount` are presentation concerns, not query semantics. Pagination belongs at the service layer (DataSetManager, issue #7), which slices the result after `applyOps` completes. This keeps DataSetLookup a pure query definition.
- **No metadata** — the Java `DataSetLookup.metadata` field has zero consumers: never serialized, never cloned, never compared, never read by any code path. Removed per YAGNI. If a concrete consumer emerges, adding it back is trivial.
- **Validation at construction** — `createLookup` calls `validateOpOrder(operations)` internally. Invalid sequences fail at construction, not execution. `parseLookup` delegates to `createLookup` — every DataSetLookup created through any path (programmatic or YAML) has validated op ordering.

---

## 4. DataSetLookupConstraints (`dataset/lookup-constraints.ts`)

Validates the *structure* of a DataSetLookup against what a component type allows.

### Model

```typescript
export interface DataSetLookupConstraints {
  readonly filterAllowed: boolean;
  readonly groupAllowed: boolean;
  readonly groupRequired: boolean;
  readonly maxGroups?: number;            // absent = unlimited
  readonly minColumns?: number;           // absent = no minimum
  readonly maxColumns?: number;           // absent = no maximum
  readonly columnTypes?: readonly (readonly ColumnType[])[];
  readonly uniqueColumnIds: boolean;
  readonly extraColumnsAllowed: boolean;
  readonly extraColumnsType?: ColumnType;
}

export const DEFAULT_CONSTRAINTS: DataSetLookupConstraints;
```

`DEFAULT_CONSTRAINTS` is the "everything allowed, nothing required" baseline: `{ filterAllowed: true, groupAllowed: true, groupRequired: false, uniqueColumnIds: false, extraColumnsAllowed: true }`. All optional numeric fields absent (unlimited).

### Validation API

```typescript
export function validateLookup(
  lookup: DataSetLookup,
  constraints: DataSetLookupConstraints,
  columns?: readonly Column[],
): readonly LookupViolation[];

export interface LookupViolation {
  readonly code: LookupViolationCode;
  readonly message: string;
}

export type LookupViolationCode =
  | "FILTER_NOT_ALLOWED"
  | "GROUP_NOT_ALLOWED"
  | "GROUP_REQUIRED"
  | "TOO_MANY_GROUPS"
  | "TOO_FEW_COLUMNS"
  | "TOO_MANY_COLUMNS"
  | "INVALID_COLUMN_TYPE"
  | "DUPLICATE_COLUMN_ID"
  | "EXTRA_COLUMN_NOT_ALLOWED"
  | "EXTRA_COLUMN_WRONG_TYPE";
```

### Result column type inference

`columnTypes` validation requires knowing the output type of each result column. Some types are statically determinable from the operation definition; others require the source dataset schema:

| ResultColumn kind | Output type | Requires dataset schema? |
|---|---|---|
| `key` | always LABEL | No |
| `aggregate` COUNT | always NUMBER | No |
| `aggregate` DISTINCT | always NUMBER | No |
| `aggregate` SUM | always NUMBER | No |
| `aggregate` AVERAGE | always NUMBER | No |
| `aggregate` MEDIAN | always NUMBER | No |
| `aggregate` JOIN | always TEXT | No |
| `aggregate` MIN | same as source column | Yes |
| `aggregate` MAX | same as source column | Yes |
| `select` | same as source column | Yes |

When `columns` is provided to `validateLookup`, full type validation is performed — MIN/MAX and select columns are resolved against the source schema. When `columns` is absent, type validation is partial: statically-determinable types are checked, source-dependent types are skipped. The validator never guesses.

### Design decisions

- **Returns violations, doesn't throw** — editor UI needs all problems at once.
- **`columns` optional** — the editor and service layer (which have the dataset) pass columns for full validation. Testing and standalone contexts omit it for structural-only validation.
- **`columnTypes` is positional** — `columnTypes[0]` constrains the first result column, etc. Each position lists acceptable types. Columns beyond `columnTypes.length` governed by `extraColumnsAllowed` / `extraColumnsType`.
- **No UI labels** — `groupsTitle` / `columnsTitle` are editor display concerns, not validation logic. They belong in component registration metadata (`ComponentCapabilities`, defined in the displayer plugin spec §4.3), not in the validation model.
- **Relationship to `ComponentCapabilities`** — these are separate types serving different roles. `ComponentCapabilities` declares what the component supports at registration time (richer model: `columnRequirements[]`, `supportsDrillDown`, `supportedTypes`). `DataSetLookupConstraints` validates lookup structure at the operation level. In the runtime where both exist, `DataSetLookupConstraints` should be derived from `ComponentCapabilities` via a `constraintsFromCapabilities()` function — a DataSetManager concern (issue #7). `DEFAULT_CONSTRAINTS` exists for contexts where capabilities aren't available (testing, standalone validation).

---

## 5. YAML Lookup Parser (`dataset/lookup-parser.ts`)

Zod schemas that parse raw YAML objects into typed `DataSetLookup` instances.

### API

```typescript
export function parseLookup(raw: unknown): DataSetLookup;
```

`parseFilterExpressions` is internal — no concrete external consumer exists. Promoted to public if a consumer emerges.

### Error handling

`parseLookup` uses Zod schemas internally. Structural validation errors (missing fields, wrong types, invalid enum values) propagate as `ZodError` directly — Zod already provides structured paths, expected types, and error codes. For semantic validation beyond Zod's scope, `DataSetError` is used. No custom `ParseError` type — it would either duplicate or lose Zod's multi-error detail.

### YAML format

#### Filter — full expression tree

A filter node is discriminated by which key is present. The four forms are **mutually exclusive** — if a YAML node contains both `column` and `and`/`or`/`not` keys, it is a parse error (Zod rejects via discriminated union).

| Key present | Interpretation |
|-------------|---------------|
| `column` + `function` | Leaf expression |
| `and` | AND combinator — value is array of filter nodes |
| `or` | OR combinator — value is array of filter nodes |
| `not` | NOT combinator — value is a single filter node |

Top-level `filter` array is implicit AND.

```yaml
# Flat list (implicit AND)
filter:
  - column: status
    function: EQUALS_TO
    args: ["active"]
  - column: price
    function: GREATER_THAN
    args: [100]

# Nested combinators
filter:
  - or:
      - column: region
        function: EQUALS_TO
        args: ["US"]
      - column: region
        function: EQUALS_TO
        args: ["EU"]
  - not:
      column: archived
      function: EQUALS_TO
      args: ["true"]
```

#### Group

```yaml
# Standard grouping — with columnGroup
group:
  - columnGroup:
      source: region
      column: region_key            # optional, defaults to source
      strategy: distinct            # distinct | fixedCalendar | dynamicRange | dynamic
      unit: MONTH                   # for fixedCalendar / dynamicRange preferredUnit
      maxIntervals: 15              # default: 15
      emptyIntervals: false         # default: false
      ascendingOrder: true          # default: true
      firstMonthOfYear: JANUARY     # optional
      firstDayOfWeek: MONDAY        # optional
    columns:
      - source: region              # key (matches columnGroup.source)
      - source: revenue
        function: SUM               # aggregate
        column: total_revenue       # output columnId, optional
      - source: name                # select (no function, no key match)
    selectedIntervals: ["US", "EU"] # optional drill-down
    join: true                      # optional

# Whole-dataset aggregation — no columnGroup
group:
  - columns:
      - source: revenue
        function: SUM
        column: total_revenue
```

ResultColumn kind inferred from context: source matches `columnGroup.source` → `"key"`, `function` present → `"aggregate"`, otherwise → `"select"`.

When `columnGroup` is absent → `groupingKey: null` (whole-dataset aggregation — single output row with aggregates only).

#### Sort

```yaml
sort:
  - column: revenue
    order: DESCENDING               # ASCENDING | DESCENDING, default: ASCENDING
```

---

## 6. Parameterized Filter Expression Tree

### Problem

YAML doesn't know column types at parse time. Dashboard YAML is parsed at load time; column types are known only after the dataset is fetched. The type system should make it impossible to evaluate an unresolved filter — the compiler catches the mistake, not a runtime guard.

### Solution — parameterized tree with resolved/unresolved leaves

The tree structure (AND/OR/NOT combinators) is invariant across resolved and unresolved states. A parameterized type captures this:

```typescript
// filter.ts

// Tree structure — defined once, parameterized by leaf type
type FilterExprTree<Leaf> =
  | Leaf
  | { readonly type: "and"; readonly children: readonly FilterExprTree<Leaf>[] }
  | { readonly type: "or"; readonly children: readonly FilterExprTree<Leaf>[] }
  | { readonly type: "not"; readonly child: FilterExprTree<Leaf> };

// Resolved leaves — column type is known
type ResolvedLeaf =
  | { readonly type: "numeric"; readonly columnId: ColumnId; readonly filter: NumericFilter }
  | { readonly type: "string"; readonly columnId: ColumnId; readonly filter: StringFilter }
  | { readonly type: "date"; readonly columnId: ColumnId; readonly filter: DateFilter };

// Unresolved leaf — column type unknown at parse time
type UnresolvedLeaf =
  { readonly type: "unresolved"; readonly columnId: ColumnId;
    readonly fn: CoreFunctionType; readonly args: readonly string[] };

// Concrete types
type ResolvedFilterExpression = FilterExprTree<ResolvedLeaf>;
type FilterExpression = FilterExprTree<ResolvedLeaf | UnresolvedLeaf>;
```

### Cascade to ops and engine

```typescript
// filter.ts
interface ResolvedFilterOp {
  readonly type: "filter";
  readonly expressions: readonly ResolvedFilterExpression[];
}

interface FilterOp {
  readonly type: "filter";
  readonly expressions: readonly FilterExpression[];
}

// ops.ts
type ResolvedDataSetOp = ResolvedFilterOp | GroupOp | SortOp;
type DataSetOp = FilterOp | GroupOp | SortOp;

// filter-eval.ts — accepts ONLY resolved ops
function applyFilter(ds: TypedDataSet, op: ResolvedFilterOp, referenceDate?: Date): TypedDataSet;

// ops.ts — accepts ONLY resolved ops
function applyOps(ds: TypedDataSet, ops: readonly ResolvedDataSetOp[]): TypedDataSet;
```

**Breaking change:** existing code constructs `FilterOp` and passes it to `applyFilter` / `applyOps`. After this change, those call sites use `ResolvedFilterOp` / `ResolvedDataSetOp`. Since existing filter expressions already use resolved leaves (no `"unresolved"` variant exists today), the migration is a mechanical type annotation change.

### DateFilter — add missing IN/NOT_IN variants

The existing `DateFilter` type is missing `IN` and `NOT_IN` variants that `NumericFilter` and `StringFilter` both have. Without them, `resolveFilterTypes` cannot produce a valid `DateFilter` for `function: IN` on a DATE column.

Add to `DateFilter` in `filter.ts`:

```typescript
| { readonly fn: "IN"; readonly values: readonly Date[] }
| { readonly fn: "NOT_IN"; readonly values: readonly Date[] }
```

Add corresponding evaluation logic to `evaluateDateFilter` in `filter-eval.ts`.

### CoreFunctionType compatibility matrix

Resolution must reject invalid function/column-type combinations:

| CoreFunctionType | NUMBER | TEXT / LABEL | DATE |
|---|---|---|---|
| IS_NULL, NOT_NULL | yes | yes | yes |
| EQUALS_TO, NOT_EQUALS_TO | yes | yes | yes |
| GREATER_THAN, GREATER_OR_EQUALS_TO | yes | yes | yes |
| LOWER_THAN, LOWER_OR_EQUALS_TO | yes | yes | yes |
| BETWEEN | yes | yes | yes |
| IN, NOT_IN | yes | yes | yes |
| LIKE_TO | no | yes | no |
| TIME_FRAME | no | no | yes |

Invalid combinations (e.g., LIKE_TO on NUMBER, TIME_FRAME on TEXT) throw `DataSetError("RESOLUTION_FAILED", ...)`.

### Filter Resolution (`dataset/filter-resolve.ts`)

```typescript
export function resolveFilterTypes(
  expression: FilterExpression,
  columns: readonly Column[],
): ResolvedFilterExpression;
```

Walks the expression tree. Unresolved leaves promoted to typed variants based on column's `ColumnType` per the compatibility matrix above:

- `NUMBER` → parse args via `parseFloat`, reject NaN
- `DATE` → parse ISO 8601 strings to `Date`, reject invalid
- `TEXT` / `LABEL` → string args pass through
- `TIME_FRAME` → parse via existing `parseTimeFrame()`
- `BETWEEN` → `args[0]` → low, `args[1]` → high
- `IN` / `NOT_IN` → all args parsed to typed array
- `IS_NULL` / `NOT_NULL` → no args needed

AND/OR/NOT nodes recurse into children. Already-resolved nodes pass through unchanged. Unknown column ID throws `DataSetError("UNKNOWN_COLUMN", ...)`.

### Lifecycle: parse → resolve → execute

```
Parse time:       parseLookup(yaml) → DataSetLookup
                  operations: DataSetOp[] — FilterOps may contain unresolved expressions

Resolution time:  resolveFilterTypes(expr, columns) → ResolvedFilterExpression
                  Service layer resolves all FilterOps → ResolvedFilterOps
                  Produces ResolvedDataSetOp[]

Execution time:   applyOps(ds, resolvedOps: ResolvedDataSetOp[]) → TypedDataSet
                  Type system guarantees no unresolved nodes reach evaluation
```

The service layer (DataSetManager, issue #7) owns the resolution step. `DataSetLookup` stores potentially-unresolved ops (it's a parse artifact). The service layer produces a separate `ResolvedDataSetOp[]` before calling `applyOps`. The type system enforces this — `applyOps` won't accept `DataSetOp[]`, only `ResolvedDataSetOp[]`.

---

## 7. Error Types

### ExpressionError (`expression/errors.ts`)

```typescript
export class ExpressionError extends Error {
  constructor(
    readonly code: ExpressionErrorCode,
    readonly expression: string,
    readonly position?: number,
    message?: string,
  );
}

export type ExpressionErrorCode =
  | "SYNTAX_ERROR"
  | "EVALUATION_FAILED"
  | "TYPE_COERCION_FAILED";
```

`position` is always present for `SYNTAX_ERROR` (JSONata always provides character position for parse errors). Optional for `EVALUATION_FAILED` (runtime position may or may not be available). Not applicable for `TYPE_COERCION_FAILED`.

### DataSetError (`dataset/errors.ts`) — extended

Add `RESOLUTION_FAILED` to the existing `DataSetErrorCode`:

```typescript
export type DataSetErrorCode =
  | /* existing codes */
  | "RESOLUTION_FAILED";   // filter type resolution failed (bad args for column type,
                            // or invalid function/column-type combination)
```

Filter type resolution is a dataset concern (resolving against column metadata), not an expression concern. `RESOLUTION_FAILED` lives alongside `UNKNOWN_COLUMN`, `TYPE_MISMATCH`, and other dataset-domain errors.

### No ParseError

Removed. The YAML parser uses Zod schemas internally — structural validation errors propagate as `ZodError` with full paths and expected types. Semantic validation beyond Zod's scope (rare) uses `DataSetError`. A separate `ParseError` type would either duplicate Zod's multi-error detail or lose it.

---

## 8. Bug Fix: `compareValues` in `group-eval.ts`

`compareValues` at `group-eval.ts:191` uses `a.value.localeCompare(b.value)` for string comparison, which is locale-dependent. This is inconsistent with `sort-eval.ts:50-52` which correctly uses `< >` operators (Unicode codepoint order), and with both the filter spec and group-sort spec which specify locale-insensitive comparison.

Fix: replace `a.value.localeCompare(b.value)` with `a.value < b.value ? -1 : a.value > b.value ? 1 : 0` to match `sort-eval.ts`.

---

## 9. File Organization

```
packages/core/src/
├── expression/                     # NEW directory — expression evaluation domain
│   ├── jsonata-bridge.ts           compile, compileOrCached, clearCache
│   ├── jsonata-bridge.test.ts
│   ├── evaluator.ts                evaluateExpression()
│   ├── evaluator.test.ts
│   └── errors.ts                   ExpressionError, ExpressionErrorCode
│
├── dataset/
│   ├── types.ts                    # unchanged
│   ├── errors.ts                   # + RESOLUTION_FAILED in DataSetErrorCode
│   ├── filter.ts                   # CHANGED — FilterExprTree<Leaf>, ResolvedLeaf,
│   │                               #   UnresolvedLeaf, ResolvedFilterExpression,
│   │                               #   FilterExpression, ResolvedFilterOp, FilterOp
│   │                               # + IN/NOT_IN variants on DateFilter
│   ├── filter-eval.ts              # CHANGED — applyFilter(ds, ResolvedFilterOp)
│   │                               # + evaluateDateFilter handles IN/NOT_IN
│   ├── filter-resolve.ts           # NEW — resolveFilterTypes()
│   ├── filter-resolve.test.ts      # NEW
│   ├── group.ts                    # unchanged
│   ├── group-eval.ts               # FIX — compareValues: localeCompare → codepoint
│   ├── sort.ts                     # unchanged
│   ├── sort-eval.ts                # unchanged
│   ├── ops.ts                      # CHANGED — ResolvedDataSetOp, applyOps takes
│   │                               #   ResolvedDataSetOp[]
│   ├── lookup.ts                   # NEW — DataSetLookup, createLookup()
│   ├── lookup.test.ts              # NEW
│   ├── lookup-constraints.ts       # NEW — DataSetLookupConstraints, validateLookup()
│   ├── lookup-constraints.test.ts  # NEW
│   ├── lookup-parser.ts            # NEW — parseLookup(), Zod schemas
│   ├── lookup-parser.test.ts       # NEW
│   ├── conversion.ts               # unchanged
│   ├── date-interval.ts            # unchanged
│   ├── timeframe.ts                # unchanged
│   └── (existing test files)       # co-located, per convention
```

**Dependency change:** add `jsonata` as production dependency in `packages/core/package.json`.

---

## 10. Testing Strategy

### JSONata Bridge (`expression/jsonata-bridge.test.ts`)
- Compile valid expression → CompiledExpression
- Compile invalid syntax → ExpressionError SYNTAX_ERROR with position (position always present)
- Evaluate arithmetic, bindings, path navigation
- Cache: same string → same compiled object; clearCache → recompiles

### Evaluator (`expression/evaluator.test.ts`)
- Fast paths: undefined/empty/"value" expression → value unchanged
- Null semantics: null value × various expressions (see §2 table)
- String transforms: `$uppercase`, `$trim`, `$pad`, `$substring`, `$replace`
- Numeric transforms: `value * 100`, `$round(value)`
- String coercion: number result → string, boolean result → string
- Object/array result → original value + onError(TYPE_COERCION_FAILED)
- Error path: invalid expression → original value + onError called
- Error path: runtime error → original value + onError called

### DataSetLookup (`dataset/lookup.test.ts`)
- createLookup: valid ops → frozen DataSetLookup with dataSetId + operations
- createLookup: invalid op order → DataSetError INVALID_OPERATION

### DataSetLookupConstraints (`dataset/lookup-constraints.test.ts`)
- Valid lookup against DEFAULT_CONSTRAINTS → no violations
- Each violation code exercised individually
- Multiple violations returned in single call
- Optional fields absent → no limit enforced
- columnTypes with columns provided → full type validation (MIN/MAX/select resolved)
- columnTypes without columns → partial validation (source-dependent types skipped)
- Key column always validated as LABEL (no schema needed)
- COUNT/SUM/AVERAGE/MEDIAN/DISTINCT/JOIN always validated (no schema needed)

### Lookup Parser (`dataset/lookup-parser.test.ts`)
- Minimal: just uuid → DataSetLookup with empty ops
- Filter: flat list → implicit AND of unresolved expressions
- Filter: nested or/and/not → correct tree structure
- Filter: all CoreFunctionType values recognized
- Filter: unknown function → ZodError (invalid enum value)
- Filter: mutually exclusive keys (column + and) → ZodError
- Group: key + aggregate + select column kind inference
- Group: all strategy variants, optional fields default
- Group: omitted columnGroup → groupingKey: null (whole-dataset aggregation)
- Sort: single/multi column, default ASCENDING
- Full pipeline: filter + group + sort → valid DataSetLookup
- Malformed YAML: missing fields → ZodError with path

### Filter Resolution (`dataset/filter-resolve.test.ts`)
- Unresolved on NUMBER → NumericFilter with parsed numbers
- Unresolved on TEXT/LABEL → StringFilter with string args
- Unresolved on DATE → DateFilter with parsed ISO dates
- DATE column with IN/NOT_IN → DateFilter with parsed Date arrays
- TIME_FRAME, BETWEEN, IS_NULL/NOT_NULL → correct arg parsing
- Invalid combination (LIKE_TO on NUMBER) → DataSetError RESOLUTION_FAILED
- Invalid combination (TIME_FRAME on TEXT) → DataSetError RESOLUTION_FAILED
- AND/OR/NOT → recursive resolution
- Already-resolved → pass through
- Bad args for type (e.g., "abc" on NUMBER) → DataSetError RESOLUTION_FAILED
- Unknown column → DataSetError UNKNOWN_COLUMN

### DateFilter IN/NOT_IN (`dataset/filter-eval.test.ts` — extend existing)
- DateFilter IN with matching date → passes
- DateFilter IN with non-matching date → fails
- DateFilter NOT_IN → inverse
- DateFilter IN with NULL cell → false (SQL null semantics)

### compareValues fix (`dataset/group-eval.test.ts` — extend existing)
- String comparison uses codepoint order, not locale
- Verify "a" < "b" < "z" and "A" < "a" (codepoint, not locale collation)

---

## 11. Deferred Concerns

Items explicitly out of scope for issues #4 and #5, to be addressed in future issues:

- **ExternalDataSetDef / document-level JSONata transforms** — the bridge supports it; the typed extraction layer is a separate design concern (Phase 2+)
- **DataSetManager / service layer** — the component that owns dataset registration, lookup execution, pagination slicing, and the `resolveFilterTypes` → `applyOps` pipeline. Pagination (`rowOffset` / `rowCount`) moves here from DataSetLookup.
- **`constraintsFromCapabilities()`** — derives `DataSetLookupConstraints` from `ComponentCapabilities`; a DataSetManager concern
- **Editor integration** — how the dashboard editor uses DataSetLookupConstraints to build UI. Editor display labels (`groupsTitle`, `columnsTitle`) belong in `ComponentCapabilities`, not constraints.
- **`createDefaultLookup(constraints)`** — generate a sensible default lookup from constraints for the editor
- **Zod schemas for full dashboard YAML** — pages/components/displayer structure; issue #5 covers only the lookup portion
- **Custom JSONata function registration** — the bridge supports `registerFunction` on compiled expressions; a melviz-specific function library is a separate concern
