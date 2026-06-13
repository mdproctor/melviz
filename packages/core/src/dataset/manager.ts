import type { DataSetId, TypedDataSet, Column } from "./types.js";
import type { DataSetLookup } from "./lookup.js";
import type { DataSetOp, ResolvedDataSetOp } from "./ops.js";
import { applyOps } from "./ops.js";
import { resolveFilterTypes } from "./filter-resolve.js";
import { DataSetError } from "./errors.js";

export interface LookupOptions {
  readonly rowOffset?: number;
  readonly rowCount?: number;
  readonly referenceDate?: Date;
}

export interface DataSetManager {
  register(id: DataSetId, dataset: TypedDataSet): void;
  get(id: DataSetId): TypedDataSet | undefined;
  remove(id: DataSetId): boolean;
  has(id: DataSetId): boolean;
  accumulate(id: DataSetId, dataset: TypedDataSet, maxRows?: number): void;
  lookup(query: DataSetLookup, options?: LookupOptions): TypedDataSet;
}

function resolveOps(
  ops: readonly DataSetOp[],
  columns: readonly Column[],
): ResolvedDataSetOp[] {
  return ops.map(op => {
    if (op.type !== "filter") return op;
    return {
      type: "filter" as const,
      expressions: op.expressions.map(expr => resolveFilterTypes(expr, columns)),
    };
  });
}

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

class DataSetManagerImpl implements DataSetManager {
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

  accumulate(id: DataSetId, dataset: TypedDataSet, maxRows?: number): void {
    if (dataset.rows.length === 0) {
      if (!this.datasets.has(id)) {
        this.datasets.set(id, dataset);
      }
      return;
    }
    const existing = this.datasets.get(id);
    if (!existing) {
      this.datasets.set(id, dataset);
      return;
    }

    // Validate column schema compatibility before merging
    if (existing.columns.length !== dataset.columns.length) {
      throw new DataSetError(
        "SCHEMA_MISMATCH",
        `Column schema mismatch in accumulate: new dataset has ${dataset.columns.length} columns, expected ${existing.columns.length}`,
      );
    }
    for (let i = 0; i < existing.columns.length; i++) {
      const existingCol = existing.columns[i]!;
      const newCol = dataset.columns[i]!;
      if (existingCol.id !== newCol.id) {
        throw new DataSetError(
          "SCHEMA_MISMATCH",
          `Column schema mismatch in accumulate: column "${newCol.id}" at position ${i}, expected "${existingCol.id}"`,
        );
      }
      if (existingCol.type !== newCol.type) {
        throw new DataSetError(
          "SCHEMA_MISMATCH",
          `Column schema mismatch in accumulate: column "${newCol.id}" has type ${newCol.type}, expected ${existingCol.type}`,
        );
      }
    }

    const combined = [...dataset.rows, ...existing.rows];
    const rows = maxRows !== undefined && maxRows >= 0
      ? combined.slice(0, maxRows)
      : combined;
    this.datasets.set(id, { columns: dataset.columns, rows });
  }

  lookup(query: DataSetLookup, options?: LookupOptions): TypedDataSet {
    const offset = options?.rowOffset ?? 0;
    if (offset < 0) {
      throw new DataSetError("INVALID_OPERATION", `rowOffset cannot be negative: ${offset}`);
    }

    const dataset = this.datasets.get(query.dataSetId);
    if (!dataset) {
      throw new DataSetError("UNKNOWN_PROVIDER", `Dataset "${query.dataSetId}" not registered`);
    }

    const resolvedOps = resolveOps(query.operations, dataset.columns);
    const opsOptions = options?.referenceDate !== undefined ? { referenceDate: options.referenceDate } : undefined;
    const result = applyOps(dataset, resolvedOps, opsOptions);
    return paginate(result, offset, options?.rowCount ?? -1);
  }
}

export function createDataSetManager(): DataSetManager {
  return new DataSetManagerImpl();
}
