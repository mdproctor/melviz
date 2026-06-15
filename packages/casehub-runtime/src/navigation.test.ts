import { describe, it, expect } from "vitest";
import type { Component } from "@casehub/component/dist/model/types.js";
import { buildPageIndex, computeCurrentPage } from "./navigation.js";
import { buildPagePathMap } from "./page-paths.js";

describe("buildPageIndex", () => {
  it("maps page paths to components", () => {
    const sales: Component = { type: "page", props: { name: "Sales" } };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { Sales: [sales] },
    };
    const paths = buildPagePathMap(root);
    const index = buildPageIndex(root, paths);
    expect(index.get("")).toBe(root);
    expect(index.get("Sales")).toBe(sales);
  });

  it("includes nested pages", () => {
    const detail: Component = { type: "page", props: { name: "Detail" } };
    const sales: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: { Detail: [detail] },
    };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { Sales: [sales] },
    };
    const paths = buildPagePathMap(root);
    const index = buildPageIndex(root, paths);
    expect(index.size).toBe(3);
    expect(index.get("Sales/Detail")).toBe(detail);
  });

  it("skips non-page components", () => {
    const chart: Component = { type: "bar-chart" };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: { default: [chart] },
    };
    const paths = buildPagePathMap(root);
    const index = buildPageIndex(root, paths);
    expect(index.size).toBe(1);
  });
});

describe("computeCurrentPage", () => {
  it("returns empty string with no active slots", () => {
    const root: Component = { type: "page", props: { name: "App" } };
    const activeSlots = new Map<string, string>();
    const result = computeCurrentPage(root, activeSlots);
    expect(result).toBe("");
  });

  it("returns single segment for one-level navigation", () => {
    const overview: Component = { type: "page", props: { name: "Overview" } };
    const sales: Component = { type: "page", props: { name: "Sales" } };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: {
        default: [{
          type: "sidebar",
          id: "nav-1",
          slots: {
            Overview: [overview],
            Sales: [sales],
          },
        }],
      },
    };
    const activeSlots = new Map([["nav-1", "Sales"]]);
    const result = computeCurrentPage(root, activeSlots);
    expect(result).toBe("Sales");
  });

  it("returns multi-segment path for nested navigation", () => {
    const revenue: Component = { type: "page", props: { name: "Revenue" } };
    const costs: Component = { type: "page", props: { name: "Costs" } };
    const sales: Component = {
      type: "page",
      props: { name: "Sales" },
      slots: {
        default: [{
          type: "tabs",
          id: "tabs-1",
          slots: {
            Revenue: [revenue],
            Costs: [costs],
          },
        }],
      },
    };
    const overview: Component = { type: "page", props: { name: "Overview" } };
    const root: Component = {
      type: "page",
      props: { name: "App" },
      slots: {
        default: [{
          type: "sidebar",
          id: "nav-1",
          slots: {
            Overview: [overview],
            Sales: [sales],
          },
        }],
      },
    };
    const activeSlots = new Map([["nav-1", "Sales"], ["tabs-1", "Revenue"]]);
    const result = computeCurrentPage(root, activeSlots);
    expect(result).toBe("Sales/Revenue");
  });
});
