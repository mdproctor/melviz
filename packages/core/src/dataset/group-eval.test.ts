import { describe, it, expect } from "vitest";
import {
  computeAggregation,
  buildDistinctIntervals,
  buildFixedCalendarIntervals,
  buildDynamicDateIntervals,
} from "./group-eval.js";
import type { CellValue, Column, ColumnId } from "./types.js";
import { ColumnType } from "./types.js";
import { toTypedDataSet } from "./conversion.js";

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
