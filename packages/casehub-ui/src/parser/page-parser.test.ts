import { describe, it, expect } from "vitest";
import { parsePage } from "./page-parser.js";

describe("parsePage", () => {
  describe("basic structure", () => {
    it("parses minimal YAML with one component", () => {
      const root = parsePage({
        pages: [{ components: [{ html: "Hello" }] }],
      });
      expect(root.type).toBe("page");
      expect(root.props!["name"]).toBe("root");
      expect(root.slots!["content"]).toBeDefined();
      expect(root.slots!["content"]!.length).toBe(1);
    });

    it("throws on missing pages", () => {
      expect(() => parsePage({})).toThrow("At least one page is required");
    });

    it("throws on empty pages array", () => {
      expect(() => parsePage({ pages: [] })).toThrow("At least one page is required");
    });

    it("throws on non-object input", () => {
      expect(() => parsePage(null)).toThrow("Invalid input");
      expect(() => parsePage("string")).toThrow("Invalid input");
      expect(() => parsePage(42)).toThrow("Invalid input");
    });

    it("accepts layoutTemplates as alias for pages", () => {
      const root = parsePage({
        layoutTemplates: [{ components: [{ html: "Hi" }] }],
      });
      expect(root.type).toBe("page");
      expect(root.slots!["content"]!.length).toBe(1);
    });

    it("root is frozen", () => {
      const root = parsePage({
        pages: [{ components: [{ html: "Hello" }] }],
      });
      expect(Object.isFrozen(root)).toBe(true);
    });
  });

  describe("page names", () => {
    it("parses explicit page name", () => {
      const root = parsePage({
        pages: [{ name: "Overview", components: [{ html: "Hi" }] }],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.props!["name"]).toBe("Overview");
    });

    it("auto-generates page names from 1-based index", () => {
      const root = parsePage({
        pages: [{ components: [{ html: "A" }] }, { components: [{ html: "B" }] }],
      });
      expect(root.slots!["content"]![0]!.props!["name"]).toBe("Page 1");
      expect(root.slots!["content"]![1]!.props!["name"]).toBe("Page 2");
    });
  });

  describe("components shorthand → grid items", () => {
    it("desugars flat components list to full-width grid items", () => {
      const root = parsePage({
        pages: [{ components: [{ html: "A" }, { html: "B" }] }],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items).toBeDefined();
      expect(page.items!.length).toBe(2);
      expect(page.items![0]!.placement).toEqual({ x: 0, y: 0, w: 12, h: 1 });
      expect(page.items![1]!.placement).toEqual({ x: 0, y: 1, w: 12, h: 1 });
    });

    it("desugars html shorthand to html component", () => {
      const root = parsePage({
        pages: [{ components: [{ html: "<b>Bold</b>" }] }],
      });
      const page = root.slots!["content"]![0]!;
      const comp = page.items![0]!.component;
      expect(comp.type).toBe("html");
      expect(comp.props!["content"]).toBe("<b>Bold</b>");
    });

    it("desugars displayer components", () => {
      const root = parsePage({
        pages: [
          {
            components: [{ displayer: { type: "BARCHART", lookup: { uuid: "sales" } } }],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items![0]!.component.type).toBe("bar-chart");
    });
  });

  describe("rows/columns → grid placement", () => {
    it("desugars rows/columns/span to grid items", () => {
      const root = parsePage({
        pages: [
          {
            rows: [
              {
                columns: [
                  { span: 6, components: [{ html: "left" }] },
                  { span: 6, components: [{ html: "right" }] },
                ],
              },
            ],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBe(2);
      expect(page.items![0]!.placement).toEqual({ x: 0, y: 0, w: 6, h: 1 });
      expect(page.items![1]!.placement).toEqual({ x: 6, y: 0, w: 6, h: 1 });
    });

    it("defaults span to 12 when omitted", () => {
      const root = parsePage({
        pages: [
          {
            rows: [
              {
                columns: [{ components: [{ html: "full" }] }],
              },
            ],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items![0]!.placement.w).toBe(12);
    });

    it("handles multiple rows", () => {
      const root = parsePage({
        pages: [
          {
            rows: [
              { columns: [{ span: 12, components: [{ html: "row1" }] }] },
              { columns: [{ span: 12, components: [{ html: "row2" }] }] },
            ],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBe(2);
      expect(page.items![0]!.placement.y).toBe(0);
      expect(page.items![1]!.placement.y).toBe(1);
    });

    it("accepts layoutColumns as alias for columns", () => {
      const root = parsePage({
        pages: [
          {
            rows: [
              {
                layoutColumns: [{ span: 6, components: [{ html: "left" }] }],
              },
            ],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBe(1);
      expect(page.items![0]!.placement.w).toBe(6);
    });

    it("accepts layoutComponents as alias for components in columns", () => {
      const root = parsePage({
        pages: [
          {
            rows: [
              {
                columns: [{ span: 12, layoutComponents: [{ html: "legacy" }] }],
              },
            ],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items![0]!.component.type).toBe("html");
    });

    it("stacks multiple components within a column vertically", () => {
      const root = parsePage({
        pages: [
          {
            rows: [
              {
                columns: [{ span: 6, components: [{ html: "A" }, { html: "B" }] }],
              },
            ],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBe(2);
      expect(page.items![0]!.placement).toEqual({ x: 0, y: 0, w: 6, h: 1 });
      expect(page.items![1]!.placement).toEqual({ x: 0, y: 1, w: 6, h: 1 });
    });

    it("applies column-level properties as style", () => {
      const root = parsePage({
        pages: [
          {
            rows: [
              {
                columns: [
                  {
                    span: 12,
                    properties: { "background-color": "#eee" },
                    components: [{ html: "styled" }],
                  },
                ],
              },
            ],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items![0]!.component.style!["background-color"]).toBe("#eee");
    });
  });

  describe("property substitution", () => {
    it("substitutes ${name} in component content", () => {
      const root = parsePage({
        properties: { name: "World" },
        pages: [{ components: [{ html: "Hello ${name}" }] }],
      });
      const page = root.slots!["content"]![0]!;
      const htmlComp = page.items![0]!.component;
      expect(htmlComp.props!["content"]).toBe("Hello World");
    });

    it("preserves properties on root", () => {
      const root = parsePage({
        properties: { greeting: "Hello" },
        pages: [{ components: [{ html: "${greeting}" }] }],
      });
      expect((root.props as Record<string, unknown>)["properties"]).toEqual({
        greeting: "Hello",
      });
    });

    it("does not include properties on root when none defined", () => {
      const root = parsePage({
        pages: [{ components: [{ html: "Hi" }] }],
      });
      expect((root.props as Record<string, unknown>)["properties"]).toBeUndefined();
    });
  });

  describe("ID generation", () => {
    it("generates deterministic IDs for grid items", () => {
      const root = parsePage({
        pages: [{ components: [{ html: "A" }, { html: "B" }] }],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items![0]!.component.id).toBeDefined();
      expect(page.items![1]!.component.id).toBeDefined();
      expect(page.items![0]!.component.id).not.toBe(page.items![1]!.component.id);
    });

    it("IDs include page index for uniqueness across pages", () => {
      const root = parsePage({
        pages: [
          { components: [{ html: "page0" }] },
          { components: [{ html: "page1" }] },
        ],
      });
      const page0 = root.slots!["content"]![0]!;
      const page1 = root.slots!["content"]![1]!;
      expect(page0.items![0]!.component.id).not.toBe(page1.items![0]!.component.id);
    });
  });

  describe("datasets and global settings", () => {
    it("parses datasets onto root props", () => {
      const root = parsePage({
        datasets: [{ uuid: "test", content: "[['a', 1]]" }],
        pages: [{ components: [{ html: "Hi" }] }],
      });
      expect((root.props as Record<string, unknown>)["datasets"]).toEqual([
        { uuid: "test", content: "[['a', 1]]" },
      ]);
    });

    it("parses global mode as lowercase settings", () => {
      const root = parsePage({
        global: { mode: "DARK" },
        pages: [{ components: [{ html: "Hi" }] }],
      });
      const settings = (root.props as Record<string, unknown>)["settings"] as Record<
        string,
        unknown
      >;
      expect(settings["mode"]).toBe("dark");
    });

    it("parses global allowUrlProperties", () => {
      const root = parsePage({
        global: { allowUrlProperties: "true" },
        pages: [{ components: [{ html: "Hi" }] }],
      });
      const settings = (root.props as Record<string, unknown>)["settings"] as Record<
        string,
        unknown
      >;
      expect(settings["allowUrlProperties"]).toBe(true);
    });

    it("parses global displayer as dataComponentDefaults", () => {
      const root = parsePage({
        global: {
          displayer: { chart: { resizable: true } },
        },
        pages: [{ components: [{ html: "Hi" }] }],
      });
      const settings = (root.props as Record<string, unknown>)["settings"] as Record<
        string,
        unknown
      >;
      expect(settings["dataComponentDefaults"]).toEqual({ chart: { resizable: true } });
    });

    it("parses global settings as dataComponentDefaults (alias)", () => {
      const root = parsePage({
        global: {
          settings: { table: { pageSize: 20 } },
        },
        pages: [{ components: [{ html: "Hi" }] }],
      });
      const settings = (root.props as Record<string, unknown>)["settings"] as Record<
        string,
        unknown
      >;
      expect(settings["dataComponentDefaults"]).toEqual({ table: { pageSize: 20 } });
    });

    it("parses global dataset as datasetDefaults", () => {
      const root = parsePage({
        global: {
          dataset: { cacheMaxRows: 1000 },
        },
        pages: [{ components: [{ html: "Hi" }] }],
      });
      const settings = (root.props as Record<string, unknown>)["settings"] as Record<
        string,
        unknown
      >;
      expect(settings["datasetDefaults"]).toEqual({ cacheMaxRows: 1000 });
    });
  });

  describe("page-level properties", () => {
    it("applies page-level properties as style on the page component", () => {
      const root = parsePage({
        pages: [
          {
            properties: { margin: "10px" },
            components: [{ html: "Hi" }],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.style).toEqual({ margin: "10px" });
    });
  });

  describe("navigation resolution", () => {
    it("resolves navigation components with navGroupId", () => {
      const root = parsePage({
        pages: [
          {
            name: "Main",
            components: [
              { type: "TABS", properties: { navGroupId: "Group1", targetDivId: "div1" } },
              { div: "div1" },
            ],
          },
          { name: "SubPage1", components: [{ html: "content1" }] },
          { name: "SubPage2", components: [{ html: "content2" }] },
        ],
        navTree: {
          root_items: [
            {
              type: "GROUP",
              id: "Group1",
              children: [{ page: "SubPage1" }, { page: "SubPage2" }],
            },
          ],
        },
      });
      const mainPage = root.slots!["content"]![0]!;
      expect(mainPage).toBeDefined();
      // After nav resolution, slot-target is removed and tabs has slots
      // The tabs component should have slots for SubPage1 and SubPage2
      const tabsItem = mainPage.items!.find((item) => item.component.type === "tabs");
      expect(tabsItem).toBeDefined();
      expect(tabsItem!.component.slots!["SubPage1"]).toBeDefined();
      expect(tabsItem!.component.slots!["SubPage2"]).toBeDefined();
    });

    it("preserves grid item placement when slot-targets are interspersed", () => {
      // Regression test: slot-targets between regular components must not
      // cause placement misalignment after nav resolution
      const root = parsePage({
        pages: [
          {
            name: "Main",
            rows: [
              {
                columns: [
                  { span: 4, components: [{ html: "sidebar" }] },
                  {
                    span: 8,
                    components: [
                      { type: "TABS", properties: { navGroupId: "G1" } },
                    ],
                  },
                ],
              },
              {
                columns: [
                  { span: 4, components: [{ div: "d1" }] },
                  { span: 8, components: [{ html: "footer" }] },
                ],
              },
            ],
          },
          { name: "P1", components: [{ html: "content1" }] },
        ],
        navTree: {
          root_items: [{ type: "GROUP", id: "G1", children: [{ page: "P1" }] }],
        },
      });
      const mainPage = root.slots!["content"]![0]!;
      // sidebar (x:0) should keep its placement
      const sidebarItem = mainPage.items!.find((item) =>
        item.component.type === "html" && item.component.props?.["content"] === "sidebar"
      );
      expect(sidebarItem).toBeDefined();
      expect(sidebarItem!.placement.x).toBe(0);
      expect(sidebarItem!.placement.w).toBe(4);

      // footer (x:4, y:1) should keep its placement — not shifted by slot-target removal
      const footerItem = mainPage.items!.find((item) =>
        item.component.type === "html" && item.component.props?.["content"] === "footer"
      );
      expect(footerItem).toBeDefined();
      expect(footerItem!.placement.x).toBe(4);
      expect(footerItem!.placement.w).toBe(8);

      // tabs should be present with slots
      const tabsItem = mainPage.items!.find((item) => item.component.type === "tabs");
      expect(tabsItem).toBeDefined();
      expect(tabsItem!.placement.x).toBe(4);
      expect(tabsItem!.placement.w).toBe(8);
    });

    it("removes slot-target components from grid items during resolution", () => {
      const root = parsePage({
        pages: [
          {
            name: "Main",
            components: [
              { type: "TABS", properties: { navGroupId: "G1" } },
              { div: "target_div" },
            ],
          },
          { name: "P1", components: [{ html: "hi" }] },
        ],
        navTree: {
          root_items: [{ type: "GROUP", id: "G1", children: [{ page: "P1" }] }],
        },
      });
      const mainPage = root.slots!["content"]![0]!;
      const slotTargets = mainPage.items!.filter((item) => item.component.type === "slot-target");
      expect(slotTargets.length).toBe(0);
    });
  });

  describe("empty and edge cases", () => {
    it("handles page with no components or rows (empty items)", () => {
      const root = parsePage({
        pages: [{}],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items).toEqual([]);
    });

    it("handles row with no columns (skips row)", () => {
      const root = parsePage({
        pages: [
          {
            rows: [
              {}, // no columns
              { columns: [{ span: 12, components: [{ html: "after empty" }] }] },
            ],
          },
        ],
      });
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBe(1);
      // The empty row increments y, so this component is at y=1
      expect(page.items![0]!.placement.y).toBe(1);
    });

    it("handles multiple pages", () => {
      const root = parsePage({
        pages: [
          { name: "Page A", components: [{ html: "A" }] },
          { name: "Page B", components: [{ html: "B" }] },
          { name: "Page C", components: [{ html: "C" }] },
        ],
      });
      expect(root.slots!["content"]!.length).toBe(3);
    });
  });
});
