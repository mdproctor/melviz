import { describe, it, expect } from "vitest";
import { validateOpOrder } from "./ops.js";
import type { DataSetOp } from "./ops.js";
import type { FilterOp } from "./filter.js";
import type { GroupOp } from "./group.js";
import type { SortOp } from "./sort.js";
import type { ColumnId } from "./types.js";

const filter: FilterOp = { type: "filter", expressions: [] };
const group: GroupOp = { type: "group", groupingKey: null, columns: [] };
const sort: SortOp = { type: "sort", columns: [{ columnId: "x" as ColumnId, order: "ASCENDING" }] };

describe("validateOpOrder", () => {
  it("accepts empty ops", () => {
    expect(() => validateOpOrder([])).not.toThrow();
  });

  it("accepts F*G*S? patterns", () => {
    expect(() => validateOpOrder([filter])).not.toThrow();
    expect(() => validateOpOrder([filter, group])).not.toThrow();
    expect(() => validateOpOrder([filter, group, sort])).not.toThrow();
    expect(() => validateOpOrder([group, sort])).not.toThrow();
    expect(() => validateOpOrder([group, group])).not.toThrow();
    expect(() => validateOpOrder([sort])).not.toThrow();
    expect(() => validateOpOrder([filter, filter, group, group, sort])).not.toThrow();
  });

  it("rejects group before filter", () => {
    expect(() => validateOpOrder([group, filter])).toThrow("INVALID_OPERATION");
  });

  it("rejects sort before group", () => {
    expect(() => validateOpOrder([sort, group])).toThrow("INVALID_OPERATION");
  });

  it("rejects multiple sorts", () => {
    expect(() => validateOpOrder([sort, sort])).toThrow("INVALID_OPERATION");
  });

  it("rejects filter after group", () => {
    expect(() => validateOpOrder([filter, group, filter])).toThrow("INVALID_OPERATION");
  });

  it("rejects sort before filter", () => {
    expect(() => validateOpOrder([sort, filter])).toThrow("INVALID_OPERATION");
  });
});
