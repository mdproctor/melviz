import { describe, it, expect } from "vitest";
import { validateOpOrder, applyOps } from "./ops.js";
import type { DataSetOp } from "./ops.js";
import type { ResolvedFilterOp } from "./filter.js";
import type { GroupOp } from "./group.js";
import type { SortOp } from "./sort.js";
import type { ColumnId, Column } from "./types.js";
import { ColumnType } from "./types.js";
import { toTypedDataSet } from "./conversion.js";
import { parseTimeFrame } from "./timeframe.js";

const filter: ResolvedFilterOp = { type: "filter", expressions: [] };
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

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

describe("applyOps", () => {
  const salesData = toTypedDataSet({
    columns: [
      col("dept", "Department", ColumnType.LABEL),
      col("revenue", "Revenue", ColumnType.NUMBER),
    ],
    data: [
      ["Sales", "100"],
      ["Engineering", "200"],
      ["Sales", "150"],
      ["Marketing", "50"],
      ["Engineering", "300"],
      ["Marketing", "75"],
    ],
  });

  it("empty ops returns dataset unchanged", () => {
    const result = applyOps(salesData, []);
    expect(result.rows).toHaveLength(6);
  });

  it("filter only", () => {
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "numeric",
        columnId: "revenue" as ColumnId,
        filter: { fn: "GREATER_THAN", value: 100 },
      }],
    };
    const result = applyOps(salesData, [filter]);
    expect(result.rows).toHaveLength(3); // 200, 150, 300
  });

  it("filter → group → sort pipeline", () => {
    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "numeric",
        columnId: "revenue" as ColumnId,
        filter: { fn: "GREATER_OR_EQUALS_TO", value: 75 },
      }],
    };
    // Keeps: Sales/100, Eng/200, Sales/150, Eng/300, Marketing/75 (5 rows)

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

    const result = applyOps(salesData, [filter, group, sort]);
    expect(result.rows).toHaveLength(3); // Sales, Engineering, Marketing
    // Engineering: 200+300=500, Sales: 100+150=250, Marketing: 75
    expect(result.rows[0]!.cell("dept" as ColumnId)).toEqual({ type: ColumnType.LABEL, value: "Engineering" });
    expect(result.rows[0]!.number("total" as ColumnId)).toBe(500);
    expect(result.rows[1]!.cell("dept" as ColumnId)).toEqual({ type: ColumnType.LABEL, value: "Sales" });
    expect(result.rows[1]!.number("total" as ColumnId)).toBe(250);
    expect(result.rows[2]!.cell("dept" as ColumnId)).toEqual({ type: ColumnType.LABEL, value: "Marketing" });
    expect(result.rows[2]!.number("total" as ColumnId)).toBe(75);
  });

  it("invalid ordering → INVALID_OPERATION", () => {
    const group: GroupOp = { type: "group", groupingKey: null, columns: [] };
    const filter: ResolvedFilterOp = { type: "filter", expressions: [] };
    expect(() => applyOps(salesData, [group, filter])).toThrow("INVALID_OPERATION");
  });

  it("group only — whole-dataset aggregation", () => {
    const group: GroupOp = {
      type: "group",
      groupingKey: null,
      columns: [
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "count" as ColumnId, fn: { fn: "COUNT" } },
      ],
    };
    const result = applyOps(salesData, [group]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.number("total" as ColumnId)).toBe(875); // 100+200+150+50+300+75
    expect(result.rows[0]!.number("count" as ColumnId)).toBe(6);
  });

  it("sort only", () => {
    const sort: SortOp = {
      type: "sort",
      columns: [{ columnId: "revenue" as ColumnId, order: "ASCENDING" }],
    };
    const result = applyOps(salesData, [sort]);
    expect(result.rows).toHaveLength(6);
    expect(result.rows[0]!.number("revenue" as ColumnId)).toBe(50);
    expect(result.rows[5]!.number("revenue" as ColumnId)).toBe(300);
  });

  it("forwards referenceDate to filter for TIME_FRAME evaluation", () => {
    const refDate = new Date(Date.UTC(2024, 5, 15)); // June 15, 2024
    const timeFrame = parseTimeFrame("begin[year] till end[year]");

    const ds = toTypedDataSet({
      columns: [
        col("date", "Date", ColumnType.DATE),
        col("label", "Label", ColumnType.LABEL),
      ],
      data: [
        ["2024-03-01T00:00:00.000Z", "in-range"],
        ["2023-06-01T00:00:00.000Z", "out-of-range"],
        ["2024-11-01T00:00:00.000Z", "in-range"],
      ],
    });

    const filter: ResolvedFilterOp = {
      type: "filter",
      expressions: [{
        type: "date",
        columnId: "date" as ColumnId,
        filter: { fn: "TIME_FRAME", timeFrame },
      }],
    };

    const result = applyOps(ds, [filter], { referenceDate: refDate });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.text("label" as ColumnId)).toBe("in-range");
    expect(result.rows[1]!.text("label" as ColumnId)).toBe("in-range");
  });
});
