import { describe, it, expect } from "vitest";
import {
  lookup,
  groupBy,
  groupByCalendar,
  filterBy,
  and,
  or,
  not,
  sortBy,
  col,
  sum,
  avg,
  count,
  min,
  max,
  distinct,
  join,
} from "./lookup-helpers.js";

describe("lookup()", () => {
  it("creates DataSetLookup with branded DataSetId", () => {
    const l = lookup("sales");
    expect(l.dataSetId).toBe("sales");
    expect(l.operations).toEqual([]);
  });

  it("accepts operations", () => {
    const l = lookup("sales", sortBy("revenue", "DESCENDING"));
    expect(l.operations.length).toBe(1);
    expect(l.operations[0]!.type).toBe("sort");
  });
});

describe("groupBy()", () => {
  it("creates group op with distinct strategy default", () => {
    const g = groupBy("region", col("region"), sum("revenue"));
    expect(g.type).toBe("group");
    expect(g.groupingKey!.strategy).toEqual({ mode: "distinct" });
    expect(g.columns.length).toBe(2);
  });

  it("null source produces null groupingKey", () => {
    const g = groupBy(null, sum("revenue"));
    expect(g.groupingKey).toBeNull();
  });

  it("infers key column kind when source matches groupBy source", () => {
    const g = groupBy("region", col("region"));
    expect(g.columns[0]!.kind).toBe("key");
  });

  it("infers select column kind when source differs", () => {
    const g = groupBy("region", col("region"), col("name"));
    expect(g.columns[1]!.kind).toBe("select");
  });
});

describe("groupByCalendar()", () => {
  it("creates group op with fixedCalendar strategy", () => {
    const g = groupByCalendar("created", "MONTH", col("created"), count("id"));
    expect(g.type).toBe("group");
    expect(g.groupingKey!.strategy).toEqual({ mode: "fixedCalendar", unit: "MONTH" });
    expect(g.columns.length).toBe(2);
  });

  it("infers key column kind for calendar group", () => {
    const g = groupByCalendar("created", "DAY_OF_WEEK", col("created"));
    expect(g.columns[0]!.kind).toBe("key");
  });
});

describe("filterBy()", () => {
  it("creates unresolved filter op", () => {
    const f = filterBy("region", "EQUALS_TO", "North");
    expect(f.type).toBe("filter");
    expect(f.expressions.length).toBe(1);
  });

  it("serializes Date args as ISO 8601", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const f = filterBy("created", "GREATER_THAN", date);
    const expr = f.expressions[0] as any;
    expect(expr.args[0]).toBe("2024-06-15T00:00:00.000Z");
  });

  it("serializes number args", () => {
    const f = filterBy("age", "GREATER_THAN", 25);
    const expr = f.expressions[0] as any;
    expect(expr.args[0]).toBe("25");
  });

  it("handles multiple args for BETWEEN", () => {
    const f = filterBy("age", "BETWEEN", 18, 65);
    const expr = f.expressions[0] as any;
    expect(expr.args).toEqual(["18", "65"]);
  });
});

describe("boolean combinators", () => {
  it("and() combines filters", () => {
    const f = and(filterBy("region", "EQUALS_TO", "North"), filterBy("year", "EQUALS_TO", "2024"));
    expect(f.expressions.length).toBe(1);
    expect(f.expressions[0]!.type).toBe("and");
    expect((f.expressions[0] as any).children.length).toBe(2);
  });

  it("or() combines filters", () => {
    const f = or(filterBy("region", "EQUALS_TO", "North"), filterBy("region", "EQUALS_TO", "South"));
    expect(f.expressions[0]!.type).toBe("or");
    expect((f.expressions[0] as any).children.length).toBe(2);
  });

  it("not() wraps a filter", () => {
    const f = not(filterBy("archived", "EQUALS_TO", "true"));
    expect(f.expressions[0]!.type).toBe("not");
  });

  it("combines nested boolean logic", () => {
    const f = and(
      or(filterBy("region", "EQUALS_TO", "North"), filterBy("region", "EQUALS_TO", "South")),
      not(filterBy("archived", "EQUALS_TO", "true")),
    );
    expect(f.expressions[0]!.type).toBe("and");
    const children = (f.expressions[0] as any).children;
    expect(children.length).toBe(2);
    expect(children[0]!.type).toBe("or");
    expect(children[1]!.type).toBe("not");
  });
});

describe("sortBy()", () => {
  it("creates sort op with ASCENDING default", () => {
    const s = sortBy("revenue");
    expect(s.type).toBe("sort");
    expect(s.columns[0]!.order).toBe("ASCENDING");
  });

  it("accepts explicit order", () => {
    const s = sortBy("revenue", "DESCENDING");
    expect(s.columns[0]!.order).toBe("DESCENDING");
  });
});

describe("result column helpers", () => {
  it("col() creates select column by default", () => {
    const c = col("name");
    expect(c.kind).toBe("select");
    expect(c.sourceId).toBe("name");
    expect(c.columnId).toBe("name");
  });

  it("sum() creates aggregate column", () => {
    const c = sum("revenue");
    expect(c.kind).toBe("aggregate");
    expect((c as any).fn).toEqual({ fn: "SUM" });
  });

  it("avg() creates aggregate column", () => {
    const c = avg("revenue");
    expect((c as any).fn).toEqual({ fn: "AVERAGE" });
  });

  it("count() creates aggregate column", () => {
    const c = count("id");
    expect((c as any).fn).toEqual({ fn: "COUNT" });
  });

  it("min() creates aggregate column", () => {
    const c = min("price");
    expect((c as any).fn).toEqual({ fn: "MIN" });
  });

  it("max() creates aggregate column", () => {
    const c = max("price");
    expect((c as any).fn).toEqual({ fn: "MAX" });
  });

  it("distinct() creates aggregate column", () => {
    const c = distinct("category");
    expect((c as any).fn).toEqual({ fn: "DISTINCT" });
  });

  it("join() with default separator", () => {
    const c = join("names");
    expect((c as any).fn).toEqual({ fn: "JOIN", separator: ", " });
  });

  it("join() with custom separator", () => {
    const c = join("names", " | ");
    expect((c as any).fn).toEqual({ fn: "JOIN", separator: " | " });
  });
});

describe("integration examples", () => {
  it("builds complete lookup with group and sort", () => {
    const l = lookup(
      "sales",
      groupBy("region", col("region"), sum("revenue")),
      sortBy("revenue", "DESCENDING"),
    );

    expect(l.dataSetId).toBe("sales");
    expect(l.operations.length).toBe(2);
    expect(l.operations[0]!.type).toBe("group");
    expect(l.operations[1]!.type).toBe("sort");
  });

  it("builds lookup with filter, group, and sort", () => {
    const l = lookup(
      "sales",
      filterBy("year", "EQUALS_TO", "2024"),
      groupBy("region", col("region"), sum("revenue")),
      sortBy("revenue", "DESCENDING"),
    );

    expect(l.operations.length).toBe(3);
    expect(l.operations[0]!.type).toBe("filter");
    expect(l.operations[1]!.type).toBe("group");
    expect(l.operations[2]!.type).toBe("sort");
  });

  it("builds whole-dataset aggregation with null groupBy source", () => {
    const l = lookup("sales", groupBy(null, sum("revenue"), avg("revenue"), count("id")));

    const groupOp = l.operations[0] as any;
    expect(groupOp.groupingKey).toBeNull();
    expect(groupOp.columns.length).toBe(3);
  });

  it("builds calendar grouping with fixedCalendar strategy", () => {
    const l = lookup(
      "events",
      groupByCalendar("created", "MONTH", col("created"), count("id")),
      sortBy("created", "ASCENDING"),
    );

    const groupOp = l.operations[0] as any;
    expect(groupOp.groupingKey.strategy).toEqual({ mode: "fixedCalendar", unit: "MONTH" });
  });
});
