import { describe, it, expect } from "vitest";
import { toTypedDataSet, toWireDataSet } from "./conversion.js";
import type { DataSet, Column, ColumnId, TypedDataSet } from "./types.js";
import { ColumnType } from "./types.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

describe("toTypedDataSet", () => {
  it("parses a simple dataset with TEXT and NUMBER columns", () => {
    const ds: DataSet = {
      columns: [
        col("name", "Name", ColumnType.TEXT),
        col("revenue", "Revenue", ColumnType.NUMBER),
      ],
      data: [
        ["Acme", "100"],
        ["Beta", "250.5"],
      ],
    };

    const result = toTypedDataSet(ds);

    expect(result.columns).toEqual(ds.columns);
    expect(result.rows).toHaveLength(2);

    expect(result.rows[0]!.text("name" as ColumnId)).toBe("Acme");
    expect(result.rows[0]!.number("revenue" as ColumnId)).toBe(100);
    expect(result.rows[1]!.text("name" as ColumnId)).toBe("Beta");
    expect(result.rows[1]!.number("revenue" as ColumnId)).toBe(250.5);
  });

  it("parses DATE columns as UTC Dates", () => {
    const ds: DataSet = {
      columns: [col("date", "Date", ColumnType.DATE)],
      data: [["2024-06-15T10:30:00.000Z"]],
    };

    const result = toTypedDataSet(ds);
    const date = result.rows[0]!.date("date" as ColumnId);

    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  it("parses LABEL columns as strings", () => {
    const ds: DataSet = {
      columns: [col("region", "Region", ColumnType.LABEL)],
      data: [["US"], ["EU"]],
    };

    const result = toTypedDataSet(ds);

    expect(result.rows[0]!.text("region" as ColumnId)).toBe("US");
    expect(result.rows[0]!.cell("region" as ColumnId).type).toBe(ColumnType.LABEL);
  });

  it("throws DataSetError for unparseable NUMBER", () => {
    const ds: DataSet = {
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["not-a-number"]],
    };

    expect(() => toTypedDataSet(ds)).toThrow("SCHEMA_MISMATCH");
  });

  it("throws DataSetError for unparseable DATE", () => {
    const ds: DataSet = {
      columns: [col("date", "Date", ColumnType.DATE)],
      data: [["invalid-date"]],
    };

    expect(() => toTypedDataSet(ds)).toThrow("SCHEMA_MISMATCH");
  });

  it("handles empty dataset", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [],
    };

    const result = toTypedDataSet(ds);
    expect(result.rows).toHaveLength(0);
    expect(result.columns).toHaveLength(1);
  });

  it("cell() throws for unknown column ID", () => {
    const ds: DataSet = {
      columns: [col("name", "Name", ColumnType.TEXT)],
      data: [["Acme"]],
    };

    const result = toTypedDataSet(ds);
    expect(() => result.rows[0]!.cell("unknown" as ColumnId)).toThrow();
  });

  it("number() throws when called on a TEXT column", () => {
    const ds: DataSet = {
      columns: [col("name", "Name", ColumnType.TEXT)],
      data: [["Acme"]],
    };

    const result = toTypedDataSet(ds);
    expect(() => result.rows[0]!.number("name" as ColumnId)).toThrow();
  });

  it("returns immutable rows", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.NUMBER)],
      data: [["1"]],
    };

    const result = toTypedDataSet(ds);
    expect(Object.isFrozen(result.rows[0]!.cells)).toBe(true);
  });

  it("produces NULL cell for undefined raw value (short row)", () => {
    const ds: DataSet = {
      columns: [
        col("a", "A", ColumnType.TEXT),
        col("b", "B", ColumnType.NUMBER),
      ],
      data: [["hello"]],
    };
    const result = toTypedDataSet(ds);
    const cell = result.rows[0]!.cell("b" as ColumnId);
    expect(cell.type).toBe("NULL");
  });

  it("produces NULL cell for explicit null in data array", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [[null]],
    };
    const result = toTypedDataSet(ds);
    expect(result.rows[0]!.cell("x" as ColumnId).type).toBe("NULL");
  });

  it("preserves empty string as valid TEXT value, not null", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [[""]],
    };
    const result = toTypedDataSet(ds);
    const cell = result.rows[0]!.cell("x" as ColumnId);
    expect(cell.type).toBe(ColumnType.TEXT);
    expect((cell as { value: string }).value).toBe("");
  });

  it("text() throws on NULL cell", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [[null]],
    };
    const result = toTypedDataSet(ds);
    expect(() => result.rows[0]!.text("x" as ColumnId)).toThrow();
  });
});

describe("toWireDataSet", () => {
  it("serializes TypedDataSet back to string[][] wire format", () => {
    const ds: DataSet = {
      columns: [
        col("name", "Name", ColumnType.TEXT),
        col("revenue", "Revenue", ColumnType.NUMBER),
        col("date", "Date", ColumnType.DATE),
      ],
      data: [
        ["Acme", "100", "2024-06-15T10:30:00.000Z"],
      ],
    };

    const typed = toTypedDataSet(ds);
    const wire = toWireDataSet(typed);

    expect(wire.columns).toEqual(ds.columns);
    expect(wire.data).toHaveLength(1);
    expect(wire.data[0]![0]).toBe("Acme");
    expect(wire.data[0]![1]).toBe("100");
    expect(wire.data[0]![2]).toBe("2024-06-15T10:30:00.000Z");
  });

  it("round-trips through toTypedDataSet → toWireDataSet", () => {
    const ds: DataSet = {
      columns: [
        col("label", "Label", ColumnType.LABEL),
        col("count", "Count", ColumnType.NUMBER),
      ],
      data: [
        ["A", "1"],
        ["B", "2"],
      ],
    };

    const wire = toWireDataSet(toTypedDataSet(ds));
    expect(wire.data).toEqual(ds.data);
  });

  it("serializes NULL cell as null in wire format", () => {
    const ds: DataSet = {
      columns: [col("x", "X", ColumnType.TEXT)],
      data: [[null]],
    };
    const typed = toTypedDataSet(ds);
    const wire = toWireDataSet(typed);
    expect(wire.data[0]![0]).toBeNull();
  });

  it("round-trips null cells through toTypedDataSet → toWireDataSet", () => {
    const ds: DataSet = {
      columns: [
        col("a", "A", ColumnType.TEXT),
        col("b", "B", ColumnType.NUMBER),
      ],
      data: [["hello", null], [null, "42"]],
    };
    const wire = toWireDataSet(toTypedDataSet(ds));
    expect(wire.data[0]![0]).toBe("hello");
    expect(wire.data[0]![1]).toBeNull();
    expect(wire.data[1]![0]).toBeNull();
    expect(wire.data[1]![1]).toBe("42");
  });
});
