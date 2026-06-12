import { describe, it, expect } from "vitest";
import { createLookup } from "./lookup.js";
import type { ColumnId, DataSetId } from "./types.js";
import type { ResolvedFilterOp } from "./filter.js";
import type { GroupOp } from "./group.js";
import type { SortOp } from "./sort.js";
import { DataSetError } from "./errors.js";

function dsId(id: string): DataSetId {
  return id as DataSetId;
}

describe("createLookup", () => {
  it("creates a lookup with valid ops", () => {
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{ type: "numeric", columnId: "x" as ColumnId, filter: { fn: "IS_NULL" } }],
    };
    const lookup = createLookup(dsId("test"), [filter]);
    expect(lookup.dataSetId).toBe("test");
    expect(lookup.operations).toHaveLength(1);
    expect(lookup.operations[0]!.type).toBe("filter");
  });

  it("creates a lookup with empty ops", () => {
    const lookup = createLookup(dsId("test"), []);
    expect(lookup.operations).toHaveLength(0);
  });

  it("throws on invalid op order (sort before group)", () => {
    const sort: SortOp = { type: "sort", columns: [{ columnId: "x" as ColumnId, order: "ASCENDING" }] };
    const group: GroupOp = {
      type: "group",
      groupingKey: null,
      columns: [{ kind: "aggregate", sourceId: "x" as ColumnId, columnId: "x" as ColumnId, fn: { fn: "COUNT" } }],
    };
    expect(() => createLookup(dsId("test"), [sort, group])).toThrow(DataSetError);
  });

  it("lookup is frozen", () => {
    const lookup = createLookup(dsId("test"), []);
    expect(Object.isFrozen(lookup)).toBe(true);
  });
});
