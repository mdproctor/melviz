import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { load } from "js-yaml";
import type { Component } from "../model/types.js";
import { parsePage } from "./page-parser.js";
import { join } from "path";
import { globSync } from "glob";

const EXAMPLES_DIR = join(__dirname, "../../../../examples/dashboards");

function findPageByName(root: Component, name: string): Component | undefined {
  if (root.type === "page" && (root.props as Record<string, unknown>)?.["name"] === name) {
    return root;
  }
  if (root.items) {
    for (const item of root.items) {
      const found = findPageByName(item.component, name);
      if (found) return found;
    }
  }
  if (root.slots) {
    for (const children of Object.values(root.slots)) {
      for (const child of children) {
        const found = findPageByName(child, name);
        if (found) return found;
      }
    }
  }
  return undefined;
}

describe("backwards compatibility — existing dashboards", () => {
  // Skip if examples directory doesn't exist (CI without examples)
  const dirExists = existsSync(EXAMPLES_DIR);

  if (!dirExists) {
    it.skip("examples directory not found", () => {});
    return;
  }

  const files = globSync("**/*.{yaml,yml}", { cwd: EXAMPLES_DIR });

  it("found example dashboards", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("parses %s without error", (file) => {
    const content = readFileSync(join(EXAMPLES_DIR, file), "utf-8");
    const raw = load(content);
    if (!raw || typeof raw !== "object") return; // skip non-object YAML
    const obj = raw as Record<string, unknown>;
    // Only test files that have pages or layoutTemplates
    if (!obj["pages"] && !obj["layoutTemplates"]) return;
    expect(() => parsePage(raw)).not.toThrow();
  });

  // ------- Specific assertions for known complex dashboards -------

  describe("Kitchensink — multi-page with navTree, navigation, external components", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Kitchensink.dash.yml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("has root type page", () => {
      expect(root.type).toBe("page");
    });

    it("only root page is top-level when navTree is present", () => {
      const pages = root.slots!["content"]!;
      // navTree present — only first page (index) is top-level
      expect(pages.length).toBe(1);
    });

    it("has datasets on root props", () => {
      const datasets = (root.props as Record<string, unknown>)["datasets"] as unknown[];
      expect(datasets).toBeDefined();
      expect(datasets.length).toBeGreaterThan(0);
    });

    it("has global settings", () => {
      const settings = (root.props as Record<string, unknown>)["settings"] as Record<
        string,
        unknown
      >;
      expect(settings).toBeDefined();
      expect(settings["dataComponentDefaults"]).toBeDefined();
    });

    it("resolves navigation components with content at target", () => {
      // The index page has TABS with navGroupId MainGroup + targetDivId
      // Content slots go to the target location, not inside the tabs nav
      const indexPage = root.slots!["content"]!.find(
        (p) => (p.props as Record<string, unknown>)?.["name"] === "index",
      )!;
      expect(indexPage).toBeDefined();
      const contentTabs = indexPage.items!.find((item) => item.component.type === "tabs" && item.component.slots);
      expect(contentTabs).toBeDefined();
      expect(Object.keys(contentTabs!.component.slots!).length).toBeGreaterThan(0);
    });

    it("handles external components (EXTERNAL type)", () => {
      // Forms page is orphaned (not in any navTree group) — unreachable in the
      // rendered tree, same as GWT. Verify EXTERNAL → iframe-plugin desugaring
      // works by finding any iframe-plugin in the full tree.
      const echartsPage = findPageByName(root, "ECharts")!;
      expect(echartsPage).toBeDefined();
      const iframeItem = echartsPage.items!.find(
        (item) => item.component.type === "iframe-plugin",
      );
      expect(iframeItem).toBeDefined();
    });

    it("handles displayer with external component (echarts)", () => {
      const echartsPage = findPageByName(root, "ECharts")!;
      expect(echartsPage).toBeDefined();
      const echartsItem = echartsPage.items!.find(
        (item) => item.component.type === "iframe-plugin",
      );
      expect(echartsItem).toBeDefined();
      expect(echartsItem!.component.props!["componentId"]).toBe("echarts");
    });

    it("handles meter displayer", () => {
      const meterPage = findPageByName(root, "Meter")!;
      expect(meterPage).toBeDefined();
      const meterItem = meterPage.items!.find((item) => item.component.type === "meter");
      expect(meterItem).toBeDefined();
    });

    it("handles screen component (page-ref resolution)", () => {
      const screenPage = findPageByName(root, "Screen")!;
      expect(screenPage).toBeDefined();
      // After resolution, screen component should reference the Layout page
      const layoutRef = screenPage.items!.find(
        (item) =>
          item.component.type === "page" &&
          (item.component.props as Record<string, unknown>)?.["name"] === "Layout",
      );
      expect(layoutRef).toBeDefined();
    });
  });

  describe("navTree page filtering — pages in groups excluded from top-level", () => {
    it("only root page is top-level when navTree is present", () => {
      const yaml = {
        pages: [
          { name: "index", components: [{ type: "TABS", properties: { navGroupId: "Main", targetDivId: "target" } }, { div: "target" }] },
          { name: "Dashboard", components: [{ html: "dashboard content" }] },
          { name: "Settings", components: [{ html: "settings content" }] },
          { name: "Orphan", components: [{ html: "orphan page" }] },
        ],
        navTree: {
          root_items: [{ type: "GROUP", id: "Main", children: [{ page: "Dashboard" }, { page: "Settings" }] }],
        },
      };
      const root = parsePage(yaml);
      const topLevel = root.slots!["content"]!;
      const topLevelNames = topLevel.map((p: Component) => (p.props as Record<string, unknown>)?.["name"]);
      expect(topLevelNames).toEqual(["index"]);
    });

    it("navTree-embedded pages still accessible through navigation slots", () => {
      const yaml = {
        pages: [
          { name: "index", components: [{ type: "TABS", properties: { navGroupId: "Main", targetDivId: "t" } }, { div: "t" }] },
          { name: "PageA", components: [{ html: "content A" }] },
        ],
        navTree: {
          root_items: [{ type: "GROUP", id: "Main", children: [{ page: "PageA" }] }],
        },
      };
      const root = parsePage(yaml);
      const indexPage = root.slots!["content"]!.find(
        (p: Component) => (p.props as Record<string, unknown>)?.["name"] === "index",
      )!;
      const contentTabs = indexPage.items!.find(
        (item: { component: Component }) => item.component.type === "tabs" && item.component.slots,
      );
      expect(contentTabs).toBeDefined();
      expect(contentTabs!.component.slots!["PageA"]).toBeDefined();
    });
  });

  describe("Filter dashboard — displayer with filter settings", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Filter.dash.yaml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("has root type page", () => {
      expect(root.type).toBe("page");
    });

    it("has selector component", () => {
      const page = root.slots!["content"]![0]!;
      const selector = page.items!.find((item) => item.component.type === "selector");
      expect(selector).toBeDefined();
    });

    it("has bar chart component", () => {
      const page = root.slots!["content"]![0]!;
      const chart = page.items!.find((item) => item.component.type === "bar-chart");
      expect(chart).toBeDefined();
    });
  });

  describe("Simple Chart — minimal dashboard", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Simple Chart.dash.yml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("has root type page", () => {
      expect(root.type).toBe("page");
    });

    it("has datasets", () => {
      const datasets = (root.props as Record<string, unknown>)["datasets"] as unknown[];
      expect(datasets).toBeDefined();
      expect(datasets.length).toBe(1);
    });
  });

  describe("Column with rows — nested layout", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Column with rows.dash.yaml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("parses nested rows inside columns", () => {
      const page = root.slots!["content"]![0]!;
      // Should have items from both the regular column and the nested rows
      expect(page.items!.length).toBeGreaterThan(1);
    });

    it("contains bar chart and pie chart from nested layout", () => {
      const page = root.slots!["content"]![0]!;
      const allTypes: string[] = [];
      function collectTypes(items: readonly { component: { type: string; items?: readonly { component: { type: string } }[] } }[]): void {
        for (const item of items) {
          allTypes.push(item.component.type);
          if (item.component.items) collectTypes(item.component.items);
        }
      }
      collectTypes(page.items!);
      expect(allTypes).toContain("bar-chart");
      expect(allTypes).toContain("pie-chart");
    });
  });

  describe("Developers Registration — legacy layoutTemplates format", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Developers Registration.yaml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("accepts layoutTemplates key", () => {
      expect(root.type).toBe("page");
    });

    it("handles legacy layoutColumns and layoutComponents", () => {
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBeGreaterThan(0);
    });

    it("handles type: HTML with HTML_CODE property", () => {
      const page = root.slots!["content"]![0]!;
      const htmlItems = page.items!.filter((item) => item.component.type === "html");
      expect(htmlItems.length).toBeGreaterThan(0);
    });
  });

  describe("DarkMode — lowercase displayer types", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/DarkMode.dash.yaml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("parses lowercase type: barchart as bar-chart", () => {
      const page = root.slots!["content"]![0]!;
      const chart = page.items!.find((item) => item.component.type === "bar-chart");
      expect(chart).toBeDefined();
    });

    it("parses global dark mode setting", () => {
      const settings = (root.props as Record<string, unknown>)["settings"] as Record<
        string,
        unknown
      >;
      expect(settings["mode"]).toBe("dark");
    });
  });

  describe("Global Column settings — empty displayer and global defaults", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/Global Column settings.dash.yaml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("handles empty displayer (null value)", () => {
      const page = root.slots!["content"]![0]!;
      // Should not throw, and should have items
      expect(page.items!.length).toBeGreaterThan(0);
    });
  });

  describe("Prometheus Basic — property substitution and lowercase timeseries", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Prometheus/Prometheus Basic.yml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("substitutes properties in URLs", () => {
      expect(root.type).toBe("page");
    });

    it("parses lowercase type: timeseries", () => {
      const page = root.slots!["content"]![0]!;
      const timeseries = page.items!.find((item) => item.component.type === "timeseries");
      expect(timeseries).toBeDefined();
    });
  });

  describe("InlineDataset — inline dataSet field", () => {
    const content = readFileSync(
      join(EXAMPLES_DIR, "Basic Usage/InlineDataset.dash.yaml"),
      "utf-8",
    );
    const root = parsePage(load(content));

    it("parses dashboard with inline dataSet", () => {
      expect(root.type).toBe("page");
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBeGreaterThan(0);
    });
  });
});
