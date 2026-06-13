import { describe, it, expect } from "vitest";
import { compile } from "../../../expression/jsonata-bridge.js";
import { elasticsearchPreset } from "./elasticsearch.js";

const input = {
  took: 5,
  hits: {
    total: { value: 2, relation: "eq" },
    max_score: 1.0,
    hits: [
      {
        _index: "logs-2024",
        _id: "abc123",
        _score: 1.0,
        _source: {
          timestamp: "2024-06-13T10:00:00Z",
          level: "ERROR",
          message: "Connection refused",
        },
      },
      {
        _index: "logs-2024",
        _id: "def456",
        _score: 0.8,
        _source: {
          timestamp: "2024-06-13T10:01:00Z",
          level: "WARN",
          message: "Timeout exceeded",
        },
      },
    ],
  },
};

describe("elasticsearch preset", () => {
  it("has id 'elasticsearch'", () => {
    expect(elasticsearchPreset.id).toBe("elasticsearch");
  });

  it("unwraps hits and flattens _source alongside metadata", async () => {
    const result = await compile(elasticsearchPreset.expression).evaluate(input);
    const rows = Array.isArray(result) ? result : [result];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      _index: "logs-2024",
      _id: "abc123",
      _score: 1.0,
      timestamp: "2024-06-13T10:00:00Z",
      level: "ERROR",
      message: "Connection refused",
    });
    expect(rows[1]).toEqual({
      _index: "logs-2024",
      _id: "def456",
      _score: 0.8,
      timestamp: "2024-06-13T10:01:00Z",
      level: "WARN",
      message: "Timeout exceeded",
    });
  });

  it("handles empty hits", async () => {
    const empty = { took: 0, hits: { total: { value: 0 }, hits: [] } };
    const result = await compile(elasticsearchPreset.expression).evaluate(empty);
    // JSONata returns undefined for empty array navigation
    expect(result === undefined || (Array.isArray(result) && result.length === 0)).toBe(true);
  });
});
