import { describe, it, expect } from "vitest";
import { deepMerge } from "./deep-merge.js";

describe("deepMerge", () => {
  it("merges flat objects", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("deep-merges nested objects", () => {
    expect(deepMerge(
      { xAxis: { type: "category", name: "X" } },
      { xAxis: { name: "Revenue" } },
    )).toEqual({ xAxis: { type: "category", name: "Revenue" } });
  });

  it("replaces arrays entirely", () => {
    expect(deepMerge(
      { series: [{ type: "bar" }, { type: "line" }] },
      { series: [{ type: "scatter" }] },
    )).toEqual({ series: [{ type: "scatter" }] });
  });

  it("replaces primitives", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("override wins over base for type conflicts", () => {
    expect(deepMerge({ a: { b: 1 } }, { a: 42 })).toEqual({ a: 42 });
  });

  it("handles undefined override values", () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: undefined })).toEqual({ a: 1, b: undefined });
  });

  it("returns base when override is empty", () => {
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });

  it("handles null values", () => {
    expect(deepMerge({ a: 1 }, { a: null })).toEqual({ a: null });
  });
});
