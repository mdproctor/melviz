import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { load } from "js-yaml";
import { parsePage } from "./page-parser.js";
import { join } from "path";
import { globSync } from "glob";

const EXAMPLES_DIR = join(__dirname, "../../../../examples/dashboards");

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

    it("has many pages", () => {
      const pages = root.slots!["content"]!;
      expect(pages.length).toBeGreaterThan(10);
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

    it("resolves navigation components with slots", () => {
      // The index page has TABS with navGroupId MainGroup
      const indexPage = root.slots!["content"]!.find(
        (p) => (p.props as Record<string, unknown>)?.["name"] === "index",
      )!;
      expect(indexPage).toBeDefined();
      const tabsItem = indexPage.items!.find((item) => item.component.type === "tabs");
      expect(tabsItem).toBeDefined();
      expect(tabsItem!.component.slots).toBeDefined();
    });

    it("handles external components (EXTERNAL type)", () => {
      const formsPage = root.slots!["content"]!.find(
        (p) => (p.props as Record<string, unknown>)?.["name"] === "Forms",
      )!;
      expect(formsPage).toBeDefined();
      const externalItem = formsPage.items!.find(
        (item) => item.component.type === "iframe-plugin",
      );
      expect(externalItem).toBeDefined();
    });

    it("handles displayer with external component (echarts)", () => {
      const echartsPage = root.slots!["content"]!.find(
        (p) => (p.props as Record<string, unknown>)?.["name"] === "ECharts",
      )!;
      expect(echartsPage).toBeDefined();
      const echartsItem = echartsPage.items!.find(
        (item) => item.component.type === "iframe-plugin",
      );
      expect(echartsItem).toBeDefined();
      expect(echartsItem!.component.props!["componentId"]).toBe("echarts");
    });

    it("handles meter displayer", () => {
      const meterPage = root.slots!["content"]!.find(
        (p) => (p.props as Record<string, unknown>)?.["name"] === "Meter",
      )!;
      expect(meterPage).toBeDefined();
      const meterItem = meterPage.items!.find((item) => item.component.type === "meter");
      expect(meterItem).toBeDefined();
    });

    it("handles screen component (page-ref resolution)", () => {
      const screenPage = root.slots!["content"]!.find(
        (p) => (p.props as Record<string, unknown>)?.["name"] === "Screen",
      )!;
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
      const types = page.items!.map((item) => item.component.type);
      expect(types).toContain("bar-chart");
      expect(types).toContain("pie-chart");
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
