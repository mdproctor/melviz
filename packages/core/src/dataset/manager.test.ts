import { describe, it, expect } from "vitest";
import { createDataSetManager } from "./manager.js";
import { toTypedDataSet } from "./conversion.js";
import { createLookup } from "./lookup.js";
import type { Column, ColumnId, DataSetId } from "./types.js";
import { ColumnType } from "./types.js";
import type { ResolvedFilterOp, FilterOp } from "./filter.js";
import type { GroupOp } from "./group.js";
import type { SortOp } from "./sort.js";
import { parseTimeFrame } from "./timeframe.js";
import { DataSetError } from "./errors.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

function testDataSet(rows: (string | null)[][]) {
  return toTypedDataSet({
    columns: [
      col("name", "Name", ColumnType.LABEL),
      col("amount", "Amount", ColumnType.NUMBER),
    ],
    data: rows,
  });
}

const ID_A = "dataset-a" as DataSetId;
const ID_B = "dataset-b" as DataSetId;
const ID_UNKNOWN = "does-not-exist" as DataSetId;

describe("DataSetManager — registry", () => {
  it("register + get returns the same dataset", () => {
    const mgr = createDataSetManager();
    const ds = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, ds);
    expect(mgr.get(ID_A)).toBe(ds);
  });

  it("register overwrites existing dataset with same ID", () => {
    const mgr = createDataSetManager();
    const ds1 = testDataSet([["Alice", "100"]]);
    const ds2 = testDataSet([["Bob", "200"]]);
    mgr.register(ID_A, ds1);
    mgr.register(ID_A, ds2);
    expect(mgr.get(ID_A)).toBe(ds2);
  });

  it("get returns undefined for unknown ID", () => {
    const mgr = createDataSetManager();
    expect(mgr.get(ID_UNKNOWN)).toBeUndefined();
  });

  it("has returns true for registered ID", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, testDataSet([["Alice", "100"]]));
    expect(mgr.has(ID_A)).toBe(true);
  });

  it("has returns false for unknown ID", () => {
    const mgr = createDataSetManager();
    expect(mgr.has(ID_UNKNOWN)).toBe(false);
  });

  it("remove returns true and deletes registered dataset", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, testDataSet([["Alice", "100"]]));
    expect(mgr.remove(ID_A)).toBe(true);
    expect(mgr.get(ID_A)).toBeUndefined();
  });

  it("remove returns false for unknown ID", () => {
    const mgr = createDataSetManager();
    expect(mgr.remove(ID_UNKNOWN)).toBe(false);
  });
});

function salesDataSet() {
  return toTypedDataSet({
    columns: [
      col("dept", "Department", ColumnType.LABEL),
      col("revenue", "Revenue", ColumnType.NUMBER),
      col("date", "Date", ColumnType.DATE),
    ],
    data: [
      ["Sales", "100", "2024-01-15T00:00:00.000Z"],
      ["Engineering", "200", "2024-04-01T00:00:00.000Z"],
      ["Sales", "150", "2024-07-01T00:00:00.000Z"],
      ["Marketing", "50", "2023-06-01T00:00:00.000Z"],
      ["Engineering", "300", "2024-10-01T00:00:00.000Z"],
    ],
  });
}

const SALES_ID = "sales" as DataSetId;

describe("DataSetManager — lookup pipeline", () => {
  it("no operations returns full dataset unchanged", () => {
    const mgr = createDataSetManager();
    const ds = salesDataSet();
    mgr.register(SALES_ID, ds);
    const result = mgr.lookup(createLookup(SALES_ID, []));
    expect(result).toBe(ds);
  });

  it("resolved filter ops applied correctly", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "numeric",
        columnId: "revenue" as ColumnId,
        filter: { fn: "GREATER_THAN", value: 100 },
      }],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [filter]));
    expect(result.rows).toHaveLength(3);
  });

  it("unresolved filter ops resolved against column schema then applied", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const filter: FilterOp = {
      type: "filter",
      expressions: [{
        type: "unresolved",
        columnId: "revenue" as ColumnId,
        fn: "GREATER_THAN",
        args: ["100"],
      }],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [filter]));
    expect(result.rows).toHaveLength(3);
  });

  it("group ops applied correctly", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const group: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 15,
        emptyIntervals: false,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept" as ColumnId },
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
      ],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [group]));
    expect(result.rows).toHaveLength(3);
  });

  it("sort ops applied correctly", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const sort: SortOp = {
      type: "sort",
      columns: [{ columnId: "revenue" as ColumnId, order: "DESCENDING" }],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [sort]));
    expect(result.rows[0]!.number("revenue" as ColumnId)).toBe(300);
    expect(result.rows[4]!.number("revenue" as ColumnId)).toBe(50);
  });

  it("filter + group + sort full pipeline", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "numeric",
        columnId: "revenue" as ColumnId,
        filter: { fn: "GREATER_OR_EQUALS_TO", value: 100 },
      }],
    };
    const group: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 15,
        emptyIntervals: false,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept" as ColumnId },
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
      ],
    };
    const sort: SortOp = {
      type: "sort",
      columns: [{ columnId: "total" as ColumnId, order: "DESCENDING" }],
    };
    const result = mgr.lookup(createLookup(SALES_ID, [filter, group, sort]));
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.text("dept" as ColumnId)).toBe("Engineering");
    expect(result.rows[0]!.number("total" as ColumnId)).toBe(500);
    expect(result.rows[1]!.text("dept" as ColumnId)).toBe("Sales");
    expect(result.rows[1]!.number("total" as ColumnId)).toBe(250);
  });

  it("TIME_FRAME filter with explicit referenceDate — deterministic", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const timeFrame = parseTimeFrame("begin[year] till end[year]");
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "date",
        columnId: "date" as ColumnId,
        filter: { fn: "TIME_FRAME", timeFrame },
      }],
    };
    const refDate = new Date(Date.UTC(2024, 5, 1));
    const result = mgr.lookup(
      createLookup(SALES_ID, [filter]),
      { referenceDate: refDate },
    );
    expect(result.rows).toHaveLength(4);
  });
});

describe("DataSetManager — pagination", () => {
  function setupManager() {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    return mgr;
  }

  it("no options returns all rows", () => {
    const result = setupManager().lookup(createLookup(SALES_ID, []));
    expect(result.rows).toHaveLength(5);
  });

  it("explicit defaults return all rows", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 0, rowCount: -1 },
    );
    expect(result.rows).toHaveLength(5);
  });

  it("rowOffset + rowCount slices correctly", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 1, rowCount: 2 },
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.number("revenue" as ColumnId)).toBe(200);
    expect(result.rows[1]!.number("revenue" as ColumnId)).toBe(150);
  });

  it("rowCount: 0 returns zero rows", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 0, rowCount: 0 },
    );
    expect(result.rows).toHaveLength(0);
  });

  it("rowOffset beyond dataset length returns zero rows", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 100, rowCount: 10 },
    );
    expect(result.rows).toHaveLength(0);
  });

  it("rowCount: -1 with offset returns all rows from offset", () => {
    const result = setupManager().lookup(
      createLookup(SALES_ID, []),
      { rowOffset: 3, rowCount: -1 },
    );
    expect(result.rows).toHaveLength(2);
  });

  it("pagination applies after ops", () => {
    const mgr = setupManager();
    const sort: SortOp = {
      type: "sort",
      columns: [{ columnId: "revenue" as ColumnId, order: "ASCENDING" }],
    };
    const result = mgr.lookup(
      createLookup(SALES_ID, [sort]),
      { rowOffset: 0, rowCount: 2 },
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.number("revenue" as ColumnId)).toBe(50);
    expect(result.rows[1]!.number("revenue" as ColumnId)).toBe(100);
  });
});

describe("DataSetManager — error paths", () => {
  it("unknown dataset ID throws UNKNOWN_PROVIDER", () => {
    const mgr = createDataSetManager();
    expect(() => mgr.lookup(createLookup(ID_UNKNOWN, []))).toThrow(DataSetError);
    expect(() => mgr.lookup(createLookup(ID_UNKNOWN, []))).toThrow("UNKNOWN_PROVIDER");
  });

  it("filter referencing unknown column throws UNKNOWN_COLUMN", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const filter: FilterOp = {
      type: "filter",
      expressions: [{
        type: "unresolved",
        columnId: "nonexistent" as ColumnId,
        fn: "EQUALS_TO",
        args: ["x"],
      }],
    };
    expect(() => mgr.lookup(createLookup(SALES_ID, [filter]))).toThrow("UNKNOWN_COLUMN");
  });

  it("invalid function/type combo throws RESOLUTION_FAILED", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const filter: FilterOp = {
      type: "filter",
      expressions: [{
        type: "unresolved",
        columnId: "revenue" as ColumnId,
        fn: "LIKE_TO",
        args: ["%test%"],
      }],
    };
    expect(() => mgr.lookup(createLookup(SALES_ID, [filter]))).toThrow("RESOLUTION_FAILED");
  });

  it("negative rowOffset throws INVALID_OPERATION", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    expect(() => mgr.lookup(
      createLookup(SALES_ID, []),
      { rowOffset: -1 },
    )).toThrow("INVALID_OPERATION");
  });

  it("raw-object DataSetLookup with invalid op order throws INVALID_OPERATION", () => {
    const mgr = createDataSetManager();
    mgr.register(SALES_ID, salesDataSet());
    const sort: SortOp = { type: "sort", columns: [{ columnId: "revenue" as ColumnId, order: "ASCENDING" }] };
    const group: GroupOp = { type: "group", groupingKey: null, columns: [] };
    const rawLookup = { dataSetId: SALES_ID, operations: [sort, group] } as const;
    expect(() => mgr.lookup(rawLookup)).toThrow("INVALID_OPERATION");
  });
});

describe("DataSetManager — accumulate", () => {
  it("accumulate on empty registry behaves like register", () => {
    const mgr = createDataSetManager();
    const ds = testDataSet([["Alice", "100"]]);
    mgr.accumulate(ID_A, ds);
    const stored = mgr.get(ID_A);
    expect(stored).toBeDefined();
    expect(stored!.rows).toHaveLength(1);
    expect(stored!.rows[0]!.text("name" as ColumnId)).toBe("Alice");
  });

  it("accumulate puts new rows first, then appends old rows", () => {
    const mgr = createDataSetManager();
    const old = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, old);
    const fresh = testDataSet([["Bob", "200"]]);
    mgr.accumulate(ID_A, fresh);
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows[0]!.text("name" as ColumnId)).toBe("Bob");
    expect(stored.rows[1]!.text("name" as ColumnId)).toBe("Alice");
  });

  it("accumulate trims oldest rows when maxRows exceeded", () => {
    const mgr = createDataSetManager();
    const old = testDataSet([["Alice", "100"], ["Bob", "200"]]);
    mgr.register(ID_A, old);
    const fresh = testDataSet([["Charlie", "300"]]);
    mgr.accumulate(ID_A, fresh, 2);
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(2);
    expect(stored.rows[0]!.text("name" as ColumnId)).toBe("Charlie");
    expect(stored.rows[1]!.text("name" as ColumnId)).toBe("Alice");
  });

  it("accumulate with zero new rows preserves existing dataset", () => {
    const mgr = createDataSetManager();
    const existing = testDataSet([["Alice", "100"]]);
    mgr.register(ID_A, existing);
    const empty = testDataSet([]);
    mgr.accumulate(ID_A, empty);
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]!.text("name" as ColumnId)).toBe("Alice");
  });

  it("accumulate with no maxRows appends all rows", () => {
    const mgr = createDataSetManager();
    const old = testDataSet([["Alice", "100"], ["Bob", "200"]]);
    mgr.register(ID_A, old);
    const fresh = testDataSet([["Charlie", "300"], ["Diana", "400"]]);
    mgr.accumulate(ID_A, fresh);
    const stored = mgr.get(ID_A)!;
    expect(stored.rows).toHaveLength(4);
    expect(stored.rows[0]!.text("name" as ColumnId)).toBe("Charlie");
    expect(stored.rows[1]!.text("name" as ColumnId)).toBe("Diana");
    expect(stored.rows[2]!.text("name" as ColumnId)).toBe("Alice");
    expect(stored.rows[3]!.text("name" as ColumnId)).toBe("Bob");
  });

  it("accumulate throws SCHEMA_MISMATCH when column schemas differ", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, testDataSet([["Alice", "100"]]));

    // Different schema — LABEL column instead of NUMBER for amount
    const differentSchema = toTypedDataSet({
      columns: [
        col("name", "Name", ColumnType.LABEL),
        col("amount", "Amount", ColumnType.LABEL),
      ],
      data: [["Bob", "text"]],
    });

    expect(() => mgr.accumulate(ID_A, differentSchema)).toThrow(DataSetError);
    // Existing dataset preserved
    expect(mgr.get(ID_A)!.rows).toHaveLength(1);
    expect(mgr.get(ID_A)!.rows[0]!.text("name" as ColumnId)).toBe("Alice");
  });
});
