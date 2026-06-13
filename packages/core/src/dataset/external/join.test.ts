import { describe, it, expect } from "vitest";
import { joinDataSets } from "./join.js";
import { createDataSetManager } from "../manager.js";
import { toTypedDataSet } from "../conversion.js";
import type { Column, ColumnId, DataSetId } from "../types.js";
import { ColumnType } from "../types.js";
import { DataSetError } from "../errors.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

const COLS = [col("name", "Name", ColumnType.LABEL), col("value", "Value", ColumnType.NUMBER)];

function makeDs(rows: (string | null)[][]) {
  return toTypedDataSet({ columns: COLS, data: rows });
}

const ID_A = "ds-a" as DataSetId;
const ID_B = "ds-b" as DataSetId;
const ID_C = "ds-c" as DataSetId;

describe("joinDataSets", () => {
  it("joins two datasets with matching schemas", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, makeDs([["Alice", "100"]]));
    mgr.register(ID_B, makeDs([["Bob", "200"]]));
    const result = joinDataSets([ID_A, ID_B], mgr);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.text("name" as ColumnId)).toBe("Alice");
    expect(result.rows[1]!.text("name" as ColumnId)).toBe("Bob");
  });

  it("joins three datasets", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, makeDs([["Alice", "100"]]));
    mgr.register(ID_B, makeDs([["Bob", "200"]]));
    mgr.register(ID_C, makeDs([["Charlie", "300"]]));
    const result = joinDataSets([ID_A, ID_B, ID_C], mgr);
    expect(result.rows).toHaveLength(3);
  });

  it("throws UNKNOWN_PROVIDER for missing dataset", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, makeDs([["Alice", "100"]]));
    expect(() => joinDataSets([ID_A, ID_B], mgr))
      .toThrow(DataSetError);
    try {
      joinDataSets([ID_A, ID_B], mgr);
    } catch (e) {
      expect((e as DataSetError).code).toBe("UNKNOWN_PROVIDER");
    }
  });

  it("throws SCHEMA_MISMATCH for different column types", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, makeDs([["Alice", "100"]]));
    const differentCols = [col("name", "Name", ColumnType.LABEL), col("value", "Value", ColumnType.LABEL)];
    mgr.register(ID_B, toTypedDataSet({ columns: differentCols, data: [["Bob", "text"]] }));
    expect(() => joinDataSets([ID_A, ID_B], mgr)).toThrow(DataSetError);
    try {
      joinDataSets([ID_A, ID_B], mgr);
    } catch (e) {
      expect((e as DataSetError).code).toBe("SCHEMA_MISMATCH");
    }
  });

  it("throws SCHEMA_MISMATCH for different column IDs", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, makeDs([["Alice", "100"]]));
    const differentCols = [col("x", "X", ColumnType.LABEL), col("y", "Y", ColumnType.NUMBER)];
    mgr.register(ID_B, toTypedDataSet({ columns: differentCols, data: [["Bob", "200"]] }));
    expect(() => joinDataSets([ID_A, ID_B], mgr)).toThrow(DataSetError);
  });

  it("throws SCHEMA_MISMATCH for different column count", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, makeDs([["Alice", "100"]]));
    const threeCols = [...COLS, col("extra", "Extra", ColumnType.TEXT)];
    mgr.register(ID_B, toTypedDataSet({ columns: threeCols, data: [["Bob", "200", "x"]] }));
    expect(() => joinDataSets([ID_A, ID_B], mgr)).toThrow(DataSetError);
  });

  it("single dataset join returns its rows", () => {
    const mgr = createDataSetManager();
    mgr.register(ID_A, makeDs([["Alice", "100"], ["Bob", "200"]]));
    const result = joinDataSets([ID_A], mgr);
    expect(result.rows).toHaveLength(2);
  });
});
