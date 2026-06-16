import { describe, it, expect } from "vitest";
import { parsePage } from "./page-parser.js";
import type { Component, GridItem } from "../model/types.js";

/**
 * Extract flat list of {type, x, y, w, h} from a parsed page's grid items,
 * recursing into grid wrapper components (row-level properties and nested
 * rows both create these). Inner items inherit the wrapper's offset and
 * have their width capped to the wrapper's width.
 */
function placements(yaml: unknown): { type: string; x: number; y: number; w: number; h: number }[] {
  const root = parsePage(yaml);
  const page = root.slots!["content"]![0]!;
  return flattenItems(page.items ?? []);
}

function flattenItems(
  items: readonly GridItem[],
  offsetX = 0,
  offsetY = 0,
  maxW = 12,
): { type: string; x: number; y: number; w: number; h: number }[] {
  const result: { type: string; x: number; y: number; w: number; h: number }[] = [];
  for (const item of items) {
    if (item.component.type === "grid" && item.component.items) {
      const wx = offsetX + item.placement.x;
      const wy = offsetY + item.placement.y;
      const ww = Math.min(item.placement.w, maxW);
      for (const sub of flattenItems(item.component.items, wx, wy, ww)) {
        result.push(sub);
      }
    } else {
      result.push({
        type: item.component.type,
        x: offsetX + item.placement.x,
        y: offsetY + item.placement.y,
        w: Math.min(item.placement.w, maxW),
        h: item.placement.h,
      });
    }
  }
  return result;
}

/**
 * Return the raw items array from the first page (no flattening).
 */
function rawItems(yaml: unknown): readonly GridItem[] {
  const root = parsePage(yaml);
  const page = root.slots!["content"]![0]!;
  return page.items ?? [];
}

// ─── Single row ──────────────────────────────────────────────────────

describe("layout placement: single row", () => {
  it("one column, full width", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [{ components: [{ html: "A" }] }] }] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 12, h: 1 },
    ]);
  });

  it("two columns, equal split", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [
        { span: 6, components: [{ html: "L" }] },
        { span: 6, components: [{ html: "R" }] },
      ] }] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 6, h: 1 },
      { type: "html", x: 6, y: 0, w: 6, h: 1 },
    ]);
  });

  it("three columns, 4-4-4 split", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [
        { span: 4, components: [{ html: "A" }] },
        { span: 4, components: [{ html: "B" }] },
        { span: 4, components: [{ html: "C" }] },
      ] }] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 4, h: 1 },
      { type: "html", x: 4, y: 0, w: 4, h: 1 },
      { type: "html", x: 8, y: 0, w: 4, h: 1 },
    ]);
  });

  it("asymmetric columns 3-9", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [
        { span: 3, components: [{ html: "sidebar" }] },
        { span: 9, components: [{ html: "main" }] },
      ] }] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 3, h: 1 },
      { type: "html", x: 3, y: 0, w: 9, h: 1 },
    ]);
  });
});

// ─── Multiple rows ───────────────────────────────────────────────────

describe("layout placement: multiple rows", () => {
  it("two full-width rows", () => {
    const p = placements({
      pages: [{ rows: [
        { columns: [{ components: [{ html: "row1" }] }] },
        { columns: [{ components: [{ html: "row2" }] }] },
      ] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 12, h: 1 },
      { type: "html", x: 0, y: 1, w: 12, h: 1 },
    ]);
  });

  it("three rows with different column counts", () => {
    const p = placements({
      pages: [{ rows: [
        { columns: [{ span: 12, components: [{ html: "header" }] }] },
        { columns: [
          { span: 6, components: [{ html: "left" }] },
          { span: 6, components: [{ html: "right" }] },
        ] },
        { columns: [{ span: 12, components: [{ html: "footer" }] }] },
      ] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 12, h: 1 },
      { type: "html", x: 0, y: 1, w: 6, h: 1 },
      { type: "html", x: 6, y: 1, w: 6, h: 1 },
      { type: "html", x: 0, y: 2, w: 12, h: 1 },
    ]);
  });
});

// ─── Multiple components in a column ────────────────────────────────

describe("layout placement: multiple components per column", () => {
  it("two components stack vertically within a column", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [
        { span: 6, components: [{ html: "A" }, { html: "B" }] },
        { span: 6, components: [{ html: "C" }] },
      ] }] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 6, h: 1 },
      { type: "html", x: 0, y: 1, w: 6, h: 1 },
      { type: "html", x: 6, y: 0, w: 6, h: 1 },
    ]);
  });

  it("y advances by max components across columns", () => {
    const p = placements({
      pages: [{ rows: [
        { columns: [
          { span: 6, components: [{ html: "A1" }, { html: "A2" }, { html: "A3" }] },
          { span: 6, components: [{ html: "B1" }] },
        ] },
        { columns: [{ span: 12, components: [{ html: "next-row" }] }] },
      ] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 6, h: 1 },
      { type: "html", x: 0, y: 1, w: 6, h: 1 },
      { type: "html", x: 0, y: 2, w: 6, h: 1 },
      { type: "html", x: 6, y: 0, w: 6, h: 1 },
      { type: "html", x: 0, y: 3, w: 12, h: 1 },
    ]);
  });
});

// ─── Nested rows inside columns ─────────────────────────────────────

describe("layout placement: nested rows inside columns", () => {
  it("column with nested rows creates a grid sub-container", () => {
    const items = rawItems({
      pages: [{ rows: [{ columns: [
        { span: 6, components: [{ html: "left" }] },
        { span: 6, rows: [
          { columns: [{ components: [{ html: "top-right" }] }] },
          { columns: [{ components: [{ html: "bottom-right" }] }] },
        ] },
      ] }] }],
    });
    expect(items).toHaveLength(2);
    expect(items[0]!.component.type).toBe("html");
    expect(items[0]!.placement).toEqual({ x: 0, y: 0, w: 6, h: 1 });
    // Second item is a grid sub-container
    expect(items[1]!.component.type).toBe("grid");
    expect(items[1]!.placement).toEqual({ x: 6, y: 0, w: 6, h: 1 });
    expect(items[1]!.component.items).toHaveLength(2);
  });

  it("flattened placements resolve nested items correctly", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [
        { span: 6, components: [{ html: "left" }] },
        { span: 6, rows: [
          { columns: [{ components: [{ html: "top-right" }] }] },
          { columns: [{ components: [{ html: "bottom-right" }] }] },
        ] },
      ] }] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 6, h: 1 },
      { type: "html", x: 6, y: 0, w: 6, h: 1 },
      { type: "html", x: 6, y: 1, w: 6, h: 1 },
    ]);
  });

  it("nested rows don't affect parent y — next row is always y+1", () => {
    const p = placements({
      pages: [{ rows: [
        { columns: [
          { span: 6, components: [{ html: "bar" }] },
          { span: 6, rows: [
            { columns: [{ components: [{ html: "pie" }] }] },
            { columns: [{ components: [{ html: "meter" }] }] },
          ] },
        ] },
        { columns: [{ components: [{ html: "ROW 2" }] }] },
      ] }],
    });
    // Row 0: bar at (0,0), sub-container at (6,0) with pie+meter inside
    // Row 1: ROW 2 at y=1 — nested rows are contained, don't push y
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 6, h: 1 },
      { type: "html", x: 6, y: 0, w: 6, h: 1 },
      { type: "html", x: 6, y: 1, w: 6, h: 1 },
      { type: "html", x: 0, y: 1, w: 12, h: 1 },
    ]);
  });

  it("3 nested sub-rows still occupy a single parent row", () => {
    const items = rawItems({
      pages: [{ rows: [
        { columns: [
          { span: 4, components: [{ html: "A" }] },
          { span: 8, rows: [
            { columns: [{ components: [{ html: "B1" }] }] },
            { columns: [{ components: [{ html: "B2" }] }] },
            { columns: [{ components: [{ html: "B3" }] }] },
          ] },
        ] },
        { columns: [{ span: 12, components: [{ html: "footer" }] }] },
      ] }],
    });
    // Parent has 2 items in row 0 + 1 item in row 1
    expect(items).toHaveLength(3);
    expect(items[0]!.placement).toEqual({ x: 0, y: 0, w: 4, h: 1 });
    expect(items[1]!.component.type).toBe("grid");
    expect(items[1]!.placement).toEqual({ x: 4, y: 0, w: 8, h: 1 });
    expect(items[1]!.component.items).toHaveLength(3);
    expect(items[2]!.placement).toEqual({ x: 0, y: 1, w: 12, h: 1 });
  });

  it("nested rows width capped to parent span", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [
        { span: 4, rows: [
          { columns: [{ span: 12, components: [{ html: "wide" }] }] },
        ] },
      ] }] }],
    });
    expect(p[0]!.w).toBe(4);
  });

  it("nested rows with inner column splits", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [
        { span: 8, rows: [
          { columns: [
            { span: 6, components: [{ html: "inner-left" }] },
            { span: 6, components: [{ html: "inner-right" }] },
          ] },
        ] },
      ] }] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 6, h: 1 },
      { type: "html", x: 6, y: 0, w: 6, h: 1 },
    ]);
  });

  it("both columns have nested rows", () => {
    const items = rawItems({
      pages: [{ rows: [
        { columns: [
          { span: 6, rows: [
            { columns: [{ components: [{ html: "L1" }] }] },
            { columns: [{ components: [{ html: "L2" }] }] },
          ] },
          { span: 6, rows: [
            { columns: [{ components: [{ html: "R1" }] }] },
            { columns: [{ components: [{ html: "R2" }] }] },
            { columns: [{ components: [{ html: "R3" }] }] },
          ] },
        ] },
        { columns: [{ span: 12, components: [{ html: "footer" }] }] },
      ] }],
    });
    expect(items).toHaveLength(3);
    expect(items[0]!.component.type).toBe("grid");
    expect(items[0]!.component.items).toHaveLength(2);
    expect(items[1]!.component.type).toBe("grid");
    expect(items[1]!.component.items).toHaveLength(3);
    expect(items[2]!.placement.y).toBe(1);
  });

  it("mix of components column and nested-rows column", () => {
    const items = rawItems({
      pages: [{ rows: [
        { columns: [
          { span: 6, components: [{ html: "A" }, { html: "B" }] },
          { span: 6, rows: [
            { columns: [{ components: [{ html: "R1" }] }] },
            { columns: [{ components: [{ html: "R2" }] }] },
            { columns: [{ components: [{ html: "R3" }] }] },
          ] },
        ] },
        { columns: [{ span: 12, components: [{ html: "footer" }] }] },
      ] }],
    });
    // Left column: 2 components (flat items), right: 1 grid sub-container
    // + 1 footer item
    expect(items).toHaveLength(4);
    // footer is at y = max(2 components, 1 container) = 2
    expect(items[3]!.placement.y).toBe(2);
  });
});

// ─── Row-level properties (grid wrapper) ────────────────────────────

describe("layout placement: row-level properties", () => {
  it("row with properties wraps items in a grid component", () => {
    const root = parsePage({
      pages: [{ rows: [{
        properties: { border: "solid 1px" },
        columns: [
          { span: 6, components: [{ html: "left" }] },
          { span: 6, components: [{ html: "right" }] },
        ],
      }] }],
    });
    const page = root.slots!["content"]![0]!;
    expect(page.items).toHaveLength(1);
    const wrapper = page.items![0]!;
    expect(wrapper.component.type).toBe("grid");
    expect(wrapper.component.style).toEqual({ border: "solid 1px" });
    expect(wrapper.component.items).toHaveLength(2);
  });

  it("row properties + nested rows: sub-container is inside wrapper", () => {
    const root = parsePage({
      pages: [{ rows: [{
        properties: { border: "solid 1px" },
        columns: [
          { span: 6, components: [{ html: "left" }] },
          { span: 6, rows: [
            { columns: [{ components: [{ html: "top-right" }] }] },
            { columns: [{ components: [{ html: "bottom-right" }] }] },
          ] },
        ],
      }] }],
    });
    const page = root.slots!["content"]![0]!;
    const wrapper = page.items![0]!.component;
    const items = wrapper.items!;
    expect(items).toHaveLength(2);
    expect(items[0]!.component.type).toBe("html");
    expect(items[0]!.placement).toEqual({ x: 0, y: 0, w: 6, h: 1 });
    expect(items[1]!.component.type).toBe("grid");
    expect(items[1]!.placement).toEqual({ x: 6, y: 0, w: 6, h: 1 });
  });

  it("rows with and without properties maintain correct y progression", () => {
    const p = placements({
      pages: [{ rows: [
        { properties: { border: "1px solid" }, columns: [{ span: 12, components: [{ html: "styled" }] }] },
        { columns: [{ span: 12, components: [{ html: "unstyled" }] }] },
      ] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 12, h: 1 },
      { type: "html", x: 0, y: 1, w: 12, h: 1 },
    ]);
  });
});

// ─── The "Column with rows" dashboard (full integration) ────────────

describe("layout placement: Column with rows dashboard", () => {
  it("produces 2 parent rows: [bar | pie+meter] then [ROW 2]", () => {
    const items = rawItems({
      pages: [{
        rows: [
          {
            columns: [
              {
                properties: { border: "solid 1px" },
                span: "6",
                components: [{ displayer: { type: "BARCHART", chart: { height: 300 }, lookup: { uuid: "a" } } }],
              },
              {
                span: "6",
                rows: [
                  {
                    properties: { border: "solid 1px", margin: "1px" },
                    columns: [{ components: [{ displayer: { type: "PIECHART", chart: { height: 150 }, lookup: { uuid: "a" } } }] }],
                  },
                  {
                    properties: { border: "solid 1px", margin: "1px" },
                    columns: [{ components: [{ displayer: { type: "METERCHART", chart: { height: 150 }, lookup: { uuid: "a" } } }] }],
                  },
                ],
              },
            ],
          },
          {
            properties: { border: "solid blue" },
            columns: [{ components: [{ html: "ROW 2" }] }],
          },
        ],
      }],
      datasets: [{ uuid: "a", content: '[["A", 1], ["B", 2], ["C", 3]]' }],
      global: { displayer: { chart: { resizable: true }, lookup: { uuid: "a" } } },
    });

    // Top level: 2 items (row 0 wrapper omitted since no row props, row 1 has row props)
    // Row 0: bar-chart + grid sub-container (no row-level properties on row 0)
    // Row 1: grid wrapper for ROW 2 (has properties)
    expect(items[0]!.component.type).toBe("bar-chart");
    expect(items[0]!.placement).toEqual({ x: 0, y: 0, w: 6, h: 1 });

    expect(items[1]!.component.type).toBe("grid");
    expect(items[1]!.placement).toEqual({ x: 6, y: 0, w: 6, h: 1 });
    // Sub-container holds pie and meter (each wrapped by their row props)
    const nested = items[1]!.component.items!;
    expect(nested).toHaveLength(2);

    // ROW 2 wrapper
    const lastItem = items[items.length - 1]!;
    expect(lastItem.component.type).toBe("grid");
    expect(lastItem.placement.y).toBe(1);
  });

  it("flattened placements show all 4 leaf components", () => {
    const p = placements({
      pages: [{
        rows: [
          {
            columns: [
              { span: "6", components: [{ displayer: { type: "BARCHART", lookup: { uuid: "a" } } }] },
              {
                span: "6",
                rows: [
                  { columns: [{ components: [{ displayer: { type: "PIECHART", lookup: { uuid: "a" } } }] }] },
                  { columns: [{ components: [{ displayer: { type: "METERCHART", lookup: { uuid: "a" } } }] }] },
                ],
              },
            ],
          },
          { columns: [{ components: [{ html: "ROW 2" }] }] },
        ],
      }],
      datasets: [{ uuid: "a", content: '[["A", 1]]' }],
    });

    expect(p).toHaveLength(4);
    expect(p[0]).toEqual({ type: "bar-chart", x: 0, y: 0, w: 6, h: 1 });
    expect(p[1]).toEqual({ type: "pie-chart", x: 6, y: 0, w: 6, h: 1 });
    expect(p[2]).toEqual({ type: "meter", x: 6, y: 1, w: 6, h: 1 });
    expect(p[3]).toEqual({ type: "html", x: 0, y: 1, w: 12, h: 1 });
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe("layout placement: edge cases", () => {
  it("empty nested rows column doesn't break layout", () => {
    const p = placements({
      pages: [{ rows: [
        { columns: [
          { span: 6, components: [{ html: "left" }] },
          { span: 6, rows: [] },
        ] },
        { columns: [{ span: 12, components: [{ html: "next" }] }] },
      ] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 6, h: 1 },
      { type: "html", x: 0, y: 1, w: 12, h: 1 },
    ]);
  });

  it("column with neither components nor rows is skipped", () => {
    const p = placements({
      pages: [{ rows: [{ columns: [
        { span: 6, components: [{ html: "A" }] },
        { span: 6 },
      ] }] }],
    });
    expect(p).toEqual([
      { type: "html", x: 0, y: 0, w: 6, h: 1 },
    ]);
  });

  it("deeply nested rows (column > rows > column > rows)", () => {
    const items = rawItems({
      pages: [{ rows: [{ columns: [
        { span: 6, rows: [
          { columns: [{ span: 6, rows: [
            { columns: [{ components: [{ html: "deep" }] }] },
          ] }] },
        ] },
      ] }] }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.component.type).toBe("grid");
    const inner = items[0]!.component.items![0]!;
    expect(inner.component.type).toBe("grid");
  });

  it("column properties applied to nested rows container", () => {
    const items = rawItems({
      pages: [{ rows: [{ columns: [
        { span: 6, properties: { "background-color": "#eee" }, rows: [
          { columns: [{ components: [{ html: "A" }] }] },
        ] },
      ] }] }],
    });
    expect(items[0]!.component.type).toBe("grid");
    expect(items[0]!.component.style).toEqual({ "background-color": "#eee" });
  });
});
