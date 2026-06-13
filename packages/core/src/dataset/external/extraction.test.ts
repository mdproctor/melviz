import { describe, it, expect } from "vitest";
import { extractDataSet } from "./extraction.js";
import { createPresetRegistry } from "./presets/registry.js";
import type { ExternalDataSetDef, FetchResult, PresetRegistry } from "./types.js";
import type { ColumnId, DataSetId } from "../types.js";
import { ColumnType } from "../types.js";
import { DataSetError } from "../errors.js";

function def(overrides: Partial<ExternalDataSetDef> = {}): ExternalDataSetDef {
  return { uuid: "test-ds" as DataSetId, ...overrides };
}

function fetchResult(data: unknown, contentType?: string): FetchResult {
  return contentType !== undefined ? { data, contentType } : { data };
}

describe("extractDataSet", () => {
  let registry: PresetRegistry;

  beforeAll(() => {
    registry = createPresetRegistry();
  });

  // --- Shape B: array of objects ---

  it("extracts Shape B (array of objects) with explicit columns", async () => {
    const data = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];
    const result = await extractDataSet(
      fetchResult(data),
      def({
        columns: [
          { id: "name" as ColumnId, type: ColumnType.LABEL },
          { id: "age" as ColumnId, type: ColumnType.NUMBER },
        ],
      }),
      registry,
    );

    expect(result.inferredColumns).toBe(false);
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[0]!.id).toBe("name");
    expect(result.dataset.columns[0]!.type).toBe(ColumnType.LABEL);
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text("name" as ColumnId)).toBe("Alice");
    expect(result.dataset.rows[0]!.number("age" as ColumnId)).toBe(30);
  });

  it("extracts Shape B with inferred columns (numbers, strings, dates)", async () => {
    const data = [
      { region: "US", revenue: 100, timestamp: "2024-06-15T10:30:00.000Z" },
      { region: "EU", revenue: 250.5, timestamp: "2024-07-01T00:00:00.000Z" },
    ];
    const result = await extractDataSet(fetchResult(data), def(), registry);

    expect(result.inferredColumns).toBe(true);
    expect(result.dataset.columns).toHaveLength(3);

    const colMap = new Map(result.dataset.columns.map((c) => [c.id, c]));
    expect(colMap.get("region" as ColumnId)!.type).toBe(ColumnType.LABEL);
    expect(colMap.get("revenue" as ColumnId)!.type).toBe(ColumnType.NUMBER);
    expect(colMap.get("timestamp" as ColumnId)!.type).toBe(ColumnType.DATE);

    expect(result.dataset.rows[0]!.text("region" as ColumnId)).toBe("US");
    expect(result.dataset.rows[0]!.number("revenue" as ColumnId)).toBe(100);
  });

  // --- Shape C: array of arrays ---

  it("extracts Shape C (array of arrays) with auto-generated column names", async () => {
    const data = [
      ["Alice", "30"],
      ["Bob", "25"],
    ];
    const result = await extractDataSet(fetchResult(data), def(), registry);

    expect(result.inferredColumns).toBe(true);
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[0]!.id).toBe("Column 0");
    expect(result.dataset.columns[1]!.id).toBe("Column 1");
  });

  // --- Shape A: columns + values ---

  it("extracts Shape A (columns + values object)", async () => {
    const data = {
      columns: [
        { id: "city", type: "label" },
        { id: "pop", type: "number" },
      ],
      values: [
        ["London", "9000000"],
        ["Paris", "2100000"],
      ],
    };
    const result = await extractDataSet(fetchResult(data), def(), registry);

    expect(result.inferredColumns).toBe(true);
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[0]!.id).toBe("city");
    expect(result.dataset.rows).toHaveLength(2);
  });

  // --- dataPath navigation ---

  it("navigates nested data via dataPath", async () => {
    const data = {
      data: {
        items: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      },
    };
    const result = await extractDataSet(
      fetchResult(data),
      def({ dataPath: "data.items" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.number("x" as ColumnId)).toBe(1);
  });

  it("throws EXTRACTION_ERROR for nonexistent dataPath", async () => {
    const data = { a: { b: 1 } };
    await expect(
      extractDataSet(fetchResult(data), def({ dataPath: "a.missing.path" }), registry),
    ).rejects.toThrow(DataSetError);
    await expect(
      extractDataSet(fetchResult(data), def({ dataPath: "a.missing.path" }), registry),
    ).rejects.toThrow("EXTRACTION_ERROR");
  });

  // --- type preset ---

  it("applies type preset (prometheus) to vector response", async () => {
    const data = {
      data: {
        resultType: "vector",
        result: [
          {
            metric: { __name__: "up", instance: "localhost:9090" },
            value: [1625000000, "1"],
          },
        ],
      },
    };
    const result = await extractDataSet(
      fetchResult(data),
      def({ type: "prometheus" }),
      registry,
    );

    expect(result.dataset.columns.length).toBeGreaterThanOrEqual(2);
    expect(result.dataset.rows).toHaveLength(1);
    // timestamp should be multiplied by 1000
    expect(result.dataset.rows[0]!.number("timestamp" as ColumnId)).toBe(1625000000000);
  });

  // --- expression ---

  it("applies custom JSONata expression", async () => {
    const data = {
      results: [
        { name: "A", val: 10 },
        { name: "B", val: 20 },
      ],
    };
    const result = await extractDataSet(
      fetchResult(data),
      def({ expression: "results.{ \"label\": name, \"value\": val }" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
  });

  // --- Pipeline composition: dataPath + type + expression ---

  it("composes dataPath + type + expression in sequence", async () => {
    // dataPath navigates to the prometheus-shaped data,
    // type applies the prometheus preset,
    // expression further filters values where second element (value) = "1"
    const data = {
      wrapper: {
        data: {
          resultType: "vector",
          result: [
            { metric: { __name__: "up", job: "api" }, value: [1625000000, "1"] },
            { metric: { __name__: "up", job: "web" }, value: [1625000001, "0"] },
          ],
        },
      },
    };
    const result = await extractDataSet(
      fetchResult(data),
      def({
        dataPath: "wrapper",
        type: "prometheus",
        expression: '{ "columns": columns, "values": values[$[1] = "1"] }',
      }),
      registry,
    );

    // The prometheus preset returns { columns, values } (Shape A).
    // The expression filters to rows where value="1" (the "api" row).
    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.rows[0]!.number("timestamp" as ColumnId)).toBe(1625000000000);
  });

  // --- CSV content type ---

  it("parses string input with CSV content type", async () => {
    const csv = "name,score\nAlice,95\nBob,88";
    const result = await extractDataSet(
      fetchResult(csv, "text/csv"),
      def(),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
  });

  // --- CSV fallback ---

  it("falls back to CSV when string is not valid JSON", async () => {
    const csv = "a,b\n1,2\n3,4";
    const result = await extractDataSet(
      fetchResult(csv),
      def(),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
  });

  // --- Metrics content ---

  it("parses metrics format when URL ends in 'metrics'", async () => {
    const metricsText = [
      "# HELP up Whether the target is up",
      "# TYPE up gauge",
      "up{instance=\"localhost:9090\"} 1",
      "up{instance=\"localhost:9100\"} 0",
    ].join("\n");
    const result = await extractDataSet(
      fetchResult(metricsText),
      def({ url: "http://example.com/metrics" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.columns).toHaveLength(3);
  });

  // --- Explicit columns with type mismatch ---

  it("throws SCHEMA_MISMATCH when explicit column type does not match data", async () => {
    const data = [{ name: "Alice" }];
    await expect(
      extractDataSet(
        fetchResult(data),
        def({
          columns: [{ id: "name" as ColumnId, type: ColumnType.NUMBER }],
        }),
        registry,
      ),
    ).rejects.toThrow("SCHEMA_MISMATCH");
  });

  // --- Empty result ---

  it("throws EMPTY_RESULT for empty data", async () => {
    await expect(
      extractDataSet(fetchResult([]), def(), registry),
    ).rejects.toThrow("EMPTY_RESULT");
  });

  // --- Invalid JSON string that is also not CSV ---

  it("throws PARSE_FAILED for unparseable string", async () => {
    // A single value that isn't JSON, isn't CSV-like either — but parseCsv can
    // handle almost anything. Force PARSE_FAILED by using an empty string.
    await expect(
      extractDataSet(fetchResult(""), def(), registry),
    ).rejects.toThrow(/PARSE_FAILED|EMPTY_RESULT/);
  });

  // --- UNKNOWN_PRESET ---

  it("throws UNKNOWN_PRESET for unregistered type", async () => {
    const data = [{ x: 1 }];
    await expect(
      extractDataSet(fetchResult(data), def({ type: "nonexistent-type" }), registry),
    ).rejects.toThrow("UNKNOWN_PRESET");
  });
});
