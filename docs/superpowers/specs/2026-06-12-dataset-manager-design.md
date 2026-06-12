# DataSetManager Service Layer Design

Covers issue #7 (DataSetManager service layer).

---

## 1. Purpose

DataSetManager is the service that owns dataset registration and lookup execution. It connects the pieces built in issues #2–#5: takes a `DataSetLookup` (pure query definition), resolves unresolved filters against the registered dataset's column schema, executes operations via `applyOps`, and applies pagination to the result.

It is the single entry point for "I have a dataset ID and a query — give me a result."

---

## 2. Interface

```typescript
// dataset/manager.ts

export interface DataSetManager {
  // Registry
  register(id: DataSetId, dataset: TypedDataSet): void;
  get(id: DataSetId): TypedDataSet | undefined;
  remove(id: DataSetId): boolean;
  has(id: DataSetId): boolean;

  // Query
  lookup(query: DataSetLookup, options?: LookupOptions): TypedDataSet;
}

export interface LookupOptions {
  readonly rowOffset?: number;   // default: 0
  readonly rowCount?: number;    // default: -1 (all rows)
}
```

### Design decisions

- **Pagination in `LookupOptions`, not `DataSetLookup`.** The lookup is a pure query definition — what operations to apply. Pagination is an execution concern — how much of the result to return. This preserves the deliberate separation made in issue #5.
- **`lookup()` is synchronous.** All operations (filter resolution, `applyOps`, pagination) are pure CPU work on in-memory data. No I/O. `DataService` (future) adds async because data acquisition involves fetch/IO — the manager itself has nothing to await.
- **`get()` returns `undefined`, not `null`.** Standard TypeScript `Map` semantics. `has()` provided for check-without-retrieve.
- **`register()` overwrites silently.** Re-registering the same ID replaces the dataset. No "already exists" error. This matches `ClientDataSetManager` behaviour and is correct for a dashboard runtime where datasets are refreshed.

---

## 3. Lookup Execution Pipeline

```
1. Resolve dataset:  registry.get(query.dataSetId) → TypedDataSet
2. Resolve filters:  walk ops, resolve any unresolved FilterOps against column schema
3. Execute ops:      applyOps(dataset, resolvedOps) → TypedDataSet
4. Paginate:         slice rows by rowOffset/rowCount
5. Return:           the sliced TypedDataSet
```

### Step 1 — Dataset resolution

If the ID isn't registered, throw `DataSetError("UNKNOWN_PROVIDER", ...)`. Not a silent null return — if a lookup references a dataset that doesn't exist, that's a bug in the dashboard configuration. The Java `ClientDataSetManager` returns null, which pushes the NPE downstream.

### Step 2 — Filter resolution

The lookup's operations may contain `FilterOp` with unresolved leaves (parsed from YAML without column type info). The manager resolves them against the dataset's actual columns before execution.

```typescript
function resolveOps(
  ops: readonly DataSetOp[],
  columns: readonly Column[],
): ResolvedDataSetOp[] {
  return ops.map(op => {
    if (op.type !== "filter") return op;
    return {
      type: "filter",
      expressions: op.expressions.map(expr => resolveFilterTypes(expr, columns)),
    };
  });
}
```

This is a private function inside the manager, not exported. External code that needs filter resolution directly already has `resolveFilterTypes()`.

### Step 3 — Execute ops

Delegates to existing `applyOps()`.

### Step 4 — Pagination

Pure row slicing on the result:

```typescript
function paginate(
  ds: TypedDataSet,
  offset: number,
  count: number,
): TypedDataSet {
  if (offset === 0 && count < 0) return ds;
  const start = Math.min(offset, ds.rows.length);
  const rows = count < 0
    ? ds.rows.slice(start)
    : ds.rows.slice(start, start + count);
  return { columns: ds.columns, rows };
}
```

Semantics: `rowCount < 0` means "all remaining rows from offset." `offset` beyond the end returns zero rows (not an error). Matches Java `DataSet.trim()` behaviour.

---

## 4. Error Semantics

The pipeline throws on:

| Error | Source | Condition |
|-------|--------|-----------|
| `UNKNOWN_PROVIDER` | `lookup()` | Dataset ID not registered |
| `UNKNOWN_COLUMN` | `resolveFilterTypes()` | Filter references nonexistent column |
| `RESOLUTION_FAILED` | `resolveFilterTypes()` | Invalid function/column-type combo or unparseable args |
| `INVALID_OPERATION` | `applyOps()` → `validateOpOrder()` | Invalid operation sequence |

No try/catch wrapping inside the manager. Errors propagate to the caller. Error handling policy belongs to the layer above (`DataService`).

---

## 5. Implementation

```typescript
// dataset/manager.ts

export class DataSetManagerImpl implements DataSetManager {
  private readonly datasets = new Map<DataSetId, TypedDataSet>();

  register(id: DataSetId, dataset: TypedDataSet): void {
    this.datasets.set(id, dataset);
  }

  get(id: DataSetId): TypedDataSet | undefined {
    return this.datasets.get(id);
  }

  remove(id: DataSetId): boolean {
    return this.datasets.delete(id);
  }

  has(id: DataSetId): boolean {
    return this.datasets.has(id);
  }

  lookup(query: DataSetLookup, options?: LookupOptions): TypedDataSet {
    const dataset = this.datasets.get(query.dataSetId);
    if (!dataset) {
      throw new DataSetError("UNKNOWN_PROVIDER", `Dataset "${query.dataSetId}" not registered`);
    }

    const resolvedOps = resolveOps(query.operations, dataset.columns);
    const result = applyOps(dataset, resolvedOps);
    return paginate(result, options?.rowOffset ?? 0, options?.rowCount ?? -1);
  }
}

export function createDataSetManager(): DataSetManager {
  return new DataSetManagerImpl();
}
```

### Construction

Factory function `createDataSetManager()` is the public construction path. Consumers depend on `DataSetManager` (interface), not `DataSetManagerImpl`. `DataSetManagerImpl` is exported for testing access only.

---

## 6. File Organization

```
packages/core/src/dataset/
├── manager.ts              # NEW — DataSetManager interface, impl, factory
├── manager.test.ts         # NEW — tests
├── (existing files unchanged)
```

No new dependencies. The manager imports only from existing dataset modules: `types.ts`, `errors.ts`, `filter-resolve.ts`, `ops.ts`.

---

## 7. Testing Strategy

### Registry operations (`manager.test.ts`)

- `register` + `get`: register a dataset, retrieve by ID → same dataset
- `register` overwrites: register twice with same ID → second dataset returned
- `get` unknown ID → `undefined`
- `has` registered ID → `true`; unknown → `false`
- `remove` registered ID → `true`, subsequent `get` → `undefined`
- `remove` unknown ID → `false`

### Lookup — full pipeline

- Lookup with no operations → returns the full dataset unchanged
- Lookup with resolved filter ops → filters applied correctly
- Lookup with unresolved filter ops → resolved against column schema, then applied
- Lookup with group ops → grouping applied
- Lookup with sort ops → sorting applied
- Lookup with filter + group + sort → full pipeline in sequence

### Lookup — pagination

- No options → all rows returned
- `rowOffset: 0, rowCount: -1` → all rows (explicit defaults)
- `rowOffset: 2, rowCount: 3` → rows 2, 3, 4
- `rowOffset: 0, rowCount: 2` → first 2 rows
- `rowOffset` beyond dataset length → zero rows, no error
- `rowCount: -1` with offset → all rows from offset
- Pagination after ops → ops execute first, then slice

### Lookup — error paths

- Unknown dataset ID → `DataSetError("UNKNOWN_PROVIDER")`
- Filter references unknown column → `DataSetError("UNKNOWN_COLUMN")`
- Invalid function/type combo (e.g., `LIKE_TO` on NUMBER) → `DataSetError("RESOLUTION_FAILED")`
- Invalid op order (sort before group) → `DataSetError("INVALID_OPERATION")`

---

## 8. Out of Scope

Items explicitly not included in this issue:

- **`DataSetRef` / data acquisition** — issue #6 (ExternalDataSetDef + typed data extraction)
- **`constraintsFromCapabilities()`** — requires `ComponentCapabilities` which doesn't exist yet
- **`DataService`** — the higher-level async wrapper that adds fetch, caching, IndexedDB
- **Events/listeners on register/remove** — no consumer exists; add when one does
- **`lookupDataSets()` (batch)** — the Java interface has it but no consumer exercises it beyond trivial loop; add when a real consumer needs it
