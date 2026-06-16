import { describe, it, expect } from "vitest";
import { parseLookup } from "./lookup-parser.js";
import type { DataSetId, ColumnId } from "./types.js";
import { ZodError } from "zod";

describe("parseLookup", () => {
  it("parses uuid-only lookup", () => {
    const raw = {
      uuid: "dataset-1",
    };

    const lookup = parseLookup(raw);

    expect(lookup.dataSetId).toBe("dataset-1");
    expect(lookup.operations).toEqual([]);
  });

  it("parses flat filter list as implicit AND of unresolved", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        { column: "age", function: "GREATER_THAN", args: ["18"] },
        { column: "name", function: "EQUALS_TO", args: ["John"] },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations).toHaveLength(1);
    expect(lookup.operations[0]).toEqual({
      type: "filter",
      expressions: [
        {
          type: "unresolved",
          columnId: "age",
          fn: "GREATER_THAN",
          args: ["18"],
        },
        {
          type: "unresolved",
          columnId: "name",
          fn: "EQUALS_TO",
          args: ["John"],
        },
      ],
    });
  });

  it("parses nested OR combinator", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        {
          or: [
            { column: "city", function: "EQUALS_TO", args: ["NYC"] },
            { column: "city", function: "EQUALS_TO", args: ["LA"] },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "filter",
      expressions: [
        {
          type: "or",
          children: [
            {
              type: "unresolved",
              columnId: "city",
              fn: "EQUALS_TO",
              args: ["NYC"],
            },
            {
              type: "unresolved",
              columnId: "city",
              fn: "EQUALS_TO",
              args: ["LA"],
            },
          ],
        },
      ],
    });
  });

  it("parses nested AND combinator", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        {
          and: [
            { column: "age", function: "GREATER_THAN", args: ["18"] },
            { column: "age", function: "LOWER_THAN", args: ["65"] },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "filter",
      expressions: [
        {
          type: "and",
          children: [
            {
              type: "unresolved",
              columnId: "age",
              fn: "GREATER_THAN",
              args: ["18"],
            },
            {
              type: "unresolved",
              columnId: "age",
              fn: "LOWER_THAN",
              args: ["65"],
            },
          ],
        },
      ],
    });
  });

  it("parses NOT combinator", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        {
          not: { column: "age", function: "LOWER_THAN", args: ["18"] },
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "filter",
      expressions: [
        {
          type: "not",
          child: {
            type: "unresolved",
            columnId: "age",
            fn: "LOWER_THAN",
            args: ["18"],
          },
        },
      ],
    });
  });

  it("parses deeply nested combinators", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        {
          and: [
            {
              or: [
                { column: "city", function: "EQUALS_TO", args: ["NYC"] },
                { column: "city", function: "EQUALS_TO", args: ["LA"] },
              ],
            },
            {
              not: { column: "age", function: "LOWER_THAN", args: ["18"] },
            },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "filter",
      expressions: [
        {
          type: "and",
          children: [
            {
              type: "or",
              children: [
                {
                  type: "unresolved",
                  columnId: "city",
                  fn: "EQUALS_TO",
                  args: ["NYC"],
                },
                {
                  type: "unresolved",
                  columnId: "city",
                  fn: "EQUALS_TO",
                  args: ["LA"],
                },
              ],
            },
            {
              type: "not",
              child: {
                type: "unresolved",
                columnId: "age",
                fn: "LOWER_THAN",
                args: ["18"],
              },
            },
          ],
        },
      ],
    });
  });

  it("throws ZodError for unknown function", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        { column: "age", function: "UNKNOWN_FN", args: ["18"] },
      ],
    };

    expect(() => parseLookup(raw)).toThrow(ZodError);
  });

  it("parses group with key, aggregate, and select inference", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "department",
            strategy: "distinct",
          },
          columns: [
            { source: "department" }, // key (matches columnGroup)
            { source: "salary", function: "AVERAGE" }, // aggregate
            { source: "name" }, // select
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations).toHaveLength(1);
    expect(lookup.operations[0]).toEqual({
      type: "group",
      groupingKey: {
        sourceId: "department",
        columnId: "department",
        strategy: { mode: "distinct" },
        maxIntervals: 15,
        emptyIntervals: false,
        ascendingOrder: true,
      },
      columns: [
        { kind: "key", sourceId: "department", columnId: "department" },
        { kind: "aggregate", sourceId: "salary", columnId: "salary", fn: { fn: "AVERAGE" } },
        { kind: "select", sourceId: "name", columnId: "name" },
      ],
    });
  });

  it("parses group without columnGroup (null groupingKey)", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columns: [
            { source: "salary", function: "SUM" },
            { source: "count", function: "COUNT" },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "group",
      groupingKey: null,
      columns: [
        { kind: "aggregate", sourceId: "salary", columnId: "salary", fn: { fn: "SUM" } },
        { kind: "aggregate", sourceId: "count", columnId: "count", fn: { fn: "COUNT" } },
      ],
    });
  });

  it("parses fixedCalendar strategy", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "date",
            strategy: "fixedCalendar",
            unit: "MONTH",
            maxIntervals: 12,
          },
          columns: [
            { source: "date" },
            { source: "sales", function: "SUM" },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toMatchObject({
      type: "group",
      groupingKey: {
        strategy: { mode: "fixedCalendar", unit: "MONTH" },
        maxIntervals: 12,
      },
    });
  });

  it("parses dynamicRange strategy with preferredUnit", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "date",
            strategy: "dynamicRange",
            preferredUnit: "DAY",
          },
          columns: [
            { source: "date" },
            { source: "sales", function: "SUM" },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toMatchObject({
      type: "group",
      groupingKey: {
        strategy: { mode: "dynamicRange", preferredUnit: "DAY" },
      },
    });
  });

  it("parses dynamic strategy", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "date",
            strategy: "dynamic",
          },
          columns: [
            { source: "date" },
            { source: "sales", function: "SUM" },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toMatchObject({
      type: "group",
      groupingKey: {
        strategy: { mode: "dynamic" },
      },
    });
  });

  it("parses firstMonthOfYear and firstDayOfWeek", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "date",
            strategy: "fixedCalendar",
            unit: "QUARTER",
            firstMonthOfYear: "APRIL",
            firstDayOfWeek: "MONDAY",
          },
          columns: [
            { source: "date" },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toMatchObject({
      type: "group",
      groupingKey: {
        firstMonthOfYear: 4,
        firstDayOfWeek: 1,
      },
    });
  });

  it("parses JOIN aggregation with custom separator", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "category",
            strategy: "distinct",
          },
          columns: [
            { source: "category" },
            { source: "names", function: "JOIN", separator: "; " },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toMatchObject({
      type: "group",
      columns: [
        { kind: "key", sourceId: "category", columnId: "category" },
        {
          kind: "aggregate",
          sourceId: "names",
          columnId: "names",
          fn: { fn: "JOIN", separator: "; " },
        },
      ],
    });
  });

  it("parses JOIN aggregation with default separator", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columns: [
            { source: "names", function: "JOIN" },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toMatchObject({
      columns: [
        {
          kind: "aggregate",
          fn: { fn: "JOIN", separator: ", " },
        },
      ],
    });
  });

  it("parses selectedIntervals and join", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "date",
            strategy: "fixedCalendar",
            unit: "MONTH",
          },
          columns: [
            { source: "date" },
          ],
          selectedIntervals: ["January", "February", "March"],
          join: true,
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toMatchObject({
      type: "group",
      selectedIntervals: ["January", "February", "March"],
      join: true,
    });
  });

  it("parses sort with default ASCENDING order", () => {
    const raw = {
      uuid: "dataset-1",
      sort: [
        { column: "name", order: "ASCENDING" },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations).toHaveLength(1);
    expect(lookup.operations[0]).toEqual({
      type: "sort",
      columns: [
        { columnId: "name", order: "ASCENDING" },
      ],
    });
  });

  it("parses sort with DESCENDING order", () => {
    const raw = {
      uuid: "dataset-1",
      sort: [
        { column: "age", order: "DESCENDING" },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "sort",
      columns: [
        { columnId: "age", order: "DESCENDING" },
      ],
    });
  });

  it("parses sort with multiple columns", () => {
    const raw = {
      uuid: "dataset-1",
      sort: [
        { column: "department", order: "ASCENDING" },
        { column: "salary", order: "DESCENDING" },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "sort",
      columns: [
        { columnId: "department", order: "ASCENDING" },
        { columnId: "salary", order: "DESCENDING" },
      ],
    });
  });

  it("parses full pipeline: filter + group + sort", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        { column: "age", function: "GREATER_THAN", args: ["18"] },
      ],
      group: [
        {
          columnGroup: {
            source: "department",
            strategy: "distinct",
          },
          columns: [
            { source: "department" },
            { source: "salary", function: "AVERAGE" },
          ],
        },
      ],
      sort: [
        { column: "salary", order: "DESCENDING" },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations).toHaveLength(3);
    expect(lookup.operations[0]?.type).toBe("filter");
    expect(lookup.operations[1]?.type).toBe("group");
    expect(lookup.operations[2]?.type).toBe("sort");
  });

  it("returns empty dataSetId when uuid is missing (inherited from global defaults)", () => {
    const raw = {
      filter: [
        { column: "age", function: "GREATER_THAN", args: ["18"] },
      ],
    };

    const lookup = parseLookup(raw);
    expect(lookup.dataSetId).toBe("");
    expect(lookup.operations).toHaveLength(1);
  });

  it("throws ZodError for missing column in filter", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        { function: "GREATER_THAN", args: ["18"] },
      ],
    };

    expect(() => parseLookup(raw)).toThrow(ZodError);
  });

  it("parses numeric args correctly", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        { column: "age", function: "BETWEEN", args: [18, 65] },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "filter",
      expressions: [
        {
          type: "unresolved",
          columnId: "age",
          fn: "BETWEEN",
          args: ["18", "65"], // converted to strings
        },
      ],
    });
  });

  it("parses custom column id in group", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "dept_code",
            id: "department",
            strategy: "distinct",
          },
          columns: [
            { source: "dept_code", id: "department" },
            { source: "salary_amt", id: "salary", function: "AVERAGE" },
          ],
        },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toMatchObject({
      type: "group",
      groupingKey: {
        sourceId: "dept_code",
        columnId: "department",
      },
      columns: [
        { kind: "key", sourceId: "dept_code", columnId: "department" },
        { kind: "aggregate", sourceId: "salary_amt", columnId: "salary" },
      ],
    });
  });

  it("defaults empty args array", () => {
    const raw = {
      uuid: "dataset-1",
      filter: [
        { column: "age", function: "IS_NULL" },
      ],
    };

    const lookup = parseLookup(raw);

    expect(lookup.operations[0]).toEqual({
      type: "filter",
      expressions: [
        {
          type: "unresolved",
          columnId: "age",
          fn: "IS_NULL",
          args: [],
        },
      ],
    });
  });

  it("throws for fixedCalendar without unit", () => {
    const raw = {
      uuid: "dataset-1",
      group: [
        {
          columnGroup: {
            source: "date",
            strategy: "fixedCalendar",
          },
          columns: [
            { source: "date" },
          ],
        },
      ],
    };

    expect(() => parseLookup(raw)).toThrow(/requires 'unit'/);
  });

  // --- Legacy DashBuilder field aliases ---

  it("accepts dataSetUuid as alias for uuid", () => {
    const lookup = parseLookup({ dataSetUuid: "legacy-ds" });
    expect(lookup.dataSetId).toBe("legacy-ds");
  });

  it("accepts groupOps as alias for group", () => {
    const lookup = parseLookup({
      uuid: "ds",
      groupOps: [{
        columnGroup: { source: "cat" },
        functions: [{ source: "cat" }, { source: "val", function: "SUM" }],
      }],
    });
    expect(lookup.operations).toHaveLength(1);
    expect(lookup.operations[0].type).toBe("group");
  });

  it("accepts sortOps as alias for sort", () => {
    const lookup = parseLookup({
      uuid: "ds",
      sortOps: [{ column: "name", sortOrder: "DESCENDING" }],
    });
    expect(lookup.operations).toHaveLength(1);
    expect(lookup.operations[0].type).toBe("sort");
    expect((lookup.operations[0] as any).columns[0].order).toBe("DESCENDING");
  });

  it("accepts functions as alias for columns in group entries", () => {
    const lookup = parseLookup({
      uuid: "ds",
      group: [{
        columnGroup: { source: "dept" },
        functions: [{ source: "dept" }, { source: "sal", function: "AVERAGE" }],
      }],
    });
    const groupOp = lookup.operations[0] as any;
    expect(groupOp.columns).toHaveLength(2);
    expect(groupOp.columns[0].kind).toBe("key");
    expect(groupOp.columns[1].kind).toBe("aggregate");
  });

  it("accepts lowercase function names (count → COUNT)", () => {
    const lookup = parseLookup({
      uuid: "ds",
      group: [{
        columnGroup: { source: "dept" },
        functions: [{ source: "dept" }, { source: "val", function: "count" }],
      }],
    });
    const groupOp = lookup.operations[0] as any;
    expect(groupOp.columns[1].fn.fn).toBe("COUNT");
  });

  it("accepts groupStrategy as alias for strategy", () => {
    const lookup = parseLookup({
      uuid: "ds",
      group: [{
        columnGroup: { source: "date", groupStrategy: "DYNAMIC" },
        functions: [{ source: "date" }],
      }],
    });
    const groupOp = lookup.operations[0] as any;
    expect(groupOp.groupingKey.strategy.mode).toBe("dynamic");
  });

  it("accepts sortOrder as alias for order in sort columns", () => {
    const lookup = parseLookup({
      uuid: "ds",
      sort: [{ column: "name", sortOrder: "DESCENDING" }],
    });
    const sortOp = lookup.operations[0] as any;
    expect(sortOp.columns[0].order).toBe("DESCENDING");
  });

  it("accepts column as alias for id in group result columns", () => {
    const lookup = parseLookup({
      uuid: "ds",
      group: [{
        functions: [{ source: "salary", function: "SUM", column: "Total" }],
      }],
    });
    const groupOp = lookup.operations[0] as any;
    expect(groupOp.columns[0].columnId).toBe("Total");
  });
});
