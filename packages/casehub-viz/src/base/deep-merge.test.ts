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

  it("merges arrays element-by-element (objects merged, primitives replaced)", () => {
    expect(deepMerge(
      { series: [{ type: "bar", encode: { x: 0 } }, { type: "line", encode: { x: 0 } }] },
      { series: [{ itemStyle: { decal: "rect" } }, { itemStyle: { decal: "pin" } }] },
    )).toEqual({
      series: [
        { type: "bar", encode: { x: 0 }, itemStyle: { decal: "rect" } },
        { type: "line", encode: { x: 0 }, itemStyle: { decal: "pin" } },
      ],
    });
  });

  it("appends extra override array elements beyond base length", () => {
    expect(deepMerge(
      { series: [{ type: "bar" }] },
      { series: [{ color: "red" }, { type: "line" }] },
    )).toEqual({ series: [{ type: "bar", color: "red" }, { type: "line" }] });
  });

  it("preserves base array elements when override is shorter", () => {
    expect(deepMerge(
      { series: [{ type: "bar" }, { type: "line" }] },
      { series: [{ color: "red" }] },
    )).toEqual({ series: [{ type: "bar", color: "red" }, { type: "line" }] });
  });

  it("applies object override to each element of array base", () => {
    expect(deepMerge(
      { series: [{ type: "bar", encode: { x: 0 } }, { type: "bar", encode: { x: 1 } }] },
      { series: { barCategoryGap: "1%" } },
    )).toEqual({
      series: [
        { type: "bar", encode: { x: 0 }, barCategoryGap: "1%" },
        { type: "bar", encode: { x: 1 }, barCategoryGap: "1%" },
      ],
    });
  });

  it("replaces primitive array elements", () => {
    expect(deepMerge(
      { color: ["blue", "green"] },
      { color: ["red", "yellow", "purple"] },
    )).toEqual({ color: ["red", "yellow", "purple"] });
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
