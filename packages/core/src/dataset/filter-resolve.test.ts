import { describe, it, expect } from "vitest";
import { resolveFilterTypes } from "./filter-resolve.js";
import type { FilterExpression, ResolvedFilterExpression } from "./filter.js";
import type { Column, ColumnId } from "./types.js";
import { ColumnType } from "./types.js";
import { DataSetError } from "./errors.js";

const columns: Column[] = [
  { id: "age" as ColumnId, name: "Age", type: ColumnType.NUMBER },
  { id: "name" as ColumnId, name: "Name", type: ColumnType.TEXT },
  { id: "city" as ColumnId, name: "City", type: ColumnType.LABEL },
  { id: "birthdate" as ColumnId, name: "Birth Date", type: ColumnType.DATE },
];

describe("resolveFilterTypes", () => {
  it("resolves unresolved numeric filter to typed variant", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "GREATER_THAN",
      args: ["30"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "numeric",
      columnId: "age",
      filter: { fn: "GREATER_THAN", value: 30 },
    });
  });

  it("resolves unresolved text filter to typed variant", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "name" as ColumnId,
      fn: "EQUALS_TO",
      args: ["John"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "string",
      columnId: "name",
      filter: { fn: "EQUALS_TO", value: "John" },
    });
  });

  it("resolves unresolved label filter to typed variant", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "city" as ColumnId,
      fn: "IN",
      args: ["NYC", "LA"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "string",
      columnId: "city",
      filter: { fn: "IN", values: ["NYC", "LA"] },
    });
  });

  it("resolves unresolved date filter to typed variant", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "birthdate" as ColumnId,
      fn: "LOWER_THAN",
      args: ["2000-01-01T00:00:00Z"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "date",
      columnId: "birthdate",
      filter: { fn: "LOWER_THAN", value: new Date("2000-01-01T00:00:00Z") },
    });
  });

  it("resolves BETWEEN for numeric column", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "BETWEEN",
      args: ["20", "40"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "numeric",
      columnId: "age",
      filter: { fn: "BETWEEN", low: 20, high: 40 },
    });
  });

  it("resolves BETWEEN for date column", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "birthdate" as ColumnId,
      fn: "BETWEEN",
      args: ["2000-01-01T00:00:00Z", "2010-01-01T00:00:00Z"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "date",
      columnId: "birthdate",
      filter: {
        fn: "BETWEEN",
        low: new Date("2000-01-01T00:00:00Z"),
        high: new Date("2010-01-01T00:00:00Z"),
      },
    });
  });

  it("resolves IN for numeric column", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "IN",
      args: ["25", "30", "35"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "numeric",
      columnId: "age",
      filter: { fn: "IN", values: [25, 30, 35] },
    });
  });

  it("resolves NOT_IN for string column", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "name" as ColumnId,
      fn: "NOT_IN",
      args: ["John", "Jane"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "string",
      columnId: "name",
      filter: { fn: "NOT_IN", values: ["John", "Jane"] },
    });
  });

  it("resolves IS_NULL for any column type", () => {
    const numExpr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "IS_NULL",
      args: [],
    };

    const resolved = resolveFilterTypes(numExpr, columns);

    expect(resolved).toEqual({
      type: "numeric",
      columnId: "age",
      filter: { fn: "IS_NULL" },
    });
  });

  it("resolves NOT_NULL for any column type", () => {
    const dateExpr: FilterExpression = {
      type: "unresolved",
      columnId: "birthdate" as ColumnId,
      fn: "NOT_NULL",
      args: [],
    };

    const resolved = resolveFilterTypes(dateExpr, columns);

    expect(resolved).toEqual({
      type: "date",
      columnId: "birthdate",
      filter: { fn: "NOT_NULL" },
    });
  });

  it("resolves TIME_FRAME for date column", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "birthdate" as ColumnId,
      fn: "TIME_FRAME",
      args: ["begin[year] till now"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toMatchObject({
      type: "date",
      columnId: "birthdate",
      filter: {
        fn: "TIME_FRAME",
        timeFrame: {
          from: { mode: "begin", unit: "YEAR" },
          to: { mode: "now" },
        },
      },
    });
  });

  it("resolves LIKE_TO for text column with default caseSensitive", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "name" as ColumnId,
      fn: "LIKE_TO",
      args: ["%john%"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "string",
      columnId: "name",
      filter: { fn: "LIKE_TO", pattern: "%john%", caseSensitive: true },
    });
  });

  it("resolves LIKE_TO for text column with caseSensitive=false", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "name" as ColumnId,
      fn: "LIKE_TO",
      args: ["%john%", "false"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "string",
      columnId: "name",
      filter: { fn: "LIKE_TO", pattern: "%john%", caseSensitive: false },
    });
  });

  it("resolves LIKE_TO for text column with caseSensitive=true", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "name" as ColumnId,
      fn: "LIKE_TO",
      args: ["%john%", "true"],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "string",
      columnId: "name",
      filter: { fn: "LIKE_TO", pattern: "%john%", caseSensitive: true },
    });
  });

  it("recursively resolves AND combinator", () => {
    const expr: FilterExpression = {
      type: "and",
      children: [
        {
          type: "unresolved",
          columnId: "age" as ColumnId,
          fn: "GREATER_THAN",
          args: ["18"],
        },
        {
          type: "unresolved",
          columnId: "name" as ColumnId,
          fn: "EQUALS_TO",
          args: ["John"],
        },
      ],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "and",
      children: [
        {
          type: "numeric",
          columnId: "age",
          filter: { fn: "GREATER_THAN", value: 18 },
        },
        {
          type: "string",
          columnId: "name",
          filter: { fn: "EQUALS_TO", value: "John" },
        },
      ],
    });
  });

  it("recursively resolves OR combinator", () => {
    const expr: FilterExpression = {
      type: "or",
      children: [
        {
          type: "unresolved",
          columnId: "city" as ColumnId,
          fn: "EQUALS_TO",
          args: ["NYC"],
        },
        {
          type: "unresolved",
          columnId: "city" as ColumnId,
          fn: "EQUALS_TO",
          args: ["LA"],
        },
      ],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "or",
      children: [
        {
          type: "string",
          columnId: "city",
          filter: { fn: "EQUALS_TO", value: "NYC" },
        },
        {
          type: "string",
          columnId: "city",
          filter: { fn: "EQUALS_TO", value: "LA" },
        },
      ],
    });
  });

  it("recursively resolves NOT combinator", () => {
    const expr: FilterExpression = {
      type: "not",
      child: {
        type: "unresolved",
        columnId: "age" as ColumnId,
        fn: "LOWER_THAN",
        args: ["18"],
      },
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "not",
      child: {
        type: "numeric",
        columnId: "age",
        filter: { fn: "LOWER_THAN", value: 18 },
      },
    });
  });

  it("recursively resolves nested combinators", () => {
    const expr: FilterExpression = {
      type: "and",
      children: [
        {
          type: "or",
          children: [
            {
              type: "unresolved",
              columnId: "city" as ColumnId,
              fn: "EQUALS_TO",
              args: ["NYC"],
            },
            {
              type: "unresolved",
              columnId: "city" as ColumnId,
              fn: "EQUALS_TO",
              args: ["LA"],
            },
          ],
        },
        {
          type: "not",
          child: {
            type: "unresolved",
            columnId: "age" as ColumnId,
            fn: "LOWER_THAN",
            args: ["18"],
          },
        },
      ],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual({
      type: "and",
      children: [
        {
          type: "or",
          children: [
            {
              type: "string",
              columnId: "city",
              filter: { fn: "EQUALS_TO", value: "NYC" },
            },
            {
              type: "string",
              columnId: "city",
              filter: { fn: "EQUALS_TO", value: "LA" },
            },
          ],
        },
        {
          type: "not",
          child: {
            type: "numeric",
            columnId: "age",
            filter: { fn: "LOWER_THAN", value: 18 },
          },
        },
      ],
    });
  });

  it("passes through already-resolved expressions", () => {
    const expr: ResolvedFilterExpression = {
      type: "numeric",
      columnId: "age" as ColumnId,
      filter: { fn: "GREATER_THAN", value: 30 },
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual(expr);
  });

  it("passes through already-resolved combinators", () => {
    const expr: ResolvedFilterExpression = {
      type: "and",
      children: [
        {
          type: "numeric",
          columnId: "age" as ColumnId,
          filter: { fn: "GREATER_THAN", value: 18 },
        },
        {
          type: "string",
          columnId: "name" as ColumnId,
          filter: { fn: "EQUALS_TO", value: "John" },
        },
      ],
    };

    const resolved = resolveFilterTypes(expr, columns);

    expect(resolved).toEqual(expr);
  });

  it("throws UNKNOWN_COLUMN for missing column", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "unknown" as ColumnId,
      fn: "EQUALS_TO",
      args: ["value"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/UNKNOWN_COLUMN/);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/unknown/);
  });

  it("throws RESOLUTION_FAILED for LIKE_TO on NUMBER", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "LIKE_TO",
      args: ["%pattern%"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/RESOLUTION_FAILED/);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/LIKE_TO.*NUMBER/);
  });

  it("throws RESOLUTION_FAILED for LIKE_TO on DATE", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "birthdate" as ColumnId,
      fn: "LIKE_TO",
      args: ["%pattern%"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/RESOLUTION_FAILED/);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/LIKE_TO.*DATE/);
  });

  it("throws RESOLUTION_FAILED for TIME_FRAME on NUMBER", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "TIME_FRAME",
      args: ["begin[year] till now"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/RESOLUTION_FAILED/);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/TIME_FRAME.*NUMBER/);
  });

  it("throws RESOLUTION_FAILED for TIME_FRAME on TEXT", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "name" as ColumnId,
      fn: "TIME_FRAME",
      args: ["begin[year] till now"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/RESOLUTION_FAILED/);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/TIME_FRAME.*TEXT/);
  });

  it("throws RESOLUTION_FAILED for invalid number parsing", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "EQUALS_TO",
      args: ["not-a-number"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/RESOLUTION_FAILED/);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/not-a-number/);
  });

  it("throws RESOLUTION_FAILED for invalid date parsing", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "birthdate" as ColumnId,
      fn: "EQUALS_TO",
      args: ["not-a-date"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/RESOLUTION_FAILED/);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/not-a-date/);
  });

  it("throws RESOLUTION_FAILED for invalid number in BETWEEN", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "BETWEEN",
      args: ["20", "invalid"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/RESOLUTION_FAILED/);
  });

  it("throws RESOLUTION_FAILED for invalid number in IN", () => {
    const expr: FilterExpression = {
      type: "unresolved",
      columnId: "age" as ColumnId,
      fn: "IN",
      args: ["20", "invalid", "30"],
    };

    expect(() => resolveFilterTypes(expr, columns)).toThrow(DataSetError);
    expect(() => resolveFilterTypes(expr, columns)).toThrow(/RESOLUTION_FAILED/);
  });
});
