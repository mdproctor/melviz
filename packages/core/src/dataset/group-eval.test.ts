import { describe, it, expect } from "vitest";
import {
  computeAggregation,
  buildDistinctIntervals,
  buildFixedCalendarIntervals,
  buildDynamicDateIntervals,
  buildDynamicNumberIntervals,
  applyGroup,
  applyGroupSequence,
} from "./group-eval.js";
import type { CellValue, Column, ColumnId } from "./types.js";
import { ColumnType } from "./types.js";
import { toTypedDataSet } from "./conversion.js";
import type { GroupOp, ResultColumn } from "./group.js";
import { DataSetError } from "./errors.js";

// Test helpers
function num(v: number): CellValue {
  return { type: ColumnType.NUMBER, value: v };
}
function text(v: string): CellValue {
  return { type: ColumnType.TEXT, value: v };
}
function label(v: string): CellValue {
  return { type: ColumnType.LABEL, value: v };
}
function date(y: number, m: number, d: number, h = 0, min = 0, sec = 0): CellValue {
  return { type: ColumnType.DATE, value: new Date(Date.UTC(y, m - 1, d, h, min, sec)) };
}
const NULL: CellValue = { type: "NULL" };

describe("computeAggregation", () => {
  describe("COUNT", () => {
    it("counts all rows including NULLs", () => {
      expect(computeAggregation({ fn: "COUNT" }, [num(1), num(2), num(3)])).toEqual(num(3));
      expect(computeAggregation({ fn: "COUNT" }, [num(1), NULL, num(3)])).toEqual(num(3));
    });

    it("returns 0 for empty input", () => {
      expect(computeAggregation({ fn: "COUNT" }, [])).toEqual(num(0));
    });

    it("returns N for N NULLs", () => {
      expect(computeAggregation({ fn: "COUNT" }, [NULL, NULL, NULL])).toEqual(num(3));
    });
  });

  describe("DISTINCT", () => {
    it("counts unique values", () => {
      expect(computeAggregation({ fn: "DISTINCT" }, [num(1), num(2), num(1), num(3)])).toEqual(
        num(3),
      );
    });

    it("treats NULL as one distinct value", () => {
      expect(computeAggregation({ fn: "DISTINCT" }, [num(1), NULL, NULL, num(2)])).toEqual(
        num(3),
      );
    });

    it("compares NUMBERs by value", () => {
      expect(computeAggregation({ fn: "DISTINCT" }, [num(1.5), num(1.5)])).toEqual(num(1));
    });

    it("compares DATEs by timestamp", () => {
      expect(computeAggregation({ fn: "DISTINCT" }, [date(2024, 1, 1), date(2024, 1, 1)])).toEqual(
        num(1),
      );
      expect(computeAggregation({ fn: "DISTINCT" }, [date(2024, 1, 1), date(2024, 1, 2)])).toEqual(
        num(2),
      );
    });

    it("compares TEXT/LABEL by string value", () => {
      expect(computeAggregation({ fn: "DISTINCT" }, [text("a"), text("a")])).toEqual(num(1));
      expect(computeAggregation({ fn: "DISTINCT" }, [label("a"), label("a")])).toEqual(num(1));
      expect(computeAggregation({ fn: "DISTINCT" }, [text("a"), text("b")])).toEqual(num(2));
    });

    it("returns 0 for empty input", () => {
      expect(computeAggregation({ fn: "DISTINCT" }, [])).toEqual(num(0));
    });

    it("returns 1 for all NULLs", () => {
      expect(computeAggregation({ fn: "DISTINCT" }, [NULL, NULL])).toEqual(num(1));
    });
  });

  describe("SUM", () => {
    it("sums all non-null NUMBER values", () => {
      expect(computeAggregation({ fn: "SUM" }, [num(1), num(2), num(3)])).toEqual(num(6));
    });

    it("skips NULLs", () => {
      expect(computeAggregation({ fn: "SUM" }, [num(1), NULL, num(3)])).toEqual(num(4));
    });

    it("returns 0 for empty input", () => {
      expect(computeAggregation({ fn: "SUM" }, [])).toEqual(num(0));
    });

    it("returns 0 for all NULLs", () => {
      expect(computeAggregation({ fn: "SUM" }, [NULL, NULL])).toEqual(num(0));
    });

    it("handles negative numbers", () => {
      expect(computeAggregation({ fn: "SUM" }, [num(10), num(-3), num(-2)])).toEqual(num(5));
    });

    it("handles floating point without rounding", () => {
      expect(computeAggregation({ fn: "SUM" }, [num(0.1), num(0.2)])).toEqual(num(0.1 + 0.2));
    });
  });

  describe("AVERAGE", () => {
    it("averages non-null NUMBER values", () => {
      expect(computeAggregation({ fn: "AVERAGE" }, [num(2), num(4), num(6)])).toEqual(num(4));
    });

    it("skips NULLs from both sum and count", () => {
      expect(computeAggregation({ fn: "AVERAGE" }, [num(2), NULL, num(6)])).toEqual(num(4));
    });

    it("returns NULL for empty input", () => {
      expect(computeAggregation({ fn: "AVERAGE" }, [])).toEqual(NULL);
    });

    it("returns NULL for all NULLs", () => {
      expect(computeAggregation({ fn: "AVERAGE" }, [NULL, NULL])).toEqual(NULL);
    });

    it("produces exact IEEE 754 result without rounding", () => {
      expect(computeAggregation({ fn: "AVERAGE" }, [num(1), num(2)])).toEqual(num(1.5));
      expect(computeAggregation({ fn: "AVERAGE" }, [num(0.1), num(0.2)])).toEqual(
        num((0.1 + 0.2) / 2),
      );
    });
  });

  describe("MEDIAN", () => {
    it("returns middle element for odd count", () => {
      expect(computeAggregation({ fn: "MEDIAN" }, [num(1), num(3), num(2)])).toEqual(num(2));
      expect(computeAggregation({ fn: "MEDIAN" }, [num(5), num(1), num(3)])).toEqual(num(3));
    });

    it("returns average of two middle elements for even count", () => {
      expect(computeAggregation({ fn: "MEDIAN" }, [num(1), num(2), num(3), num(4)])).toEqual(
        num(2.5),
      );
      expect(computeAggregation({ fn: "MEDIAN" }, [num(4), num(1), num(2), num(3)])).toEqual(
        num(2.5),
      );
    });

    it("skips NULLs", () => {
      expect(computeAggregation({ fn: "MEDIAN" }, [num(1), NULL, num(3)])).toEqual(num(2));
      expect(
        computeAggregation({ fn: "MEDIAN" }, [num(1), NULL, num(2), num(3), num(4)]),
      ).toEqual(num(2.5));
    });

    it("returns NULL for empty input", () => {
      expect(computeAggregation({ fn: "MEDIAN" }, [])).toEqual(NULL);
    });

    it("returns NULL for all NULLs", () => {
      expect(computeAggregation({ fn: "MEDIAN" }, [NULL, NULL])).toEqual(NULL);
    });

    it("handles single value", () => {
      expect(computeAggregation({ fn: "MEDIAN" }, [num(42)])).toEqual(num(42));
    });

    it("produces exact IEEE 754 result for even count", () => {
      expect(computeAggregation({ fn: "MEDIAN" }, [num(1), num(2)])).toEqual(num(1.5));
    });
  });

  describe("MIN", () => {
    it("finds smallest NUMBER", () => {
      expect(computeAggregation({ fn: "MIN" }, [num(3), num(1), num(2)])).toEqual(num(1));
    });

    it("finds earliest DATE by timestamp", () => {
      const early = date(2024, 1, 1);
      const late = date(2024, 12, 31);
      expect(computeAggregation({ fn: "MIN" }, [late, early])).toEqual(early);
    });

    it("finds smallest TEXT by Unicode codepoint", () => {
      expect(computeAggregation({ fn: "MIN" }, [text("c"), text("a"), text("b")])).toEqual(
        text("a"),
      );
    });

    it("finds smallest LABEL by Unicode codepoint", () => {
      expect(computeAggregation({ fn: "MIN" }, [label("c"), label("a"), label("b")])).toEqual(
        label("a"),
      );
    });

    it("skips NULLs", () => {
      expect(computeAggregation({ fn: "MIN" }, [num(3), NULL, num(1)])).toEqual(num(1));
    });

    it("returns NULL for empty input", () => {
      expect(computeAggregation({ fn: "MIN" }, [])).toEqual(NULL);
    });

    it("returns NULL for all NULLs", () => {
      expect(computeAggregation({ fn: "MIN" }, [NULL, NULL])).toEqual(NULL);
    });

    it("preserves original CellValue type tag", () => {
      const result = computeAggregation({ fn: "MIN" }, [num(3), num(1), num(2)]);
      expect(result.type).toBe(ColumnType.NUMBER);
    });
  });

  describe("MAX", () => {
    it("finds largest NUMBER", () => {
      expect(computeAggregation({ fn: "MAX" }, [num(3), num(1), num(2)])).toEqual(num(3));
    });

    it("finds latest DATE by timestamp", () => {
      const early = date(2024, 1, 1);
      const late = date(2024, 12, 31);
      expect(computeAggregation({ fn: "MAX" }, [early, late])).toEqual(late);
    });

    it("finds largest TEXT by Unicode codepoint", () => {
      expect(computeAggregation({ fn: "MAX" }, [text("c"), text("a"), text("b")])).toEqual(
        text("c"),
      );
    });

    it("finds largest LABEL by Unicode codepoint", () => {
      expect(computeAggregation({ fn: "MAX" }, [label("c"), label("a"), label("b")])).toEqual(
        label("c"),
      );
    });

    it("skips NULLs", () => {
      expect(computeAggregation({ fn: "MAX" }, [num(3), NULL, num(1)])).toEqual(num(3));
    });

    it("returns NULL for empty input", () => {
      expect(computeAggregation({ fn: "MAX" }, [])).toEqual(NULL);
    });

    it("returns NULL for all NULLs", () => {
      expect(computeAggregation({ fn: "MAX" }, [NULL, NULL])).toEqual(NULL);
    });

    it("preserves original CellValue type tag", () => {
      const result = computeAggregation({ fn: "MAX" }, [num(3), num(1), num(2)]);
      expect(result.type).toBe(ColumnType.NUMBER);
    });
  });

  describe("JOIN", () => {
    it("joins non-null values with separator", () => {
      expect(
        computeAggregation({ fn: "JOIN", separator: ", " }, [text("a"), text("b"), text("c")]),
      ).toEqual(text("a, b, c"));
    });

    it("converts NUMBER to string", () => {
      expect(computeAggregation({ fn: "JOIN", separator: "," }, [num(1), num(2), num(3)])).toEqual(
        text("1,2,3"),
      );
    });

    it("converts DATE to ISO string", () => {
      const d = date(2024, 1, 15);
      expect(computeAggregation({ fn: "JOIN", separator: ";" }, [d])).toEqual(
        text("2024-01-15T00:00:00.000Z"),
      );
    });

    it("converts LABEL to string", () => {
      expect(
        computeAggregation({ fn: "JOIN", separator: "-" }, [label("x"), label("y")]),
      ).toEqual(text("x-y"));
    });

    it("skips NULLs", () => {
      expect(
        computeAggregation({ fn: "JOIN", separator: "," }, [text("a"), NULL, text("b")]),
      ).toEqual(text("a,b"));
    });

    it("returns empty TEXT for empty input", () => {
      expect(computeAggregation({ fn: "JOIN", separator: "," }, [])).toEqual(text(""));
    });

    it("returns empty TEXT for all NULLs", () => {
      expect(computeAggregation({ fn: "JOIN", separator: "," }, [NULL, NULL])).toEqual(text(""));
    });

    it("handles mixed value types", () => {
      expect(
        computeAggregation({ fn: "JOIN", separator: " " }, [text("count:"), num(42), label("end")]),
      ).toEqual(text("count: 42 end"));
    });
  });
});

// Test helper
function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

describe("compareValues — codepoint order", () => {
  it("MIN/MAX use Unicode codepoint order (uppercase before lowercase)", () => {
    const ds = toTypedDataSet({
      columns: [
        col("label", "Label", ColumnType.LABEL),
        col("dept", "Dept", ColumnType.LABEL),
      ],
      data: [
        ["banana", "Sales"],
        ["Apple", "Sales"],
        ["cherry", "Sales"],
      ],
    });
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept_key" as ColumnId },
        { kind: "aggregate", sourceId: "label" as ColumnId, columnId: "min_label" as ColumnId, fn: { fn: "MIN" } },
        { kind: "aggregate", sourceId: "label" as ColumnId, columnId: "max_label" as ColumnId, fn: { fn: "MAX" } },
      ],
    };
    const result = applyGroup(ds, op);

    // Codepoint order: 'A' (65) < 'b' (98) < 'c' (99)
    // MIN should be "Apple", MAX should be "cherry"
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.text("min_label" as ColumnId)).toBe("Apple");
    expect(result.rows[0]!.text("max_label" as ColumnId)).toBe("cherry");
  });
});

describe("buildDistinctIntervals", () => {
  describe("LABEL columns", () => {
    it("creates one bucket per unique label value", () => {
      const ds = toTypedDataSet({
        columns: [col("dept", "Department", ColumnType.LABEL)],
        data: [["Sales"], ["Engineering"], ["Sales"], ["Marketing"]],
      });
      const intervals = buildDistinctIntervals(ds, "dept" as ColumnId);

      expect(intervals).toHaveLength(3);
      expect(intervals[0]).toEqual({
        name: "Sales",
        index: 0,
        rowIndices: [0, 2],
      });
      expect(intervals[1]).toEqual({
        name: "Engineering",
        index: 1,
        rowIndices: [1],
      });
      expect(intervals[2]).toEqual({
        name: "Marketing",
        index: 2,
        rowIndices: [3],
      });
    });

    it("preserves row order within buckets", () => {
      const ds = toTypedDataSet({
        columns: [col("status", "Status", ColumnType.LABEL)],
        data: [["A"], ["B"], ["A"], ["C"], ["B"], ["A"]],
      });
      const intervals = buildDistinctIntervals(ds, "status" as ColumnId);

      expect(intervals[0]!.rowIndices).toEqual([0, 2, 5]);
      expect(intervals[1]!.rowIndices).toEqual([1, 4]);
      expect(intervals[2]!.rowIndices).toEqual([3]);
    });
  });

  describe("NUMBER columns", () => {
    it("creates one bucket per unique number", () => {
      const ds = toTypedDataSet({
        columns: [col("status", "Status Code", ColumnType.NUMBER)],
        data: [["200"], ["404"], ["200"], ["500"]],
      });
      const intervals = buildDistinctIntervals(ds, "status" as ColumnId);

      expect(intervals).toHaveLength(3);
      expect(intervals[0]).toEqual({
        name: "200",
        index: 0,
        rowIndices: [0, 2],
      });
      expect(intervals[1]).toEqual({
        name: "404",
        index: 1,
        rowIndices: [1],
      });
      expect(intervals[2]).toEqual({
        name: "500",
        index: 2,
        rowIndices: [3],
      });
    });

    it("names buckets using String(value)", () => {
      const ds = toTypedDataSet({
        columns: [col("val", "Value", ColumnType.NUMBER)],
        data: [["1.5"], ["2.0"], ["1.5"]],
      });
      const intervals = buildDistinctIntervals(ds, "val" as ColumnId);

      expect(intervals[0]!.name).toBe("1.5");
      expect(intervals[1]!.name).toBe("2");
    });
  });

  describe("DATE columns", () => {
    it("creates one bucket per unique date", () => {
      const ds = toTypedDataSet({
        columns: [col("date", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"],
          ["2024-03-01T00:00:00.000Z"],
          ["2024-01-15T00:00:00.000Z"],
        ],
      });
      const intervals = buildDistinctIntervals(ds, "date" as ColumnId);

      expect(intervals).toHaveLength(2);
      expect(intervals[0]).toEqual({
        name: "2024-01-15T00:00:00.000Z",
        index: 0,
        rowIndices: [0, 2],
      });
      expect(intervals[1]).toEqual({
        name: "2024-03-01T00:00:00.000Z",
        index: 1,
        rowIndices: [1],
      });
    });

    it("names buckets using toISOString()", () => {
      const ds = toTypedDataSet({
        columns: [col("ts", "Timestamp", ColumnType.DATE)],
        data: [["2024-03-15T14:30:00.000Z"]],
      });
      const intervals = buildDistinctIntervals(ds, "ts" as ColumnId);

      expect(intervals[0]!.name).toBe("2024-03-15T14:30:00.000Z");
    });
  });

  describe("NULL handling", () => {
    it("creates a 'null' bucket for NULL values", () => {
      const ds = toTypedDataSet({
        columns: [col("dept", "Department", ColumnType.LABEL)],
        data: [[null], ["Sales"], [null]],
      });
      const intervals = buildDistinctIntervals(ds, "dept" as ColumnId);

      expect(intervals).toHaveLength(2);
      expect(intervals[0]).toEqual({
        name: "null",
        index: 0,
        rowIndices: [0, 2],
      });
      expect(intervals[1]).toEqual({
        name: "Sales",
        index: 1,
        rowIndices: [1],
      });
    });

    it("handles mixed null and non-null values", () => {
      const ds = toTypedDataSet({
        columns: [col("status", "Status", ColumnType.NUMBER)],
        data: [["200"], [null], ["404"], [null], ["200"]],
      });
      const intervals = buildDistinctIntervals(ds, "status" as ColumnId);

      expect(intervals).toHaveLength(3);
      expect(intervals[0]!.name).toBe("200");
      expect(intervals[0]!.rowIndices).toEqual([0, 4]);
      expect(intervals[1]!.name).toBe("null");
      expect(intervals[1]!.rowIndices).toEqual([1, 3]);
      expect(intervals[2]!.name).toBe("404");
      expect(intervals[2]!.rowIndices).toEqual([2]);
    });
  });

  describe("edge cases", () => {
    it("returns empty IntervalList for empty dataset", () => {
      const ds = toTypedDataSet({
        columns: [col("dept", "Department", ColumnType.LABEL)],
        data: [],
      });
      const intervals = buildDistinctIntervals(ds, "dept" as ColumnId);

      expect(intervals).toEqual([]);
    });

    it("assigns 0-based sequential bucket indices", () => {
      const ds = toTypedDataSet({
        columns: [col("val", "Value", ColumnType.LABEL)],
        data: [["C"], ["A"], ["B"]],
      });
      const intervals = buildDistinctIntervals(ds, "val" as ColumnId);

      expect(intervals[0]!.index).toBe(0);
      expect(intervals[1]!.index).toBe(1);
      expect(intervals[2]!.index).toBe(2);
    });

    it("preserves first-seen order for bucket creation", () => {
      const ds = toTypedDataSet({
        columns: [col("letter", "Letter", ColumnType.LABEL)],
        data: [["Z"], ["A"], ["M"], ["Z"]],
      });
      const intervals = buildDistinctIntervals(ds, "letter" as ColumnId);

      expect(intervals[0]!.name).toBe("Z");
      expect(intervals[1]!.name).toBe("A");
      expect(intervals[2]!.name).toBe("M");
    });
  });
});

describe("buildFixedCalendarIntervals", () => {
  describe("MONTH", () => {
    it("creates 12 buckets named '1' through '12'", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"],
          ["2024-03-10T00:00:00.000Z"],
          ["2024-07-20T00:00:00.000Z"],
          ["2024-01-25T00:00:00.000Z"],
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "MONTH");

      expect(intervals).toHaveLength(12);
      // Buckets named "1" through "12"
      for (let i = 0; i < 12; i++) {
        expect(intervals[i]!.name).toBe(String(i + 1));
        expect(intervals[i]!.index).toBe(i);
      }
      // January rows
      expect(intervals[0]!.rowIndices).toEqual([0, 3]);
      // March
      expect(intervals[2]!.rowIndices).toEqual([1]);
      // July
      expect(intervals[6]!.rowIndices).toEqual([2]);
      // Empty months have no rows
      expect(intervals[1]!.rowIndices).toEqual([]); // Feb
      expect(intervals[11]!.rowIndices).toEqual([]); // Dec
    });

    it("rotates bucket order with firstMonthOfYear=4 (April)", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-04-01T00:00:00.000Z"], // April → bucket "1"
          ["2024-05-01T00:00:00.000Z"], // May → bucket "2"
          ["2024-12-01T00:00:00.000Z"], // December → bucket "9"
          ["2024-01-01T00:00:00.000Z"], // January → bucket "10"
          ["2024-03-01T00:00:00.000Z"], // March → bucket "12"
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "MONTH", {
        firstMonthOfYear: 4,
      });

      expect(intervals).toHaveLength(12);
      expect(intervals[0]!.name).toBe("1");
      expect(intervals[0]!.rowIndices).toEqual([0]); // April
      expect(intervals[1]!.rowIndices).toEqual([1]); // May
      expect(intervals[8]!.rowIndices).toEqual([2]); // December → bucket "9"
      expect(intervals[9]!.rowIndices).toEqual([3]); // January → bucket "10"
      expect(intervals[11]!.rowIndices).toEqual([4]); // March → bucket "12"
    });
  });

  describe("QUARTER", () => {
    it("creates 4 buckets named '1' through '4'", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"], // Q1
          ["2024-04-10T00:00:00.000Z"], // Q2
          ["2024-07-20T00:00:00.000Z"], // Q3
          ["2024-10-25T00:00:00.000Z"], // Q4
          ["2024-02-01T00:00:00.000Z"], // Q1
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "QUARTER");

      expect(intervals).toHaveLength(4);
      expect(intervals[0]).toEqual(expect.objectContaining({ name: "1", index: 0, rowIndices: [0, 4] }));
      expect(intervals[1]).toEqual(expect.objectContaining({ name: "2", index: 1, rowIndices: [1] }));
      expect(intervals[2]).toEqual(expect.objectContaining({ name: "3", index: 2, rowIndices: [2] }));
      expect(intervals[3]).toEqual(expect.objectContaining({ name: "4", index: 3, rowIndices: [3] }));
    });

    it("aligns with fiscal quarters when firstMonthOfYear=4", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-04-01T00:00:00.000Z"], // Fiscal Q1 (Apr-Jun)
          ["2024-07-01T00:00:00.000Z"], // Fiscal Q2 (Jul-Sep)
          ["2024-01-01T00:00:00.000Z"], // Fiscal Q4 (Jan-Mar)
          ["2024-03-31T00:00:00.000Z"], // Fiscal Q4 (Jan-Mar)
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "QUARTER", {
        firstMonthOfYear: 4,
      });

      expect(intervals).toHaveLength(4);
      expect(intervals[0]!.rowIndices).toEqual([0]); // Q1: Apr
      expect(intervals[1]!.rowIndices).toEqual([1]); // Q2: Jul
      expect(intervals[2]!.rowIndices).toEqual([]); // Q3: Oct
      expect(intervals[3]!.rowIndices).toEqual([2, 3]); // Q4: Jan, Mar
    });
  });

  describe("DAY_OF_WEEK", () => {
    it("creates 7 buckets with ISO day numbers (1=Monday)", () => {
      // 2024-01-15 is a Monday, 2024-01-21 is a Sunday
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"], // Monday → bucket "1"
          ["2024-01-16T00:00:00.000Z"], // Tuesday → bucket "2"
          ["2024-01-21T00:00:00.000Z"], // Sunday → bucket "7"
          ["2024-01-17T00:00:00.000Z"], // Wednesday → bucket "3"
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "DAY_OF_WEEK");

      expect(intervals).toHaveLength(7);
      expect(intervals[0]).toEqual(expect.objectContaining({ name: "1", rowIndices: [0] })); // Mon
      expect(intervals[1]).toEqual(expect.objectContaining({ name: "2", rowIndices: [1] })); // Tue
      expect(intervals[2]).toEqual(expect.objectContaining({ name: "3", rowIndices: [3] })); // Wed
      expect(intervals[6]).toEqual(expect.objectContaining({ name: "7", rowIndices: [2] })); // Sun
    });

    it("rotates with firstDayOfWeek=7 (Sunday start)", () => {
      // 2024-01-21 is a Sunday, 2024-01-15 is a Monday
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-21T00:00:00.000Z"], // Sunday → bucket "1" (first)
          ["2024-01-15T00:00:00.000Z"], // Monday → bucket "2"
          ["2024-01-20T00:00:00.000Z"], // Saturday → bucket "7"
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "DAY_OF_WEEK", {
        firstDayOfWeek: 7,
      });

      expect(intervals).toHaveLength(7);
      expect(intervals[0]).toEqual(expect.objectContaining({ name: "1", rowIndices: [0] })); // Sunday
      expect(intervals[1]).toEqual(expect.objectContaining({ name: "2", rowIndices: [1] })); // Monday
      expect(intervals[6]).toEqual(expect.objectContaining({ name: "7", rowIndices: [2] })); // Saturday
    });
  });

  describe("HOUR", () => {
    it("creates 24 buckets named '0' through '23'", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:30:00.000Z"], // hour 0
          ["2024-01-15T14:00:00.000Z"], // hour 14
          ["2024-01-15T23:59:00.000Z"], // hour 23
          ["2024-01-16T00:00:00.000Z"], // hour 0
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "HOUR");

      expect(intervals).toHaveLength(24);
      expect(intervals[0]).toEqual(expect.objectContaining({ name: "0", index: 0, rowIndices: [0, 3] }));
      expect(intervals[14]).toEqual(expect.objectContaining({ name: "14", index: 14, rowIndices: [1] }));
      expect(intervals[23]).toEqual(expect.objectContaining({ name: "23", index: 23, rowIndices: [2] }));
    });
  });

  describe("NULL handling", () => {
    it("skips NULL values", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"],
          [null],
          ["2024-03-10T00:00:00.000Z"],
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "MONTH");

      expect(intervals).toHaveLength(12);
      expect(intervals[0]!.rowIndices).toEqual([0]); // Jan
      expect(intervals[2]!.rowIndices).toEqual([2]); // Mar
      // NULL row (index 1) not present in any bucket
      const allRows = intervals.flatMap((iv) => [...iv.rowIndices]);
      expect(allRows).not.toContain(1);
    });
  });

  describe("edge cases", () => {
    it("returns all empty buckets for empty dataset", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "MONTH");

      expect(intervals).toHaveLength(12);
      for (const iv of intervals) {
        expect(iv.rowIndices).toEqual([]);
      }
    });

    it("MINUTE creates 60 buckets named '0' through '59'", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T10:05:00.000Z"], // minute 5
          ["2024-01-15T10:59:30.000Z"], // minute 59
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "MINUTE");

      expect(intervals).toHaveLength(60);
      expect(intervals[0]!.name).toBe("0");
      expect(intervals[5]!.rowIndices).toEqual([0]);
      expect(intervals[59]!.rowIndices).toEqual([1]);
    });

    it("SECOND creates 60 buckets named '0' through '59'", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T10:05:30.000Z"], // second 30
          ["2024-01-15T10:05:00.000Z"], // second 0
        ],
      });
      const intervals = buildFixedCalendarIntervals(ds, "d" as ColumnId, "SECOND");

      expect(intervals).toHaveLength(60);
      expect(intervals[30]!.rowIndices).toEqual([0]);
      expect(intervals[0]!.rowIndices).toEqual([1]);
    });
  });
});

describe("buildDynamicDateIntervals", () => {
  describe("auto-sizing", () => {
    it("multi-month span produces monthly buckets", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"],
          ["2024-03-10T00:00:00.000Z"],
          ["2024-05-20T00:00:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 12);

      // Span is ~4 months → monthly buckets should fit within 12
      expect(intervals.length).toBeGreaterThanOrEqual(4);
      expect(intervals.length).toBeLessThanOrEqual(12);
      // Monthly naming: "yyyy-MM"
      expect(intervals[0]!.name).toMatch(/^\d{4}-\d{2}$/);
    });

    it("multi-year span produces yearly buckets", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2020-01-01T00:00:00.000Z"],
          ["2024-06-15T00:00:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 10);

      // Span is ~4.5 years → yearly buckets
      expect(intervals.length).toBeGreaterThanOrEqual(4);
      expect(intervals.length).toBeLessThanOrEqual(10);
      // Yearly naming: "yyyy"
      expect(intervals[0]!.name).toMatch(/^\d{4}$/);
    });
  });

  describe("preferredUnit enforcement", () => {
    it("never uses a finer granularity than preferredUnit", () => {
      // Small span that would normally produce daily or hourly buckets
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-01T00:00:00.000Z"],
          ["2024-01-03T00:00:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 100, {
        preferredUnit: "MONTH",
      });

      // With preferred MONTH, should get monthly buckets even for a 2-day span
      // Naming should be "yyyy-MM"
      expect(intervals[0]!.name).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe("calendar-aligned boundaries", () => {
    it("months start on the 1st", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"],
          ["2024-02-20T00:00:00.000Z"],
          ["2024-03-10T00:00:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 12);

      // All dates assigned; boundaries should be calendar-aligned
      expect(intervals.length).toBeGreaterThanOrEqual(3);
      // First interval starts at 2024-01 (truncated from Jan 15)
      expect(intervals[0]!.name).toBe("2024-01");
      // Each row assigned to exactly one interval
      const allRows = intervals.flatMap((iv) => [...iv.rowIndices]).sort((a, b) => a - b);
      expect(allRows).toEqual([0, 1, 2]);
    });
  });

  describe("edge cases", () => {
    it("single date produces single interval", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [["2024-06-15T12:30:00.000Z"]],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 10);

      expect(intervals).toHaveLength(1);
      expect(intervals[0]!.rowIndices).toEqual([0]);
    });

    it("empty dates produce empty result", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 10);

      expect(intervals).toHaveLength(0);
    });

    it("null dates are skipped", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"],
          [null],
          ["2024-03-10T00:00:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 12);

      const allRows = intervals.flatMap((iv) => [...iv.rowIndices]);
      expect(allRows).toContain(0);
      expect(allRows).toContain(2);
      expect(allRows).not.toContain(1);
    });

    it("two identical dates produce single interval", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-06-15T00:00:00.000Z"],
          ["2024-06-15T00:00:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 10);

      expect(intervals).toHaveLength(1);
      expect(intervals[0]!.rowIndices).toEqual([0, 1]);
    });
  });

  describe("interval naming", () => {
    it("year intervals use 'yyyy' format", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2020-06-01T00:00:00.000Z"],
          ["2024-06-01T00:00:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 10);

      for (const iv of intervals) {
        expect(iv.name).toMatch(/^\d{4}$/);
      }
    });

    it("hour intervals use 'yyyy-MM-dd HH' format", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T10:30:00.000Z"],
          ["2024-01-15T14:45:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 10);

      for (const iv of intervals) {
        expect(iv.name).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}$/);
      }
    });

    it("minute intervals use 'yyyy-MM-dd HH:mm' format", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T10:30:00.000Z"],
          ["2024-01-15T10:35:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 10);

      for (const iv of intervals) {
        expect(iv.name).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      }
    });

    it("second intervals use 'yyyy-MM-dd HH:mm:ss' format", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T10:30:00.000Z"],
          ["2024-01-15T10:30:05.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 10);

      for (const iv of intervals) {
        expect(iv.name).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      }
    });
  });

  describe("minValue/maxValue", () => {
    it("sets minValue and maxValue on each interval", () => {
      const ds = toTypedDataSet({
        columns: [col("d", "Date", ColumnType.DATE)],
        data: [
          ["2024-01-15T00:00:00.000Z"],
          ["2024-03-10T00:00:00.000Z"],
        ],
      });
      const intervals = buildDynamicDateIntervals(ds, "d" as ColumnId, 12);

      for (const iv of intervals) {
        expect(iv.minValue).toBeInstanceOf(Date);
        expect(iv.maxValue).toBeInstanceOf(Date);
      }
    });
  });
});

describe("buildDynamicNumberIntervals", () => {
  describe("equal-width bins", () => {
    it("creates bins spanning the value range", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [["0"], ["25"], ["50"], ["75"], ["100"]],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 4);

      expect(intervals).toHaveLength(4);
      // First bin: [0, 25)
      expect(intervals[0]!.name).toBe("0-25");
      expect(intervals[0]!.minValue).toBe(0);
      expect(intervals[0]!.maxValue).toBe(25);
      // Last bin includes max value (100)
      expect(intervals[3]!.name).toBe("75-100");
    });

    it("assigns values to correct bins", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [["10"], ["30"], ["50"], ["70"], ["90"]],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 4);

      // All rows should be assigned
      const allRows = intervals.flatMap((iv) => [...iv.rowIndices]).sort((a, b) => a - b);
      expect(allRows).toEqual([0, 1, 2, 3, 4]);
    });
  });

  describe("respects maxIntervals", () => {
    it("creates at most maxIntervals bins", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [["0"], ["100"], ["200"], ["300"], ["400"], ["500"]],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 3);

      expect(intervals).toHaveLength(3);
    });
  });

  describe("naming", () => {
    it("names bins as 'min-max'", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [["0"], ["100"]],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 2);

      expect(intervals[0]!.name).toBe("0-50");
      expect(intervals[1]!.name).toBe("50-100");
    });
  });

  describe("edge cases", () => {
    it("single value produces single bin", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [["42"], ["42"], ["42"]],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 5);

      expect(intervals).toHaveLength(1);
      expect(intervals[0]!.rowIndices).toEqual([0, 1, 2]);
    });

    it("handles negative numbers", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [["-100"], ["-50"], ["0"], ["50"], ["100"]],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 4);

      expect(intervals).toHaveLength(4);
      expect(intervals[0]!.name).toBe("-100--50");
      // All rows assigned
      const allRows = intervals.flatMap((iv) => [...iv.rowIndices]).sort((a, b) => a - b);
      expect(allRows).toEqual([0, 1, 2, 3, 4]);
    });

    it("null values are skipped", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [["10"], [null], ["20"], [null]],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 5);

      const allRows = intervals.flatMap((iv) => [...iv.rowIndices]);
      expect(allRows).toContain(0);
      expect(allRows).toContain(2);
      expect(allRows).not.toContain(1);
      expect(allRows).not.toContain(3);
    });

    it("empty dataset produces empty result", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 5);

      expect(intervals).toHaveLength(0);
    });
  });

  describe("minValue/maxValue", () => {
    it("sets minValue and maxValue on each interval", () => {
      const ds = toTypedDataSet({
        columns: [col("v", "Value", ColumnType.NUMBER)],
        data: [["0"], ["100"]],
      });
      const intervals = buildDynamicNumberIntervals(ds, "v" as ColumnId, 4);

      expect(intervals[0]!.minValue).toBe(0);
      expect(intervals[0]!.maxValue).toBe(25);
      expect(intervals[3]!.minValue).toBe(75);
      expect(intervals[3]!.maxValue).toBe(100);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// applyGroup tests
// ────────────────────────────────────────────────────────────────────────────

describe("applyGroup", () => {
  // Test dataset: 4 rows with dept (LABEL) and revenue (NUMBER)
  // dept: Sales, Engineering, Sales, Marketing
  // revenue: 100, 200, 150, 50
  function makeTestDs() {
    return toTypedDataSet({
      columns: [
        col("dept", "Department", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
      ],
      data: [
        ["Sales", "100"],
        ["Engineering", "200"],
        ["Sales", "150"],
        ["Marketing", "50"],
      ],
    });
  }

  it("null groupingKey — whole-dataset SUM", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: null,
      columns: [
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
      ],
    };
    const result = applyGroup(ds, op);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.number("total" as ColumnId)).toBe(500);
  });

  it("null groupingKey — kind:key is INVALID_OPERATION error", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: null,
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept" as ColumnId },
      ],
    };

    expect(() => applyGroup(ds, op)).toThrow(DataSetError);
    expect(() => applyGroup(ds, op)).toThrow("Key columns require a grouping key");
  });

  it("null groupingKey — all-select columns project all rows", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: null,
      columns: [
        { kind: "select", sourceId: "dept" as ColumnId, columnId: "firstDept" as ColumnId },
      ],
    };
    const result = applyGroup(ds, op);

    expect(result.rows).toHaveLength(4);
    expect(result.rows[0]!.text("firstDept" as ColumnId)).toBe("Sales");
    expect(result.rows[1]!.text("firstDept" as ColumnId)).toBe("Engineering");
    expect(result.rows[2]!.text("firstDept" as ColumnId)).toBe("Sales");
    expect(result.rows[3]!.text("firstDept" as ColumnId)).toBe("Marketing");
  });

  it("null groupingKey — mixed select+aggregate still aggregates to one row", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: null,
      columns: [
        { kind: "select", sourceId: "dept" as ColumnId, columnId: "firstDept" as ColumnId },
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
      ],
    };
    const result = applyGroup(ds, op);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.text("firstDept" as ColumnId)).toBe("Sales");
    expect(result.rows[0]!.number("total" as ColumnId)).toBe(500);
  });

  it("distinct grouping — one row per unique dept", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept" as ColumnId },
      ],
    };
    const result = applyGroup(ds, op);

    // 3 unique depts: Sales, Engineering, Marketing
    expect(result.rows).toHaveLength(3);
  });

  it("aggregate SUM per group", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept_key" as ColumnId },
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
      ],
    };
    const result = applyGroup(ds, op);

    expect(result.rows).toHaveLength(3);
    // Sales: 100 + 150 = 250, Engineering: 200, Marketing: 50
    const salesRow = result.rows.find((r) => r.text("dept_key" as ColumnId) === "Sales")!;
    expect(salesRow.number("total" as ColumnId)).toBe(250);
    const engRow = result.rows.find((r) => r.text("dept_key" as ColumnId) === "Engineering")!;
    expect(engRow.number("total" as ColumnId)).toBe(200);
    const mktRow = result.rows.find((r) => r.text("dept_key" as ColumnId) === "Marketing")!;
    expect(mktRow.number("total" as ColumnId)).toBe(50);
  });

  it("aggregate COUNT per group", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept_key" as ColumnId },
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "count" as ColumnId, fn: { fn: "COUNT" } },
      ],
    };
    const result = applyGroup(ds, op);

    const salesRow = result.rows.find((r) => r.text("dept_key" as ColumnId) === "Sales")!;
    expect(salesRow.number("count" as ColumnId)).toBe(2);
    const engRow = result.rows.find((r) => r.text("dept_key" as ColumnId) === "Engineering")!;
    expect(engRow.number("count" as ColumnId)).toBe(1);
  });

  it("key column shows bucket name as LABEL", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept_key" as ColumnId },
      ],
    };
    const result = applyGroup(ds, op);

    // Key column values are the bucket names
    const names = result.rows.map((r) => r.cell("dept_key" as ColumnId));
    expect(names[0]).toEqual(label("Sales"));
    expect(names[1]).toEqual(label("Engineering"));
    expect(names[2]).toEqual(label("Marketing"));
  });

  it("select column shows first value in bucket", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept_key" as ColumnId },
        { kind: "select", sourceId: "revenue" as ColumnId, columnId: "firstRev" as ColumnId },
      ],
    };
    const result = applyGroup(ds, op);

    // Sales bucket has rows 0 and 2 → first by original row order = row 0 (revenue 100)
    const salesRow = result.rows.find((r) => r.text("dept_key" as ColumnId) === "Sales")!;
    expect(salesRow.number("firstRev" as ColumnId)).toBe(100);
  });

  it("output columns have correct types (key=LABEL, SUM=NUMBER)", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept_key" as ColumnId },
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
      ],
    };
    const result = applyGroup(ds, op);

    expect(result.columns[0]!.type).toBe(ColumnType.LABEL);
    expect(result.columns[1]!.type).toBe(ColumnType.NUMBER);
  });

  it("TYPE_MISMATCH — SUM on LABEL column", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "aggregate", sourceId: "dept" as ColumnId, columnId: "bad" as ColumnId, fn: { fn: "SUM" } },
      ],
    };

    expect(() => applyGroup(ds, op)).toThrow(DataSetError);
    expect(() => applyGroup(ds, op)).toThrow("SUM requires a NUMBER column");
  });

  it("TYPE_MISMATCH — fixedCalendar on NUMBER column", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "revenue" as ColumnId,
        columnId: "rev" as ColumnId,
        strategy: { mode: "fixedCalendar", unit: "MONTH" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [],
    };

    expect(() => applyGroup(ds, op)).toThrow(DataSetError);
    expect(() => applyGroup(ds, op)).toThrow("fixedCalendar strategy requires a DATE column");
  });

  it("dynamic strategy resolves to distinct for LABEL columns", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "dynamic" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept_key" as ColumnId },
      ],
    };
    const result = applyGroup(ds, op);

    // Should produce distinct buckets
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]!.text("dept_key" as ColumnId)).toBe("Sales");
  });

  it("emptyIntervals=false excludes empty buckets", () => {
    const ds = toTypedDataSet({
      columns: [
        col("d", "Date", ColumnType.DATE),
        col("v", "Value", ColumnType.NUMBER),
      ],
      data: [
        ["2024-01-15T00:00:00.000Z", "10"],
        ["2024-03-15T00:00:00.000Z", "20"],
      ],
    });
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "d" as ColumnId,
        columnId: "d" as ColumnId,
        strategy: { mode: "fixedCalendar", unit: "MONTH" },
        maxIntervals: 100,
        emptyIntervals: false,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "d" as ColumnId, columnId: "month_key" as ColumnId },
        { kind: "aggregate", sourceId: "v" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
      ],
    };
    const result = applyGroup(ds, op);

    // Only Jan (bucket "1") and Mar (bucket "3") should appear — 10 empty months excluded
    expect(result.rows).toHaveLength(2);
  });

  it("ascending=false reverses bucket order", () => {
    const ds = makeTestDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "dept" as ColumnId,
        columnId: "dept" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: false,
      },
      columns: [
        { kind: "key", sourceId: "dept" as ColumnId, columnId: "dept_key" as ColumnId },
      ],
    };
    const result = applyGroup(ds, op);

    // Distinct intervals in first-seen order: Sales, Engineering, Marketing
    // With ascending=false → reversed: Marketing, Engineering, Sales
    expect(result.rows[0]!.text("dept_key" as ColumnId)).toBe("Marketing");
    expect(result.rows[1]!.text("dept_key" as ColumnId)).toBe("Engineering");
    expect(result.rows[2]!.text("dept_key" as ColumnId)).toBe("Sales");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// applyGroupSequence tests
// ────────────────────────────────────────────────────────────────────────────

describe("applyGroupSequence", () => {
  // Test dataset: 4 rows — region, product, revenue
  // East/Widgets/100, East/Gadgets/200, West/Widgets/150, West/Gadgets/50
  function makeSeqDs() {
    return toTypedDataSet({
      columns: [
        col("region", "Region", ColumnType.LABEL),
        col("product", "Product", ColumnType.LABEL),
        col("revenue", "Revenue", ColumnType.NUMBER),
      ],
      data: [
        ["East", "Widgets", "100"],
        ["East", "Gadgets", "200"],
        ["West", "Widgets", "150"],
        ["West", "Gadgets", "50"],
      ],
    });
  }

  it("single op sequence delegates to applyGroup", () => {
    const ds = makeSeqDs();
    const op: GroupOp = {
      type: "group",
      groupingKey: {
        sourceId: "region" as ColumnId,
        columnId: "region" as ColumnId,
        strategy: { mode: "distinct" },
        maxIntervals: 100,
        emptyIntervals: true,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "region" as ColumnId, columnId: "region_key" as ColumnId },
        { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
      ],
    };

    const result = applyGroupSequence(ds, [op]);

    expect(result.rows).toHaveLength(2);
    const eastRow = result.rows.find((r) => r.text("region_key" as ColumnId) === "East")!;
    expect(eastRow.number("total" as ColumnId)).toBe(300); // 100 + 200
    const westRow = result.rows.find((r) => r.text("region_key" as ColumnId) === "West")!;
    expect(westRow.number("total" as ColumnId)).toBe(200); // 150 + 50
  });

  it("second GroupOp without join or selectedIntervals → INVALID_OPERATION", () => {
    const ds = makeSeqDs();
    const ops: GroupOp[] = [
      {
        type: "group",
        groupingKey: {
          sourceId: "region" as ColumnId,
          columnId: "region" as ColumnId,
          strategy: { mode: "distinct" },
          maxIntervals: 100,
          emptyIntervals: true,
          ascendingOrder: true,
        },
        columns: [],
      },
      {
        type: "group",
        groupingKey: {
          sourceId: "product" as ColumnId,
          columnId: "product" as ColumnId,
          strategy: { mode: "distinct" },
          maxIntervals: 100,
          emptyIntervals: true,
          ascendingOrder: true,
        },
        columns: [
          { kind: "key", sourceId: "product" as ColumnId, columnId: "product_key" as ColumnId },
        ],
      },
    ];

    expect(() => applyGroupSequence(ds, ops)).toThrow(DataSetError);
    expect(() => applyGroupSequence(ds, ops)).toThrow("Multiple group operations require");
  });

  it("selectedIntervals narrows to selected buckets", () => {
    const ds = makeSeqDs();
    const ops: GroupOp[] = [
      {
        type: "group",
        groupingKey: {
          sourceId: "region" as ColumnId,
          columnId: "region" as ColumnId,
          strategy: { mode: "distinct" },
          maxIntervals: 100,
          emptyIntervals: true,
          ascendingOrder: true,
        },
        columns: [],
        selectedIntervals: ["East"],
      },
      {
        type: "group",
        groupingKey: {
          sourceId: "product" as ColumnId,
          columnId: "product" as ColumnId,
          strategy: { mode: "distinct" },
          maxIntervals: 100,
          emptyIntervals: true,
          ascendingOrder: true,
        },
        columns: [
          { kind: "key", sourceId: "product" as ColumnId, columnId: "product_key" as ColumnId },
          { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
        ],
        join: true,
      },
    ];

    const result = applyGroupSequence(ds, ops);

    // Only East rows: Widgets/100, Gadgets/200
    expect(result.rows).toHaveLength(2);
    const widgetsRow = result.rows.find((r) => r.text("product_key" as ColumnId) === "Widgets")!;
    expect(widgetsRow.number("total" as ColumnId)).toBe(100);
    const gadgetsRow = result.rows.find((r) => r.text("product_key" as ColumnId) === "Gadgets")!;
    expect(gadgetsRow.number("total" as ColumnId)).toBe(200);
  });

  it("join: true — nested grouping produces parent x child rows", () => {
    const ds = makeSeqDs();
    // GroupOp 1: group by region
    // GroupOp 2: join=true, group by product, columns=[select:region, key:product, SUM(revenue)]
    // Output: East/Widgets/100, East/Gadgets/200, West/Widgets/150, West/Gadgets/50
    const ops: GroupOp[] = [
      {
        type: "group",
        groupingKey: {
          sourceId: "region" as ColumnId,
          columnId: "region" as ColumnId,
          strategy: { mode: "distinct" },
          maxIntervals: 100,
          emptyIntervals: true,
          ascendingOrder: true,
        },
        columns: [],
      },
      {
        type: "group",
        groupingKey: {
          sourceId: "product" as ColumnId,
          columnId: "product" as ColumnId,
          strategy: { mode: "distinct" },
          maxIntervals: 100,
          emptyIntervals: true,
          ascendingOrder: true,
        },
        columns: [
          { kind: "select", sourceId: "region" as ColumnId, columnId: "region_val" as ColumnId },
          { kind: "key", sourceId: "product" as ColumnId, columnId: "product_key" as ColumnId },
          { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "total" as ColumnId, fn: { fn: "SUM" } },
        ],
        join: true,
      },
    ];

    const result = applyGroupSequence(ds, ops);

    // 2 regions x 2 products = 4 rows
    expect(result.rows).toHaveLength(4);

    // Verify each combination
    const rows = result.rows.map((r) => ({
      region: r.text("region_val" as ColumnId),
      product: r.text("product_key" as ColumnId),
      total: r.number("total" as ColumnId),
    }));

    expect(rows).toContainEqual({ region: "East", product: "Widgets", total: 100 });
    expect(rows).toContainEqual({ region: "East", product: "Gadgets", total: 200 });
    expect(rows).toContainEqual({ region: "West", product: "Widgets", total: 150 });
    expect(rows).toContainEqual({ region: "West", product: "Gadgets", total: 50 });
  });

  it("only final GroupOp columns define output shape", () => {
    const ds = makeSeqDs();
    const ops: GroupOp[] = [
      {
        type: "group",
        groupingKey: {
          sourceId: "region" as ColumnId,
          columnId: "region" as ColumnId,
          strategy: { mode: "distinct" },
          maxIntervals: 100,
          emptyIntervals: true,
          ascendingOrder: true,
        },
        // First op has columns, but they should be ignored
        columns: [
          { kind: "key", sourceId: "region" as ColumnId, columnId: "region_key" as ColumnId },
          { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "ignored_total" as ColumnId, fn: { fn: "SUM" } },
        ],
      },
      {
        type: "group",
        groupingKey: {
          sourceId: "product" as ColumnId,
          columnId: "product" as ColumnId,
          strategy: { mode: "distinct" },
          maxIntervals: 100,
          emptyIntervals: true,
          ascendingOrder: true,
        },
        columns: [
          { kind: "key", sourceId: "product" as ColumnId, columnId: "product_key" as ColumnId },
          { kind: "aggregate", sourceId: "revenue" as ColumnId, columnId: "rev_sum" as ColumnId, fn: { fn: "SUM" } },
        ],
        join: true,
      },
    ];

    const result = applyGroupSequence(ds, ops);

    // Output should have columns from the final op only
    expect(result.columns).toHaveLength(2);
    expect(result.columns[0]!.id).toBe("product_key");
    expect(result.columns[1]!.id).toBe("rev_sum");
    // First op's "region_key" and "ignored_total" should not be in the output
    expect(result.columns.find((c) => c.id === ("region_key" as ColumnId))).toBeUndefined();
    expect(result.columns.find((c) => c.id === ("ignored_total" as ColumnId))).toBeUndefined();
  });
});
