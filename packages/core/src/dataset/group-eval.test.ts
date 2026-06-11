import { describe, it, expect } from "vitest";
import { computeAggregation, buildDistinctIntervals } from "./group-eval.js";
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
function date(y: number, m: number, d: number): CellValue {
  return { type: ColumnType.DATE, value: new Date(Date.UTC(y, m - 1, d)) };
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
