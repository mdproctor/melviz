import { describe, it, expect } from "vitest";
import type { Component } from "@casehub/component/dist/model/types.js";
import { buildPagePathMap } from "./page-paths.js";

describe("buildPagePathMap", () => {
  it("root page maps to empty string", () => {
    const root: Component = { type: "page", props: { name: "App" } };
    const map = buildPagePathMap(root);
    expect(map.get(root)).toBe("");
  });

  it("child pages use slot names as path segments", () => {
    const child: Component = { type: "page", props: { name: "Sales" } };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { Sales: [child] },
    };
    const map = buildPagePathMap(root);
    expect(map.get(child)).toBe("Sales");
  });

  it("nested pages produce multi-segment paths", () => {
    const revenue: Component = { type: "page", props: { name: "Revenue" } };
    const sales: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: { Revenue: [revenue] },
    };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { Sales: [sales] },
    };
    const map = buildPagePathMap(root);
    expect(map.get(revenue)).toBe("Sales/Revenue");
  });

  it("non-page components inherit nearest page ancestor path", () => {
    const chart: Component = { type: "bar-chart", props: { title: "Rev" } };
    const sales: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: { default: [chart] },
    };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { Sales: [sales] },
    };
    const map = buildPagePathMap(root);
    expect(map.get(chart)).toBe("Sales");
  });

  it("every component in the tree gets an entry", () => {
    const chart: Component = { type: "bar-chart" };
    const tabs: Component = { type: "tabs", slots: { Tab1: [chart] } };
    const root: Component = {
      type: "page",
      props: { name: "Root" },
      slots: { default: [tabs] },
    };
    const map = buildPagePathMap(root);
    expect(map.size).toBe(3);
    expect(map.has(root)).toBe(true);
    expect(map.has(tabs)).toBe(true);
    expect(map.has(chart)).toBe(true);
  });

  it("handles grid items", () => {
    const chart: Component = { type: "bar-chart" };
    const grid: Component = {
      type: "grid",
      props: { columns: 12 },
      items: [{ placement: { x: 0, y: 0, w: 12, h: 1 }, component: chart }],
    };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { default: [grid] },
    };
    const map = buildPagePathMap(root);
    expect(map.get(chart)).toBe("");
    expect(map.get(grid)).toBe("");
  });
});
