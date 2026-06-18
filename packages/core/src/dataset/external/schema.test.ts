import { describe, it, expect } from "vitest";
import { parseExternalDataSetDef } from "./schema.js";
import { parseRefreshTime } from "./types.js";

const valid = (overrides: Record<string, unknown>) =>
  parseExternalDataSetDef({ uuid: "test-id", url: "https://example.com/api", ...overrides });

describe("ExternalDataSetDef schema", () => {
  it("accepts minimal url-based definition", () => {
    const result = valid({});
    expect(result.uuid).toBe("test-id");
    expect(result.url).toBe("https://example.com/api");
  });

  it("accepts content-based definition", () => {
    const result = parseExternalDataSetDef({ uuid: "x", content: '[{"a":1}]' });
    expect(result.content).toBe('[{"a":1}]');
  });

  it("accepts join-based definition", () => {
    const result = parseExternalDataSetDef({ uuid: "x", join: ["ds-a", "ds-b"] });
    expect(result.join).toEqual(["ds-a", "ds-b"]);
  });

  it("rejects missing uuid", () => {
    expect(() => parseExternalDataSetDef({ url: "https://x.com" })).toThrow();
  });

  it("rejects no data source (no url, content, or join)", () => {
    expect(() => parseExternalDataSetDef({ uuid: "x" })).toThrow(/Exactly one/);
  });

  it("rejects multiple data sources (url + content)", () => {
    expect(() => parseExternalDataSetDef({
      uuid: "x", url: "https://x.com", content: "[]",
    })).toThrow(/Exactly one/);
  });

  it("rejects form + body together", () => {
    expect(() => valid({ form: { a: "1" }, body: '{"a":1}' })).toThrow(/mutually exclusive/);
  });

  it("rejects method without url", () => {
    expect(() => parseExternalDataSetDef({
      uuid: "x", content: "[]", method: "POST",
    })).toThrow(/only valid when url/);
  });

  it("rejects headers without url", () => {
    expect(() => parseExternalDataSetDef({
      uuid: "x", content: "[]", headers: { "X-Key": "v" },
    })).toThrow(/only valid when url/);
  });

  it("rejects extraction fields on join", () => {
    expect(() => parseExternalDataSetDef({
      uuid: "x", join: ["a"], expression: "$.data",
    })).toThrow(/not valid with join/);
  });

  it("rejects extraction fields (type) on join", () => {
    expect(() => parseExternalDataSetDef({
      uuid: "x", join: ["a"], type: "prometheus",
    })).toThrow(/not valid with join/);
  });

  it("rejects extraction fields (dataPath) on join", () => {
    expect(() => parseExternalDataSetDef({
      uuid: "x", join: ["a"], dataPath: "data.items",
    })).toThrow(/not valid with join/);
  });

  it("rejects accumulate without url", () => {
    expect(() => parseExternalDataSetDef({
      uuid: "x", content: "[]", accumulate: true,
    })).toThrow(/only valid when url/);
  });

  it("rejects refreshTime without url", () => {
    expect(() => parseExternalDataSetDef({
      uuid: "x", content: "[]", refreshTime: "10minute",
    })).toThrow(/only valid when url/);
  });

  it("validates refreshTime format", () => {
    expect(() => valid({ refreshTime: "10min" })).toThrow();
    expect(() => valid({ refreshTime: "abc" })).toThrow();
    const result = valid({ refreshTime: "30second" });
    expect(result.refreshTime).toBe("30second");
  });

  it("accepts all valid refreshTime units", () => {
    for (const unit of ["millisecond", "second", "minute", "hour", "day", "week", "month", "quarter", "year"]) {
      expect(valid({ refreshTime: `5${unit}` }).refreshTime).toBe(`5${unit}`);
    }
  });

  it("allows type and expression together (composable pipeline)", () => {
    const result = valid({ type: "prometheus", expression: "$[value > 100]" });
    expect(result.type).toBe("prometheus");
    expect(result.expression).toBe("$[value > 100]");
  });

  it("allows dataPath with type and expression", () => {
    const result = valid({
      dataPath: "data.items",
      type: "prometheus",
      expression: "$[value > 0]",
    });
    expect(result.dataPath).toBe("data.items");
  });

  it("accepts columns with optional name", () => {
    const result = valid({
      columns: [
        { id: "col1", type: "NUMBER" },
        { id: "col2", name: "Column Two", type: "LABEL" },
      ],
    });
    expect(result.columns).toHaveLength(2);
    expect(result.columns![0]!.name).toBeUndefined();
    expect(result.columns![1]!.name).toBe("Column Two");
  });
});

describe("parseRefreshTime", () => {
  it("converts seconds", () => {
    expect(parseRefreshTime("2second")).toBe(2000);
    expect(parseRefreshTime("30second")).toBe(30000);
  });

  it("converts minutes", () => {
    expect(parseRefreshTime("1minute")).toBe(60000);
    expect(parseRefreshTime("5minute")).toBe(300000);
  });

  it("converts milliseconds", () => {
    expect(parseRefreshTime("500millisecond")).toBe(500);
  });

  it("converts hours", () => {
    expect(parseRefreshTime("1hour")).toBe(3600000);
  });

  it("returns default for invalid input", () => {
    expect(parseRefreshTime("bogus")).toBe(10000);
  });
});
