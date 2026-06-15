import { describe, it, expect } from "vitest";
import type { Component, GridItem, GridPlacement, AccessControl } from "./types.js";
import { ALLOW_ALL } from "./types.js";

describe("Component", () => {
  it("represents a leaf component", () => {
    const c: Component = {
      type: "html",
      props: { content: "<h1>Hello</h1>" },
    };
    expect(c.type).toBe("html");
    expect(c.props).toEqual({ content: "<h1>Hello</h1>" });
  });

  it("represents a component with slots", () => {
    const child: Component = { type: "html", props: { content: "child" } };
    const parent: Component = {
      type: "tabs",
      slots: { "Tab 1": [child] },
    };
    expect(parent.slots!["Tab 1"]![0]).toBe(child);
  });

  it("represents a grid with items", () => {
    const chart: Component = { type: "bar-chart", props: {} };
    const item: GridItem = {
      placement: { x: 0, y: 0, w: 6, h: 2 },
      component: chart,
    };
    const grid: Component = {
      type: "grid",
      props: { columns: 12 },
      items: [item],
    };
    expect(grid.items![0]!.placement.w).toBe(6);
    expect(grid.items![0]!.component).toBe(chart);
  });

  it("supports optional id, style, and access", () => {
    const c: Component = {
      type: "panel",
      id: "admin-panel",
      props: { title: "Admin" },
      style: { margin: "10px", "background-color": "blue" },
      access: { roles: ["admin"] },
    };
    expect(c.id).toBe("admin-panel");
    expect(c.style!["margin"]).toBe("10px");
    expect(c.access!.roles).toEqual(["admin"]);
  });
});

describe("ALLOW_ALL", () => {
  it("grants all roles and permissions", () => {
    expect(ALLOW_ALL.hasRole("anything")).toBe(true);
    expect(ALLOW_ALL.hasPermission("anything")).toBe(true);
  });
});
