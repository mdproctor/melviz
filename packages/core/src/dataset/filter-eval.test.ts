import { describe, it, expect } from "vitest";
import { applyFilter } from "./filter-eval.js";
import { toTypedDataSet } from "./conversion.js";
import type { Column, ColumnId, TypedDataSet } from "./types.js";
import { ColumnType } from "./types.js";
import type { ResolvedFilterExpression, NumericFilter, StringFilter, DateFilter } from "./filter.js";
import { parseTimeFrame } from "./timeframe.js";

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

function numericDataSet(): TypedDataSet {
  return toTypedDataSet({
    columns: [col("val", "Value", ColumnType.NUMBER)],
    data: [["10"], ["20"], ["30"], ["40"], ["50"]],
  });
}

function nf(filter: NumericFilter): ResolvedFilterExpression {
  return { type: "numeric", columnId: "val" as ColumnId, filter };
}

function sf(filter: StringFilter): ResolvedFilterExpression {
  return { type: "string", columnId: "name" as ColumnId, filter };
}

function df(filter: DateFilter): ResolvedFilterExpression {
  return { type: "date", columnId: "date" as ColumnId, filter };
}

describe("applyFilter — numeric", () => {
  it("EQUALS_TO filters to matching rows", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "EQUALS_TO", value: 30 })] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.number("val" as ColumnId)).toBe(30);
  });

  it("NOT_EQUALS_TO excludes matching rows", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "NOT_EQUALS_TO", value: 30 })] });
    expect(result.rows).toHaveLength(4);
  });

  it("GREATER_THAN filters correctly", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "GREATER_THAN", value: 30 })] });
    expect(result.rows).toHaveLength(2);
  });

  it("GREATER_OR_EQUALS_TO includes boundary", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "GREATER_OR_EQUALS_TO", value: 30 })] });
    expect(result.rows).toHaveLength(3);
  });

  it("LOWER_THAN filters correctly", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "LOWER_THAN", value: 30 })] });
    expect(result.rows).toHaveLength(2);
  });

  it("LOWER_OR_EQUALS_TO includes boundary", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "LOWER_OR_EQUALS_TO", value: 30 })] });
    expect(result.rows).toHaveLength(3);
  });

  it("BETWEEN inclusive both ends", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "BETWEEN", low: 20, high: 40 })] });
    expect(result.rows).toHaveLength(3);
  });

  it("IN matches any value in set", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "IN", values: [10, 30, 50] })] });
    expect(result.rows).toHaveLength(3);
  });

  it("NOT_IN excludes all values in set", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "NOT_IN", values: [10, 30, 50] })] });
    expect(result.rows).toHaveLength(2);
  });

  it("IS_NULL returns no rows (no nulls in dataset)", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "IS_NULL" })] });
    expect(result.rows).toHaveLength(0);
  });

  it("NOT_NULL returns all rows (no nulls in dataset)", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [nf({ fn: "NOT_NULL" })] });
    expect(result.rows).toHaveLength(5);
  });
});

describe("applyFilter — null semantics", () => {
  function dataSetWithNull(): TypedDataSet {
    return toTypedDataSet({
      columns: [col("val", "Value", ColumnType.NUMBER)],
      data: [["10"], [null], ["30"]],
    });
  }

  it("IS_NULL matches null cells", () => {
    const result = applyFilter(dataSetWithNull(), { type: "filter", expressions: [nf({ fn: "IS_NULL" })] });
    expect(result.rows).toHaveLength(1);
  });

  it("NOT_NULL excludes null cells", () => {
    const result = applyFilter(dataSetWithNull(), { type: "filter", expressions: [nf({ fn: "NOT_NULL" })] });
    expect(result.rows).toHaveLength(2);
  });

  it("EQUALS_TO returns false for null", () => {
    const result = applyFilter(dataSetWithNull(), { type: "filter", expressions: [nf({ fn: "EQUALS_TO", value: 10 })] });
    expect(result.rows).toHaveLength(1);
  });

  it("NOT_EQUALS_TO returns false for null (fixes Java bug)", () => {
    const result = applyFilter(dataSetWithNull(), { type: "filter", expressions: [nf({ fn: "NOT_EQUALS_TO", value: 10 })] });
    expect(result.rows).toHaveLength(1);
  });

  it("LOWER_THAN returns false for null (fixes Java bug)", () => {
    const result = applyFilter(dataSetWithNull(), { type: "filter", expressions: [nf({ fn: "LOWER_THAN", value: 100 })] });
    expect(result.rows).toHaveLength(2);
  });

  it("NOT_IN returns false for null (fixes Java bug)", () => {
    const result = applyFilter(dataSetWithNull(), { type: "filter", expressions: [nf({ fn: "NOT_IN", values: [999] })] });
    expect(result.rows).toHaveLength(2);
  });
});

function stringDataSet(): TypedDataSet {
  return toTypedDataSet({
    columns: [col("name", "Name", ColumnType.LABEL)],
    data: [["Alice"], ["Bob"], ["Charlie"], ["David"]],
  });
}

describe("applyFilter — string", () => {
  it("EQUALS_TO matches exact string", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "EQUALS_TO", value: "Bob" })] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.text("name" as ColumnId)).toBe("Bob");
  });

  it("NOT_EQUALS_TO excludes matching string", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "NOT_EQUALS_TO", value: "Bob" })] });
    expect(result.rows).toHaveLength(3);
  });

  it("GREATER_THAN uses Unicode code point order", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "GREATER_THAN", value: "Charlie" })] });
    expect(result.rows).toHaveLength(1);
  });

  it("LOWER_THAN uses Unicode code point order", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "LOWER_THAN", value: "Bob" })] });
    expect(result.rows).toHaveLength(1);
  });

  it("BETWEEN inclusive on string range", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "BETWEEN", low: "Bob", high: "David" })] });
    expect(result.rows).toHaveLength(3);
  });

  it("IN matches any string in set", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "IN", values: ["Alice", "Charlie"] })] });
    expect(result.rows).toHaveLength(2);
  });

  it("NOT_IN excludes all strings in set", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "NOT_IN", values: ["Alice", "Charlie"] })] });
    expect(result.rows).toHaveLength(2);
  });
});

describe("applyFilter — LIKE_TO", () => {
  it("% matches zero or more characters", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "LIKE_TO", pattern: "%li%", caseSensitive: true })] });
    expect(result.rows).toHaveLength(2);
  });

  it("_ matches exactly one character", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "LIKE_TO", pattern: "Bo_", caseSensitive: true })] });
    expect(result.rows).toHaveLength(1);
  });

  it("case insensitive matching", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "LIKE_TO", pattern: "bob", caseSensitive: false })] });
    expect(result.rows).toHaveLength(1);
  });

  it("exact match without wildcards (anchored)", () => {
    const result = applyFilter(stringDataSet(), { type: "filter", expressions: [sf({ fn: "LIKE_TO", pattern: "Ali", caseSensitive: true })] });
    expect(result.rows).toHaveLength(0);
  });

  it("pattern with literal dot is escaped", () => {
    const ds = toTypedDataSet({
      columns: [col("name", "V", ColumnType.TEXT)],
      data: [["a.b"], ["axb"]],
    });
    const result = applyFilter(ds, { type: "filter", expressions: [
      { type: "string", columnId: "name" as ColumnId, filter: { fn: "LIKE_TO", pattern: "a.b", caseSensitive: true } },
    ]});
    expect(result.rows).toHaveLength(1);
  });

  it("regex metacharacters in pattern are escaped", () => {
    const ds = toTypedDataSet({
      columns: [col("name", "V", ColumnType.TEXT)],
      data: [["a(b)"], ["ab"], ["a+b"]],
    });
    const result = applyFilter(ds, { type: "filter", expressions: [
      { type: "string", columnId: "name" as ColumnId, filter: { fn: "LIKE_TO", pattern: "a(b)", caseSensitive: true } },
    ]});
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.text("name" as ColumnId)).toBe("a(b)");
  });

  it("bracket expression [charlist] passes through", () => {
    const ds = toTypedDataSet({
      columns: [col("name", "V", ColumnType.TEXT)],
      data: [["cat"], ["cut"], ["cot"], ["cit"]],
    });
    const result = applyFilter(ds, { type: "filter", expressions: [
      { type: "string", columnId: "name" as ColumnId, filter: { fn: "LIKE_TO", pattern: "c[ao]t", caseSensitive: true } },
    ]});
    expect(result.rows).toHaveLength(2);
  });

  it("% and _ inside brackets are not replaced", () => {
    const ds = toTypedDataSet({
      columns: [col("name", "V", ColumnType.TEXT)],
      data: [["a%b"], ["a_b"], ["axb"]],
    });
    const result = applyFilter(ds, { type: "filter", expressions: [
      { type: "string", columnId: "name" as ColumnId, filter: { fn: "LIKE_TO", pattern: "a[%_]b", caseSensitive: true } },
    ]});
    expect(result.rows).toHaveLength(2);
  });

  it("LIKE_TO returns false for null cell", () => {
    const ds = toTypedDataSet({
      columns: [col("name", "V", ColumnType.TEXT)],
      data: [[null]],
    });
    const result = applyFilter(ds, { type: "filter", expressions: [
      { type: "string", columnId: "name" as ColumnId, filter: { fn: "LIKE_TO", pattern: "%", caseSensitive: true } },
    ]});
    expect(result.rows).toHaveLength(0);
  });
});

function dateDataSet(): TypedDataSet {
  return toTypedDataSet({
    columns: [col("date", "Date", ColumnType.DATE)],
    data: [
      ["2024-01-15T00:00:00.000Z"],
      ["2024-03-15T00:00:00.000Z"],
      ["2024-06-15T00:00:00.000Z"],
      ["2024-09-15T00:00:00.000Z"],
      ["2024-12-15T00:00:00.000Z"],
    ],
  });
}

describe("applyFilter — date", () => {
  const march = new Date(Date.UTC(2024, 2, 15));

  it("EQUALS_TO matches exact date", () => {
    const result = applyFilter(dateDataSet(), { type: "filter", expressions: [df({ fn: "EQUALS_TO", value: march })] });
    expect(result.rows).toHaveLength(1);
  });

  it("GREATER_THAN filters by timestamp", () => {
    const result = applyFilter(dateDataSet(), { type: "filter", expressions: [df({ fn: "GREATER_THAN", value: march })] });
    expect(result.rows).toHaveLength(3);
  });

  it("BETWEEN inclusive on date range", () => {
    const low = new Date(Date.UTC(2024, 2, 1));
    const high = new Date(Date.UTC(2024, 8, 30));
    const result = applyFilter(dateDataSet(), { type: "filter", expressions: [df({ fn: "BETWEEN", low, high })] });
    expect(result.rows).toHaveLength(3);
  });

  it("TIME_FRAME filters using resolved time range", () => {
    const timeFrame = parseTimeFrame("begin[year] till end[year]");
    const refDate = new Date(Date.UTC(2024, 5, 1));
    const result = applyFilter(
      dateDataSet(),
      { type: "filter", expressions: [df({ fn: "TIME_FRAME", timeFrame })] },
      refDate,
    );
    expect(result.rows).toHaveLength(5);
  });

  it("TIME_FRAME excludes dates outside range", () => {
    const timeFrame = parseTimeFrame("begin[quarter] till end[quarter]");
    const refDate = new Date(Date.UTC(2024, 5, 1));
    const result = applyFilter(
      dateDataSet(),
      { type: "filter", expressions: [df({ fn: "TIME_FRAME", timeFrame })] },
      refDate,
    );
    expect(result.rows).toHaveLength(1);
  });

  it("IS_NULL / NOT_NULL on date column with null", () => {
    const ds = toTypedDataSet({
      columns: [col("date", "Date", ColumnType.DATE)],
      data: [["2024-01-01T00:00:00.000Z"], [null]],
    });
    const nullResult = applyFilter(ds, { type: "filter", expressions: [df({ fn: "IS_NULL" })] });
    expect(nullResult.rows).toHaveLength(1);
    const notNullResult = applyFilter(ds, { type: "filter", expressions: [df({ fn: "NOT_NULL" })] });
    expect(notNullResult.rows).toHaveLength(1);
  });
});

describe("applyFilter — date IN/NOT_IN", () => {
  function dateDataSetForInNotIn(): TypedDataSet {
    return toTypedDataSet({
      columns: [col("date", "Date", ColumnType.DATE)],
      data: [
        ["2024-01-15T00:00:00.000Z"],
        ["2024-06-01T00:00:00.000Z"],
        ["2024-09-20T00:00:00.000Z"],
      ],
    });
  }

  it("IN matches rows with dates in the set", () => {
    const jan = new Date(Date.UTC(2024, 0, 15));
    const sep = new Date(Date.UTC(2024, 8, 20));
    const result = applyFilter(dateDataSetForInNotIn(), { type: "filter", expressions: [df({ fn: "IN", values: [jan, sep] })] });
    expect(result.rows).toHaveLength(2);
  });

  it("IN with no matches returns empty", () => {
    const feb = new Date(Date.UTC(2024, 1, 1));
    const result = applyFilter(dateDataSetForInNotIn(), { type: "filter", expressions: [df({ fn: "IN", values: [feb] })] });
    expect(result.rows).toHaveLength(0);
  });

  it("NOT_IN excludes matching rows", () => {
    const jan = new Date(Date.UTC(2024, 0, 15));
    const result = applyFilter(dateDataSetForInNotIn(), { type: "filter", expressions: [df({ fn: "NOT_IN", values: [jan] })] });
    expect(result.rows).toHaveLength(2);
  });

  it("IN with NULL cell returns false", () => {
    const ds = toTypedDataSet({
      columns: [col("date", "Date", ColumnType.DATE)],
      data: [[null]],
    });
    const jan = new Date(Date.UTC(2024, 0, 15));
    const result = applyFilter(ds, { type: "filter", expressions: [df({ fn: "IN", values: [jan] })] });
    expect(result.rows).toHaveLength(0);
  });
});

describe("applyFilter — logical composition", () => {
  it("AND requires all children to pass", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [{
      type: "and",
      children: [
        nf({ fn: "GREATER_THAN", value: 15 }),
        nf({ fn: "LOWER_THAN", value: 45 }),
      ],
    }]});
    expect(result.rows).toHaveLength(3);
  });

  it("OR requires any child to pass", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [{
      type: "or",
      children: [
        nf({ fn: "EQUALS_TO", value: 10 }),
        nf({ fn: "EQUALS_TO", value: 50 }),
      ],
    }]});
    expect(result.rows).toHaveLength(2);
  });

  it("NOT inverts child", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [{
      type: "not",
      child: nf({ fn: "EQUALS_TO", value: 30 }),
    }]});
    expect(result.rows).toHaveLength(4);
  });

  it("nested: NOT(AND(GT(20), LT(40)))", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [{
      type: "not",
      child: {
        type: "and",
        children: [
          nf({ fn: "GREATER_THAN", value: 20 }),
          nf({ fn: "LOWER_THAN", value: 40 }),
        ],
      },
    }]});
    expect(result.rows).toHaveLength(4);
  });

  it("multiple top-level expressions are implicitly ANDed", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [
      nf({ fn: "GREATER_THAN", value: 15 }),
      nf({ fn: "LOWER_THAN", value: 35 }),
    ]});
    expect(result.rows).toHaveLength(2);
  });

  it("mixed column types in OR", () => {
    const ds = toTypedDataSet({
      columns: [
        col("val", "Value", ColumnType.NUMBER),
        col("name", "Name", ColumnType.LABEL),
      ],
      data: [["10", "Alice"], ["20", "Bob"], ["30", "Charlie"]],
    });
    const result = applyFilter(ds, { type: "filter", expressions: [{
      type: "or",
      children: [
        nf({ fn: "EQUALS_TO", value: 10 }),
        sf({ fn: "EQUALS_TO", value: "Charlie" }),
      ],
    }]});
    expect(result.rows).toHaveLength(2);
  });

  it("empty AND returns all rows", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [{
      type: "and", children: [],
    }]});
    expect(result.rows).toHaveLength(5);
  });

  it("empty OR returns no rows", () => {
    const result = applyFilter(numericDataSet(), { type: "filter", expressions: [{
      type: "or", children: [],
    }]});
    expect(result.rows).toHaveLength(0);
  });
});
