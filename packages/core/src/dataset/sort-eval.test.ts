import { describe, it, expect } from "vitest";
import { applySort } from "./sort-eval.js";
import { toTypedDataSet } from "./conversion.js";
import type { Column, ColumnId } from "./types.js";
import { ColumnType } from "./types.js";
import type { SortOp } from "./sort.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

function extractValue(cell: any) {
  return cell.type === "NULL" ? null : cell.value;
}

describe("applySort", () => {
  it("sorts numbers ascending", () => {
    const ds = toTypedDataSet({
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["30"], ["10"], ["20"]],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "val" as ColumnId, order: "ASCENDING" }],
    };
    const result = applySort(ds, op);
    expect(result.rows.map((r) => extractValue(r.cells[0]))).toEqual([10, 20, 30]);
  });

  it("sorts numbers descending", () => {
    const ds = toTypedDataSet({
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["10"], ["30"], ["20"]],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "val" as ColumnId, order: "DESCENDING" }],
    };
    const result = applySort(ds, op);
    expect(result.rows.map((r) => extractValue(r.cells[0]))).toEqual([30, 20, 10]);
  });

  it("multi-column sort: dept ASC then value ASC", () => {
    const ds = toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.TEXT),
        col("val", "Value", ColumnType.NUMBER),
      ],
      data: [
        ["B", "2"],
        ["A", "3"],
        ["A", "1"],
      ],
    });
    const op: SortOp = {
      type: "sort",
      columns: [
        { columnId: "dept" as ColumnId, order: "ASCENDING" },
        { columnId: "val" as ColumnId, order: "ASCENDING" },
      ],
    };
    const result = applySort(ds, op);
    expect(result.rows.map((r) => [extractValue(r.cells[0]), extractValue(r.cells[1])])).toEqual([
      ["A", 1],
      ["A", 3],
      ["B", 2],
    ]);
  });

  it("NULLs sort last in ascending", () => {
    const ds = toTypedDataSet({
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["20"], [null], ["10"]],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "val" as ColumnId, order: "ASCENDING" }],
    };
    const result = applySort(ds, op);
    expect(result.rows.map((r) => extractValue(r.cells[0]))).toEqual([10, 20, null]);
  });

  it("NULLs sort last in descending", () => {
    const ds = toTypedDataSet({
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["20"], [null], ["10"]],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "val" as ColumnId, order: "DESCENDING" }],
    };
    const result = applySort(ds, op);
    expect(result.rows.map((r) => extractValue(r.cells[0]))).toEqual([20, 10, null]);
  });

  it("unknown column throws UNKNOWN_COLUMN error", () => {
    const ds = toTypedDataSet({
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["10"]],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "missing" as ColumnId, order: "ASCENDING" }],
    };
    expect(() => applySort(ds, op)).toThrow("UNKNOWN_COLUMN");
  });

  it("stable sort preserves original order for equal elements", () => {
    const ds = toTypedDataSet({
      columns: [
        col("key", "Key", ColumnType.TEXT),
        col("seq", "Sequence", ColumnType.NUMBER),
      ],
      data: [
        ["A", "1"],
        ["A", "2"],
        ["A", "3"],
      ],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "key" as ColumnId, order: "ASCENDING" }],
    };
    const result = applySort(ds, op);
    expect(result.rows.map((r) => [extractValue(r.cells[0]), extractValue(r.cells[1])])).toEqual([
      ["A", 1],
      ["A", 2],
      ["A", 3],
    ]);
  });

  it("sorts dates by timestamp", () => {
    const ds = toTypedDataSet({
      columns: [col("date", "Date", ColumnType.DATE)],
      data: [["2024-12-31"], ["2024-01-01"], ["2024-06-15"]],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "date" as ColumnId, order: "ASCENDING" }],
    };
    const result = applySort(ds, op);
    const dates = result.rows.map((r) => extractValue(r.cells[0]));
    expect(dates[0]?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(dates[1]?.toISOString()).toBe("2024-06-15T00:00:00.000Z");
    expect(dates[2]?.toISOString()).toBe("2024-12-31T00:00:00.000Z");
  });

  it("sorts labels/text by Unicode codepoint", () => {
    const ds = toTypedDataSet({
      columns: [col("label", "Label", ColumnType.LABEL)],
      data: [["zebra"], ["apple"], ["banana"]],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "label" as ColumnId, order: "ASCENDING" }],
    };
    const result = applySort(ds, op);
    expect(result.rows.map((r) => extractValue(r.cells[0]))).toEqual(["apple", "banana", "zebra"]);
  });

  it("empty dataset returns empty dataset", () => {
    const ds = toTypedDataSet({
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "val" as ColumnId, order: "ASCENDING" }],
    };
    const result = applySort(ds, op);
    expect(result.rows).toEqual([]);
  });

  it("single row returns same row", () => {
    const ds = toTypedDataSet({
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["42"]],
    });
    const op: SortOp = {
      type: "sort",
      columns: [{ columnId: "val" as ColumnId, order: "ASCENDING" }],
    };
    const result = applySort(ds, op);
    expect(result.rows.map((r) => extractValue(r.cells[0]))).toEqual([42]);
  });
});
