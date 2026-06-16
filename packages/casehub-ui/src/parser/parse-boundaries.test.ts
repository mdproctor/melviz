import { describe, it, expect } from "vitest";
import { parsePage } from "./page-parser.js";

describe("parsePage input boundary behavior", () => {
  it("throws on string input (not a parsed object)", () => {
    expect(() => parsePage("pages:\n  - components:")).toThrow("Invalid input: expected an object");
  });

  it("throws on null input", () => {
    expect(() => parsePage(null)).toThrow("Invalid input");
  });

  it("throws on undefined input", () => {
    expect(() => parsePage(undefined)).toThrow("Invalid input");
  });

  it("throws on number input", () => {
    expect(() => parsePage(42)).toThrow("Invalid input");
  });

  it("throws on array input (arrays are objects, caught by pages check)", () => {
    expect(() => parsePage([])).toThrow("At least one page is required");
  });

  it("throws when no pages key exists", () => {
    expect(() => parsePage({ datasets: [] })).toThrow("At least one page is required");
  });

  it("throws when pages is empty array", () => {
    expect(() => parsePage({ pages: [] })).toThrow("At least one page is required");
  });

  it("accepts layoutTemplates as alias for pages", () => {
    const root = parsePage({
      layoutTemplates: [{ components: [{ html: "test" }] }],
    });
    expect(root.type).toBe("page");
    expect(root.slots!["content"]).toHaveLength(1);
  });
});

describe("global defaults propagation", () => {
  it("global.displayer.lookup.uuid propagates to empty displayer", () => {
    const root = parsePage({
      global: {
        displayer: {
          lookup: { uuid: "shared-ds" },
        },
      },
      datasets: [{ uuid: "shared-ds", content: "[[1]]" }],
      pages: [{
        components: [{ displayer: null }],
      }],
    });
    const page = root.slots!["content"]![0]!;
    const component = page.items![0]!.component;
    const lookup = (component.props as any)?.lookup;
    expect(lookup?.dataSetId).toBe("shared-ds");
  });

  it("component-level lookup overrides global lookup fields", () => {
    const root = parsePage({
      global: {
        displayer: {
          lookup: { uuid: "default-ds", rowCount: 5 },
          chart: { resizable: true },
        },
      },
      datasets: [{ uuid: "override-ds", content: "[[1]]" }],
      pages: [{
        components: [{
          displayer: {
            type: "BARCHART",
            lookup: { uuid: "override-ds" },
          },
        }],
      }],
    });
    const page = root.slots!["content"]![0]!;
    const component = page.items![0]!.component;
    expect((component.props as any).lookup.dataSetId).toBe("override-ds");
    expect(component.props?.["resizable"]).toBe(true);
  });

  it("global.displayer.chart settings propagate to typed displayer", () => {
    const root = parsePage({
      global: {
        displayer: {
          chart: { resizable: true, height: 300 },
          lookup: { uuid: "ds" },
        },
      },
      datasets: [{ uuid: "ds", content: "[[1]]" }],
      pages: [{
        components: [{
          displayer: {
            type: "LINECHART",
            chart: { height: 500 },
          },
        }],
      }],
    });
    const page = root.slots!["content"]![0]!;
    const component = page.items![0]!.component;
    expect(component.type).toBe("line-chart");
    expect(component.props?.["resizable"]).toBe(true);
    expect(component.props?.["height"]).toBe(500); // component override wins
  });

  it("global defaults do not affect non-displayer components", () => {
    const root = parsePage({
      global: {
        displayer: { chart: { resizable: true } },
      },
      pages: [{
        components: [
          { html: "<p>Hello</p>" },
          { markdown: "**bold**" },
          { title: "My Title" },
        ],
      }],
    });
    const page = root.slots!["content"]![0]!;
    expect(page.items![0]!.component.type).toBe("html");
    expect(page.items![0]!.component.props?.["resizable"]).toBeUndefined();
    expect(page.items![1]!.component.type).toBe("markdown");
    expect(page.items![2]!.component.type).toBe("title");
  });

  it("global defaults propagate into rows/columns layout", () => {
    const root = parsePage({
      global: {
        displayer: {
          chart: { resizable: true },
          lookup: { uuid: "ds" },
        },
      },
      datasets: [{ uuid: "ds", content: "[[1]]" }],
      pages: [{
        rows: [{
          columns: [{
            span: 6,
            components: [{ displayer: { type: "PIECHART" } }],
          }],
        }],
      }],
    });
    const page = root.slots!["content"]![0]!;
    const component = page.items![0]!.component;
    expect(component.type).toBe("pie-chart");
    expect(component.props?.["resizable"]).toBe(true);
  });
});

describe("nested rows — ID uniqueness", () => {
  it("components in nested rows get distinct IDs from outer components", () => {
    const root = parsePage({
      datasets: [{ uuid: "ds", content: "[[1,2]]" }],
      pages: [{
        rows: [{
          columns: [
            {
              span: 6,
              components: [{ displayer: { type: "BARCHART", lookup: { uuid: "ds" } } }],
            },
            {
              span: 6,
              rows: [{
                columns: [{
                  components: [{ displayer: { type: "PIECHART", lookup: { uuid: "ds" } } }],
                }],
              }],
            },
          ],
        }],
      }],
    });
    const page = root.slots!["content"]![0]!;
    const ids = page.items!.map(item => item.component.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe("inline content edge cases", () => {
  it("global.dataset with inline content is added to datasets array", () => {
    const root = parsePage({
      global: {
        dataset: { uuid: "inline", content: "[[1,2]]" },
      },
      pages: [{ components: [{ html: "test" }] }],
    });
    const datasets = (root.props as any).datasets as unknown[];
    expect(datasets).toHaveLength(1);
    expect((datasets[0] as any).uuid).toBe("inline");
  });

  it("global.dataset is appended after explicit datasets", () => {
    const root = parsePage({
      global: {
        dataset: { uuid: "global-ds", content: "[[1]]" },
      },
      datasets: [
        { uuid: "explicit-1", content: "[[2]]" },
        { uuid: "explicit-2", content: "[[3]]" },
      ],
      pages: [{ components: [{ html: "test" }] }],
    });
    const datasets = (root.props as any).datasets as unknown[];
    expect(datasets).toHaveLength(3);
    expect((datasets[0] as any).uuid).toBe("explicit-1");
    expect((datasets[1] as any).uuid).toBe("explicit-2");
    expect((datasets[2] as any).uuid).toBe("global-ds");
  });
});
