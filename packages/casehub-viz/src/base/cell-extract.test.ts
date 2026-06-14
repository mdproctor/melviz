import { describe, it, expect } from "vitest";
import { cellToRaw, resolveColumnName } from "./cell-extract.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";
import type { Column, ColumnId, ColumnSettings } from "@casehub/data/dist/dataset/types.js";

describe("cellToRaw", () => {
  it("extracts number value", () => {
    expect(cellToRaw({ type: ColumnType.NUMBER, value: 42 })).toBe(42);
  });

  it("extracts string value from LABEL", () => {
    expect(cellToRaw({ type: ColumnType.LABEL, value: "hello" })).toBe("hello");
  });

  it("extracts string value from TEXT", () => {
    expect(cellToRaw({ type: ColumnType.TEXT, value: "text" })).toBe("text");
  });

  it("extracts Date value", () => {
    const d = new Date("2024-01-01");
    expect(cellToRaw({ type: ColumnType.DATE, value: d })).toBe(d);
  });

  it("returns null for NULL cell", () => {
    expect(cellToRaw({ type: "NULL" })).toBeNull();
  });
});

describe("resolveColumnName", () => {
  const col: Column = {
    id: "revenue" as ColumnId,
    name: "revenue",
    type: ColumnType.NUMBER,
  };

  it("returns column.name when no overrides", () => {
    expect(resolveColumnName(col)).toBe("revenue");
  });

  it("returns override name from propsColumns", () => {
    const overrides: ColumnSettings[] = [
      { id: "revenue" as ColumnId, name: "Total Revenue" },
    ];
    expect(resolveColumnName(col, overrides)).toBe("Total Revenue");
  });

  it("returns column.settings.name when no propsColumns match", () => {
    const colWithSettings: Column = {
      ...col,
      settings: { id: "revenue" as ColumnId, name: "Rev" },
    };
    expect(resolveColumnName(colWithSettings)).toBe("Rev");
  });

  it("propsColumns takes priority over settings.name", () => {
    const colWithSettings: Column = {
      ...col,
      settings: { id: "revenue" as ColumnId, name: "Rev" },
    };
    const overrides: ColumnSettings[] = [
      { id: "revenue" as ColumnId, name: "Override" },
    ];
    expect(resolveColumnName(colWithSettings, overrides)).toBe("Override");
  });

  it("ignores propsColumns with non-matching id", () => {
    const overrides: ColumnSettings[] = [
      { id: "other" as ColumnId, name: "Other" },
    ];
    expect(resolveColumnName(col, overrides)).toBe("revenue");
  });
});
