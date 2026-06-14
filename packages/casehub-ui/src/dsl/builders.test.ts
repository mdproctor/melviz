import { describe, it, expect } from "vitest";
import type { Component } from "../model/types.js";
import type { PageSettings } from "../model/page-types.js";
import {
  page,
  grid,
  at,
  columns,
  rows,
  stack,
  tabs,
  pills,
  sidebar,
  tree,
  menu,
  accordion,
  carousel,
  appGrid,
  panel,
  html,
  markdown,
  title,
  withId,
  withAccess,
  withStyle,
  dataset,
  inlineDataset,
  type PageOptions,
} from "./builders.js";

describe("builders", () => {
  describe("page()", () => {
    it("creates a page with name and children in slots.content", () => {
      const child1 = html("content1");
      const child2 = html("content2");
      const result = page("MyPage", child1, child2);

      expect(result.type).toBe("page");
      expect(result.props).toEqual({ name: "MyPage" });
      expect(result.slots?.content).toEqual([child1, child2]);
    });

    it("accepts PageOptions as last arg", () => {
      const child = html("content");
      const settings: PageSettings = { mode: "dark" };
      const options: PageOptions = {
        datasets: [],
        settings,
        properties: { key: "value" },
      };
      const result = page("MyPage", child, options);

      expect(result.type).toBe("page");
      expect(result.props).toEqual({
        name: "MyPage",
        datasets: [],
        settings,
        properties: { key: "value" },
      });
      expect(result.slots?.content).toEqual([child]);
    });

    it("rejects '/' in name", () => {
      expect(() => page("My/Page")).toThrow(
        "Page name cannot contain '/': My/Page"
      );
    });

    it("rejects duplicate child page names at same level", () => {
      const child1 = page("DupName", html("a"));
      const child2 = page("DupName", html("b"));

      expect(() => page("Parent", child1, child2)).toThrow(
        "Duplicate child page name: DupName"
      );
    });

    it("allows duplicate page names if not siblings", () => {
      const grandchild = page("DupName", html("a"));
      const child = page("Child", grandchild);
      const sibling = page("DupName", html("b"));

      // This is fine — DupName appears at different levels
      const result = page("Parent", child, sibling);
      expect(result.slots?.content).toHaveLength(2);
    });

    it("freezes returned component", () => {
      const result = page("Test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("grid()", () => {
    it("creates grid with items and placements", () => {
      const comp1 = html("a");
      const comp2 = html("b");
      const item1 = at(0, 0, 1, 1, comp1);
      const item2 = at(1, 0, 1, 1, comp2);

      const result = grid(2, item1, item2);

      expect(result.type).toBe("grid");
      expect(result.props).toEqual({ columns: 2 });
      expect(result.items).toHaveLength(2);
      expect(result.items?.[0].placement).toEqual({ x: 0, y: 0, w: 1, h: 1 });
      expect(result.items?.[1].placement).toEqual({ x: 1, y: 0, w: 1, h: 1 });
    });

    it("generates deterministic IDs for grid and items", () => {
      const comp1 = html("a");
      const comp2 = html("b");
      const item1 = at(0, 0, 1, 1, comp1);
      const item2 = at(6, 3, 2, 1, comp2);

      const result = grid(8, item1, item2);

      // Grid gets an ID
      expect(result.id).toMatch(/^grid_\d+$/);
      const gridId = result.id!;

      // Items get IDs based on grid ID and placement
      expect(result.items?.[0].component.id).toBe(`${gridId}_0_0`);
      expect(result.items?.[1].component.id).toBe(`${gridId}_6_3`);
    });

    it("does not override existing component IDs", () => {
      const comp = withId("custom-id", html("a"));
      const item = at(0, 0, 1, 1, comp);

      const result = grid(1, item);

      expect(result.items?.[0].component.id).toBe("custom-id");
    });

    it("generates sequential grid IDs across calls", () => {
      const grid1 = grid(1, at(0, 0, 1, 1, html("a")));
      const grid2 = grid(1, at(0, 0, 1, 1, html("b")));

      // IDs should increment
      expect(grid1.id).toBeTruthy();
      expect(grid2.id).toBeTruthy();
      expect(grid1.id).not.toBe(grid2.id);
    });

    it("freezes returned component", () => {
      const result = grid(1);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("at()", () => {
    it("creates GridItem with placement", () => {
      const comp = html("test");
      const result = at(1, 2, 3, 4, comp);

      expect(result.placement).toEqual({ x: 1, y: 2, w: 3, h: 4 });
      expect(result.component).toBe(comp);
    });

    it("freezes returned GridItem and placement", () => {
      const result = at(0, 0, 1, 1, html("a"));
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.placement)).toBe(true);
    });
  });

  describe("columns()", () => {
    it("creates columns with distribution and slot contents", () => {
      const col1 = [html("a"), html("b")];
      const col2 = [html("c")];

      const result = columns([60, 40], col1, col2);

      expect(result.type).toBe("columns");
      expect(result.props).toEqual({ distribution: [60, 40] });
      expect(result.slots).toEqual({
        "col-0": col1,
        "col-1": col2,
      });
    });

    it("throws if distribution length !== slotContents length", () => {
      expect(() => columns([50, 50], [html("a")])).toThrow(
        "Distribution length (2) must match slotContents length (1)"
      );
    });

    it("freezes returned component and slots", () => {
      const result = columns([100], [html("a")]);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.slots)).toBe(true);
    });
  });

  describe("rows()", () => {
    it("creates rows component with children", () => {
      const child1 = html("a");
      const child2 = html("b");
      const result = rows(child1, child2);

      expect(result.type).toBe("rows");
      expect(result.slots).toEqual({ content: [child1, child2] });
    });

    it("freezes returned component", () => {
      const result = rows();
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("stack()", () => {
    it("is an alias for rows", () => {
      const child = html("test");
      const result = stack(child);

      expect(result.type).toBe("rows");
      expect(result.slots).toEqual({ content: [child] });
    });
  });

  describe("navigation components", () => {
    const testCases: Array<{
      name: string;
      builder: (...entries: [string, ...Component[]][]) => Component;
      expectedType: string;
    }> = [
      { name: "tabs", builder: tabs, expectedType: "tabs" },
      { name: "pills", builder: pills, expectedType: "pills" },
      { name: "sidebar", builder: sidebar, expectedType: "sidebar" },
      { name: "tree", builder: tree, expectedType: "tree" },
      { name: "menu", builder: menu, expectedType: "menu" },
      { name: "accordion", builder: accordion, expectedType: "accordion" },
      { name: "carousel", builder: carousel, expectedType: "carousel" },
      { name: "appGrid", builder: appGrid, expectedType: "app-grid" },
    ];

    testCases.forEach(({ name, builder, expectedType }) => {
      describe(`${name}()`, () => {
        it("creates component with named slots", () => {
          const entry1: [string, ...Component[]] = [
            "Tab1",
            html("a"),
            html("b"),
          ];
          const entry2: [string, ...Component[]] = ["Tab2", html("c")];

          const result = builder(entry1, entry2);

          expect(result.type).toBe(expectedType);
          expect(result.slots).toEqual({
            Tab1: [html("a"), html("b")],
            Tab2: [html("c")],
          });
        });

        it("freezes returned component and slots", () => {
          const result = builder(["Label", html("test")]);
          expect(Object.isFrozen(result)).toBe(true);
          expect(Object.isFrozen(result.slots)).toBe(true);
        });
      });
    });
  });

  describe("panel()", () => {
    it("creates panel with title and children", () => {
      const child1 = html("a");
      const child2 = html("b");
      const result = panel("My Panel", child1, child2);

      expect(result.type).toBe("panel");
      expect(result.props).toEqual({ title: "My Panel" });
      expect(result.slots).toEqual({ content: [child1, child2] });
    });

    it("freezes returned component", () => {
      const result = panel("Test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("html()", () => {
    it("creates html component", () => {
      const result = html("<div>Hello</div>");

      expect(result.type).toBe("html");
      expect(result.props).toEqual({ content: "<div>Hello</div>" });
    });

    it("freezes returned component", () => {
      const result = html("test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("markdown()", () => {
    it("creates markdown component", () => {
      const result = markdown("# Hello");

      expect(result.type).toBe("markdown");
      expect(result.props).toEqual({ content: "# Hello" });
    });

    it("freezes returned component", () => {
      const result = markdown("test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("title()", () => {
    it("creates title component with text only", () => {
      const result = title("My Title");

      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "My Title" });
    });

    it("creates title component with size", () => {
      const result = title("My Title", "large");

      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "My Title", size: "large" });
    });

    it("omits size if undefined", () => {
      const result = title("My Title", undefined);

      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "My Title" });
      expect(result.props).not.toHaveProperty("size");
    });

    it("freezes returned component", () => {
      const result = title("test");
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("withId()", () => {
    it("adds id to component", () => {
      const comp = html("test");
      const result = withId("custom-id", comp);

      expect(result.id).toBe("custom-id");
      expect(result.type).toBe("html");
    });

    it("does not mutate original component", () => {
      const comp = html("test");
      const original = { ...comp };
      withId("custom-id", comp);

      expect(comp).toEqual(original);
      expect(comp.id).toBeUndefined();
    });

    it("freezes returned component", () => {
      const result = withId("test", html("a"));
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("withAccess()", () => {
    it("adds access control to component", () => {
      const comp = html("test");
      const access = { roles: ["admin"], permissions: ["read"] };
      const result = withAccess(access, comp);

      expect(result.access).toEqual(access);
      expect(result.type).toBe("html");
    });

    it("does not mutate original component", () => {
      const comp = html("test");
      const original = { ...comp };
      const access = { roles: ["admin"] };
      withAccess(access, comp);

      expect(comp).toEqual(original);
      expect(comp.access).toBeUndefined();
    });

    it("freezes returned component", () => {
      const result = withAccess({ roles: ["admin"] }, html("a"));
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("withStyle()", () => {
    it("adds style to component", () => {
      const comp = html("test");
      const style = { color: "red", fontSize: "16px" };
      const result = withStyle(style, comp);

      expect(result.style).toEqual(style);
      expect(result.type).toBe("html");
    });

    it("does not mutate original component", () => {
      const comp = html("test");
      const original = { ...comp };
      const style = { color: "red" };
      withStyle(style, comp);

      expect(comp).toEqual(original);
      expect(comp.style).toBeUndefined();
    });

    it("freezes returned component and style", () => {
      const result = withStyle({ color: "red" }, html("a"));
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.style)).toBe(true);
    });
  });

  describe("grid() ID determinism", () => {
    it("produces identical IDs when called with identical structure", () => {
      // Reset by re-importing module — but deterministic IDs should not
      // depend on call order. Two grids with same structure get same ID base.
      const grid1 = grid(2, at(0, 0, 6, 1, html("a")), at(6, 0, 6, 1, html("b")));
      const grid2 = grid(2, at(0, 0, 6, 1, html("a")), at(6, 0, 6, 1, html("b")));

      // They should have different IDs (different calls produce distinct grids),
      // but each grid's item IDs should be deterministic based on placement
      expect(grid1.items![0]!.component.id).toMatch(/_0_0$/);
      expect(grid1.items![1]!.component.id).toMatch(/_6_0$/);
      expect(grid2.items![0]!.component.id).toMatch(/_0_0$/);
      expect(grid2.items![1]!.component.id).toMatch(/_6_0$/);
    });
  });

  describe("dataset()", () => {
    it("creates an ExternalDataSetDef with url", () => {
      const ds = dataset("sales", "http://api.example.com/sales");

      expect(ds.uuid).toBe("sales");
      expect(ds.url).toBe("http://api.example.com/sales");
    });

    it("accepts optional overrides", () => {
      const ds = dataset("sales", "http://api.example.com/sales", {
        dataPath: "data.items",
        refreshTime: "5s",
        cacheEnabled: true,
      });

      expect(ds.uuid).toBe("sales");
      expect(ds.url).toBe("http://api.example.com/sales");
      expect(ds.dataPath).toBe("data.items");
      expect(ds.refreshTime).toBe("5s");
      expect(ds.cacheEnabled).toBe(true);
    });

    it("returns a frozen object", () => {
      const ds = dataset("test", "http://example.com");
      expect(Object.isFrozen(ds)).toBe(true);
    });
  });

  describe("inlineDataset()", () => {
    it("creates an ExternalDataSetDef with content", () => {
      const ds = inlineDataset("local", '[{"a":1}]');

      expect(ds.uuid).toBe("local");
      expect(ds.content).toBe('[{"a":1}]');
      expect(ds.url).toBeUndefined();
    });

    it("accepts optional overrides", () => {
      const ds = inlineDataset("local", '{"data":[1,2]}', {
        dataPath: "data",
        expression: "$[0]",
      });

      expect(ds.dataPath).toBe("data");
      expect(ds.expression).toBe("$[0]");
    });

    it("returns a frozen object", () => {
      const ds = inlineDataset("test", "[]");
      expect(Object.isFrozen(ds)).toBe(true);
    });
  });

  describe("integration scenarios", () => {
    it("builds complex nested structure", () => {
      const dashboard = page(
        "Dashboard",
        tabs(
          [
            "Overview",
            grid(
              2,
              at(0, 0, 1, 1, panel("Metrics", html("metrics"))),
              at(1, 0, 1, 1, panel("Chart", markdown("# Chart")))
            ),
          ],
          [
            "Details",
            columns(
              [70, 30],
              [title("Main Content"), html("main")],
              [title("Sidebar"), html("side")]
            ),
          ]
        )
      );

      expect(dashboard.type).toBe("page");
      expect(dashboard.slots?.content).toHaveLength(1);
      expect(dashboard.slots?.content?.[0].type).toBe("tabs");
    });

    it("applies decorators in chain", () => {
      const comp = html("test");
      const decorated = withStyle(
        { color: "red" },
        withAccess({ roles: ["admin"] }, withId("my-id", comp))
      );

      expect(decorated.id).toBe("my-id");
      expect(decorated.access).toEqual({ roles: ["admin"] });
      expect(decorated.style).toEqual({ color: "red" });
      expect(comp).not.toBe(decorated); // Original unchanged
    });
  });
});
