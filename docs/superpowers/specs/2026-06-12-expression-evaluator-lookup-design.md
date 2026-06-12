# Expression Evaluator & DataSetLookup Design

Covers issues #4 (expression evaluator / JSONata bridge) and #5 (DataSetLookup + YAML parser).

---

## 1. JSONata Bridge (`jsonata-bridge.ts`)

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

---

## 2. Expression Evaluator (`evaluator.ts`)

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

### Error handling

- Returns original value on any evaluation failure (graceful degradation)
- Errors surfaced via optional `onError` callback — never swallowed, never thrown
- `emptyTemplate` precedence over `valueExpression` is a displayer concern, not handled here

---

## 3. DataSetLookup (`lookup.ts`)

Query abstraction: "take dataset X, apply these operations, return rows N through M."

### Model

```typescript
export interface DataSetLookup {
  readonly dataSetId: DataSetId;
  readonly operations: readonly DataSetOp[];
  readonly rowOffset: number;
  readonly rowCount: number;    // -1 = all rows
  readonly metadata: Readonly<Record<string, unknown>>;
}
```

### Factory

```typescript
export function createLookup(
  dataSetId: DataSetId,
  operations: readonly DataSetOp[],
  options?: {
    readonly rowOffset?: number;   // default: 0
    readonly rowCount?: number;    // default: -1 (all)
    readonly metadata?: Readonly<Record<string, unknown>>;
  },
): DataSetLookup;
```

### Design decisions

- **Pagination is post-pipeline** — `rowOffset` / `rowCount` slice the final result after all operations complete. `applyOps` doesn't know about pagination; the caller (service layer) applies ops then slices.
- **`metadata`** — extensibility bag, ignored by the engine, available to consumers. Default: `{}`.
- **Validation at construction** — `createLookup` calls `validateOpOrder(operations)` internally. Invalid sequences fail at construction, not execution.

---

## 4. DataSetLookupConstraints (`lookup-constraints.ts`)

Validates the *structure* of a DataSetLookup against what a component type allows.

### Model

```typescript
export interface DataSetLookupConstraints {
  readonly filterAllowed: boolean;
  readonly groupAllowed: boolean;
  readonly groupRequired: boolean;
  readonly maxGroups: number;             // -1 = unlimited
  readonly minColumns: number;            // -1 = no limit
  readonly maxColumns: number;            // -1 = no limit
  readonly columnTypes?: readonly (readonly ColumnType[])[];
  readonly uniqueColumnIds: boolean;
  readonly extraColumnsAllowed: boolean;
  readonly extraColumnsType?: ColumnType;
  readonly groupsTitle: string;
  readonly columnsTitle: string;
}

export const DEFAULT_CONSTRAINTS: DataSetLookupConstraints;
```

### Validation API

```typescript
export function validateLookup(
  lookup: DataSetLookup,
  constraints: DataSetLookupConstraints,
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

### Design decisions

- **Returns violations, doesn't throw** — editor UI needs all problems at once.
- **`columnTypes` is positional** — `columnTypes[0]` constrains the first result column, etc. Each position lists acceptable types. Columns beyond `columnTypes.length` governed by `extraColumnsAllowed` / `extraColumnsType`.
- **`groupsTitle` / `columnsTitle`** — pure UI metadata for the editor. Live here because constraints ARE the component's contract with the lookup system.

---

## 5. YAML Lookup Parser (`lookup-parser.ts`)

Zod schemas that parse raw YAML objects into typed `DataSetLookup` instances.

### API

```typescript
export function parseLookup(raw: unknown): DataSetLookup;
export function parseFilterExpressions(raw: unknown): FilterExpression[];
```

### YAML format

#### Filter — full expression tree

A filter node is discriminated by which key is present:

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
```

ResultColumn kind inferred from context: source matches `columnGroup.source` → `"key"`, `function` present → `"aggregate"`, otherwise → `"select"`.

#### Sort

```yaml
sort:
  - column: revenue
    order: DESCENDING               # ASCENDING | DESCENDING, default: ASCENDING
```

---

## 6. Unresolved Filter Expressions

### Problem

YAML doesn't know column types at parse time. The existing `FilterExpression` union has typed leaves (`"numeric"`, `"string"`, `"date"`). Dashboard YAML is parsed at load time; column types are known only after the dataset is fetched.

### Solution — `"unresolved"` variant

Added to `FilterExpression` in `filter.ts`:

```typescript
export type FilterExpression =
  | { readonly type: "numeric"; readonly columnId: ColumnId; readonly filter: NumericFilter }
  | { readonly type: "string"; readonly columnId: ColumnId; readonly filter: StringFilter }
  | { readonly type: "date"; readonly columnId: ColumnId; readonly filter: DateFilter }
  | { readonly type: "unresolved"; readonly columnId: ColumnId;
      readonly fn: CoreFunctionType; readonly args: readonly string[] }
  | { readonly type: "and"; readonly children: readonly FilterExpression[] }
  | { readonly type: "or"; readonly children: readonly FilterExpression[] }
  | { readonly type: "not"; readonly child: FilterExpression };
```

### Filter Resolution (`filter-resolve.ts`)

```typescript
export function resolveFilterTypes(
  expression: FilterExpression,
  columns: readonly Column[],
): FilterExpression;
```

Walks the expression tree. Unresolved leaves promoted to typed variants based on column's `ColumnType`:

- `NUMBER` → parse args via `parseFloat`, reject NaN
- `DATE` → parse ISO 8601 strings to `Date`, reject invalid
- `TEXT` / `LABEL` → string args pass through
- `TIME_FRAME` → parse via existing `parseTimeFrame()`
- `BETWEEN` → `args[0]` → low, `args[1]` → high
- `IN` / `NOT_IN` → all args parsed to typed array
- `IS_NULL` / `NOT_NULL` → no args needed

AND/OR/NOT nodes recurse into children. Already-resolved nodes pass through unchanged.

### Guard in `filter-eval.ts`

If `applyFilter` encounters an `"unresolved"` node at evaluation time, it throws `DataSetError("INVALID_OPERATION", "Unresolved filter — call resolveFilterTypes() before evaluation")`.

---

## 7. Error Types

### ExpressionError (extends Error)

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
  | "TYPE_COERCION_FAILED"
  | "RESOLUTION_FAILED";
```

### ParseError (extends Error)

```typescript
export class ParseError extends Error {
  constructor(
    readonly code: ParseErrorCode,
    readonly path: string,
    message?: string,
  );
}

export type ParseErrorCode =
  | "INVALID_LOOKUP"
  | "INVALID_FILTER"
  | "INVALID_GROUP"
  | "INVALID_SORT"
  | "UNKNOWN_FUNCTION"
  | "MISSING_REQUIRED_FIELD";
```

---

## 8. File Organization

New and modified files in `packages/core/src/dataset/`:

```
# Modified
errors.ts                       + ExpressionError, ParseError
filter.ts                       + "unresolved" variant in FilterExpression
filter-eval.ts                  + guard: throw on unresolved node

# New — issue #4
jsonata-bridge.ts               compile, compileOrCached, clearCache
evaluator.ts                    evaluateExpression()

# New — issue #5
lookup.ts                       DataSetLookup, createLookup()
lookup-constraints.ts           DataSetLookupConstraints, validateLookup()
lookup-parser.ts                parseLookup(), Zod schemas
filter-resolve.ts               resolveFilterTypes()

# New tests
__tests__/jsonata-bridge.test.ts
__tests__/evaluator.test.ts
__tests__/lookup.test.ts
__tests__/lookup-constraints.test.ts
__tests__/lookup-parser.test.ts
__tests__/filter-resolve.test.ts
```

**Dependency change:** add `jsonata` as production dependency in `packages/core/package.json`.

---

## 9. Testing Strategy

### JSONata Bridge
- Compile valid expression → CompiledExpression
- Compile invalid syntax → ExpressionError SYNTAX_ERROR with position
- Evaluate arithmetic, bindings, path navigation
- Cache: same string → same compiled object; clearCache → recompiles

### Evaluator
- Fast paths: undefined/empty/"value" expression → value unchanged
- Null semantics: null value × various expressions (see §2 table)
- String transforms: `$uppercase`, `$trim`, `$pad`, `$substring`, `$replace`
- Numeric transforms: `value * 100`, `$round(value)`
- Error path: invalid expression → original value + onError called
- Error path: runtime error → original value + onError called
- Type coercion: numeric/boolean results → string

### DataSetLookup
- createLookup: defaults (rowOffset 0, rowCount -1, empty metadata)
- createLookup: explicit options preserved
- createLookup: invalid op order → DataSetError INVALID_OPERATION
- Frozen/readonly

### DataSetLookupConstraints
- Valid lookup against DEFAULT_CONSTRAINTS → no violations
- Each violation code exercised individually
- Multiple violations returned in single call

### Lookup Parser
- Minimal: just uuid → DataSetLookup with empty ops
- Filter: flat list → implicit AND of unresolved expressions
- Filter: nested or/and/not → correct tree structure
- Filter: all CoreFunctionType values recognized
- Filter: unknown function → ParseError UNKNOWN_FUNCTION
- Group: key + aggregate + select column kind inference
- Group: all strategy variants, optional fields default
- Sort: single/multi column, default ASCENDING
- Full pipeline: filter + group + sort → valid DataSetLookup
- Malformed YAML: missing fields → ParseError with path

### Filter Resolution
- Unresolved on NUMBER/TEXT/DATE/LABEL → correct typed variant
- TIME_FRAME, BETWEEN, IN/NOT_IN, IS_NULL/NOT_NULL → correct arg parsing
- AND/OR/NOT → recursive resolution
- Already-resolved → pass through
- Bad args for type → ExpressionError RESOLUTION_FAILED
- Unknown column → DataSetError UNKNOWN_COLUMN

---

## 10. Deferred Concerns

Items explicitly out of scope for issues #4 and #5, to be addressed in future issues:

- **ExternalDataSetDef / document-level JSONata transforms** — the bridge supports it; the typed extraction layer is a separate design concern (Phase 2+)
- **DataSetManager / service layer** — the component that owns dataset registration, lookup execution, and pagination slicing
- **Editor integration** — how the dashboard editor uses DataSetLookupConstraints to build UI
- **`createDefaultLookup(constraints)`** — generate a sensible default lookup from constraints for the editor
- **Zod schemas for full dashboard YAML** — pages/components/displayer structure; issue #5 covers only the lookup portion
- **Custom JSONata function registration** — the bridge supports `registerFunction` on compiled expressions; a melviz-specific function library is a separate concern
