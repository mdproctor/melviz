import { describe, it, expect } from "vitest";
import { extractDataSet } from "./extraction.js";
import { createPresetRegistry } from "./index.js";
import type { ExternalDataSetDef } from "./types.js";

const emptyDef: ExternalDataSetDef = { uuid: "test" as any };
const presets = createPresetRegistry();

describe("JSON parsing resilience for inline content", () => {
  it("parses clean JSON array of arrays", async () => {
    const result = await extractDataSet(
      { data: '[["A", 1], ["B", 2]]' },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.columns[0].id).toBe("Column 0");
  });

  it("strips trailing comma after last array element", async () => {
    const result = await extractDataSet(
      { data: '[["A", 1], ["B", 2],]' },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
  });

  it("strips trailing comma after last object in array", async () => {
    const result = await extractDataSet(
      { data: '[{"name": "A", "val": 1}, {"name": "B", "val": 2},]' },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
  });

  it("strips trailing comma in nested arrays", async () => {
    const result = await extractDataSet(
      { data: '[["Hello", 20, 12,], ["World", 10, 25,],]' },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.columns).toHaveLength(3);
  });

  it("preserves valid JSON without trailing commas", async () => {
    const result = await extractDataSet(
      { data: '[["A", 1], ["B", 2]]' },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
  });

  it("auto-generates Column N names for array-of-arrays", async () => {
    const result = await extractDataSet(
      { data: '[["X", 10, 20], ["Y", 30, 40]]' },
      emptyDef,
      presets,
    );
    expect(result.dataset.columns.map(c => c.id)).toEqual(["Column 0", "Column 1", "Column 2"]);
  });

  it("uses object keys as column names for array-of-objects", async () => {
    const result = await extractDataSet(
      { data: '[{"name": "A", "value": 1}]' },
      emptyDef,
      presets,
    );
    expect(result.dataset.columns.map(c => c.id)).toEqual(["name", "value"]);
  });

  it("handles multiline JSON content from YAML folded scalar", async () => {
    const content = '[\n    ["Hello", 20, 12],\n    ["World", 10, 25],\n]';
    const result = await extractDataSet(
      { data: content },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
  });

  it("falls back to CSV when JSON is truly invalid", async () => {
    const result = await extractDataSet(
      { data: "name,value\nA,1\nB,2" },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
  });

  it("treats flat array of primitives as single-row dataset", async () => {
    const result = await extractDataSet(
      { data: '["ABC", 1]' },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[0].id).toBe("Column 0");
  });

  it("treats flat array with single-quoted values as single-row dataset", async () => {
    const result = await extractDataSet(
      { data: "['2023-06-21T16:46:21.802Z']" },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.columns).toHaveLength(1);
  });

  it("throws on empty input", async () => {
    await expect(
      extractDataSet({ data: "" }, emptyDef, presets),
    ).rejects.toThrow("PARSE_FAILED");
  });

  it("converts single quotes to double quotes for JSON parsing", async () => {
    // Flat array ['ABC', 1] is not a tabular shape — extraction fails.
    // But the JSON parsing itself succeeds (single quotes are converted).
    // Nested arrays with single quotes work:
    const result = await extractDataSet(
      { data: "[['ABC', 1], ['DEF', 2]]" },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
  });

  it("handles single-quoted strings in nested arrays", async () => {
    const result = await extractDataSet(
      { data: "[['Hello', 20], ['World', 10]]" },
      emptyDef,
      presets,
    );
    expect(result.dataset.rows).toHaveLength(2);
  });

  it("throws on whitespace-only input", async () => {
    await expect(
      extractDataSet({ data: "   \n  " }, emptyDef, presets),
    ).rejects.toThrow("PARSE_FAILED");
  });
});
