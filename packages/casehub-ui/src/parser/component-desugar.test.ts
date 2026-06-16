import { describe, it, expect } from "vitest";
import { desugarComponent } from "./component-desugar.js";

describe("desugarComponent", () => {
  describe("content shorthands", () => {
    it("html shorthand", () => {
      const result = desugarComponent({ html: "<h1>Hi</h1>" });
      expect(result.type).toBe("html");
      expect(result.props).toEqual({ content: "<h1>Hi</h1>" });
    });

    it("markdown shorthand", () => {
      const result = desugarComponent({ markdown: "# Title" });
      expect(result.type).toBe("markdown");
      expect(result.props).toEqual({ content: "# Title" });
    });

    it("title shorthand (without type key)", () => {
      const result = desugarComponent({ title: "Hello" });
      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "Hello" });
    });

    it("title shorthand with properties → style", () => {
      const result = desugarComponent({
        title: "Welcome",
        properties: { "font-size": "24px", color: "blue" },
      });
      expect(result.type).toBe("title");
      expect(result.props).toEqual({ text: "Welcome" });
      expect(result.style).toEqual({ "font-size": "24px", color: "blue" });
    });
  });

  describe("navigation references", () => {
    it("screen shorthand → page-ref (transient)", () => {
      const result = desugarComponent({ screen: "Layout" });
      expect(result.type).toBe("page-ref");
      expect(result.props).toEqual({ name: "Layout" });
    });

    it("panel shorthand with page name", () => {
      const result = desugarComponent({ panel: "Layout" });
      expect(result.type).toBe("panel");
      expect(result.props).toEqual({ name: "Layout" });
    });

    it("div shorthand → slot-target (transient)", () => {
      const result = desugarComponent({ div: "my_div" });
      expect(result.type).toBe("slot-target");
      expect(result.props).toEqual({ id: "my_div" });
    });
  });

  describe("properties → style for content components", () => {
    it("html with properties", () => {
      const result = desugarComponent({
        html: "<p>text</p>",
        properties: { margin: "10px", "font-size": "large" },
      });
      expect(result.type).toBe("html");
      expect(result.style).toEqual({ margin: "10px", "font-size": "large" });
    });

    it("markdown with properties", () => {
      const result = desugarComponent({
        markdown: "## Heading",
        properties: { padding: "20px" },
      });
      expect(result.type).toBe("markdown");
      expect(result.style).toEqual({ padding: "20px" });
    });

    it("no properties → no style", () => {
      const result = desugarComponent({ html: "<div>test</div>" });
      expect(result.style).toBeUndefined();
    });
  });

  describe("displayer components", () => {
    it("displayer object → dispatches to displayer desugar", () => {
      const result = desugarComponent({
        displayer: { type: "BARCHART", lookup: { uuid: "sales" } },
      });
      expect(result.type).toBe("bar-chart");
      expect(result.props).toHaveProperty("lookup");
    });

    it("displayer with outer properties → style on component", () => {
      const result = desugarComponent({
        properties: { float: "left", width: "50%" },
        displayer: {
          type: "METERCHART",
          lookup: { uuid: "data" },
          meter: { end: "100" },
        },
      });
      expect(result.type).toBe("meter");
      expect(result.props).toHaveProperty("lookup");
      expect(result.props).toHaveProperty("end");
      expect(result.style).toEqual({ float: "left", width: "50%" });
    });

    it("displayer with type only", () => {
      const result = desugarComponent({
        displayer: { type: "TABLE" },
      });
      expect(result.type).toBe("table");
    });
  });

  describe("navigation components", () => {
    it("type: TABS with navGroupId", () => {
      const result = desugarComponent({
        type: "TABS",
        properties: {
          width: "100%",
          navGroupId: "Metrics",
          targetDivId: "Metrics_Div",
        },
      });
      expect(result.type).toBe("tabs");
      expect(result.props).toEqual({
        width: "100%",
        navGroupId: "Metrics",
        targetDivId: "Metrics_Div",
      });
    });

    it("type: PILLS", () => {
      const result = desugarComponent({
        type: "PILLS",
        properties: { navGroupId: "nav1" },
      });
      expect(result.type).toBe("pills");
      expect(result.props).toEqual({ navGroupId: "nav1" });
    });

    it("type: TREE", () => {
      const result = desugarComponent({
        type: "TREE",
        properties: {
          width: "180px",
          navGroupId: "Displayers",
          targetDivId: "nav_div",
        },
      });
      expect(result.type).toBe("tree");
      expect(result.props).toEqual({
        width: "180px",
        navGroupId: "Displayers",
        targetDivId: "nav_div",
      });
    });

    it("type: MENU", () => {
      const result = desugarComponent({
        type: "MENU",
        properties: { navGroupId: "main" },
      });
      expect(result.type).toBe("menu");
      expect(result.props).toEqual({ navGroupId: "main" });
    });

    it("type: CAROUSEL", () => {
      const result = desugarComponent({
        type: "CAROUSEL",
        properties: { navGroupId: "Displayers" },
      });
      expect(result.type).toBe("carousel");
      expect(result.props).toEqual({ navGroupId: "Displayers" });
    });

    it("type: TILES", () => {
      const result = desugarComponent({
        type: "TILES",
        properties: { navGroupId: "apps" },
      });
      expect(result.type).toBe("tiles");
      expect(result.props).toEqual({ navGroupId: "apps" });
    });

    it("navigation type without properties", () => {
      const result = desugarComponent({ type: "TABS" });
      expect(result.type).toBe("tabs");
      expect(result.props).toBeUndefined();
    });
  });

  describe("external components", () => {
    it("type: EXTERNAL → iframe-plugin", () => {
      const result = desugarComponent({
        type: "EXTERNAL",
        properties: {
          componentId: "uniforms",
          height: "500px",
          "uniforms.url": "http://acme.com",
        },
      });
      expect(result.type).toBe("iframe-plugin");
      expect(result.props).toEqual({
        componentId: "uniforms",
        settings: { "uniforms.url": "http://acme.com" },
      });
    });

    it("EXTERNAL with only componentId", () => {
      const result = desugarComponent({
        type: "EXTERNAL",
        properties: { componentId: "myComponent", width: "100%" },
      });
      expect(result.type).toBe("iframe-plugin");
      expect(result.props).toEqual({
        componentId: "myComponent",
      });
      expect(result.props).not.toHaveProperty("settings");
    });

    it("EXTERNAL with no properties", () => {
      const result = desugarComponent({
        type: "EXTERNAL",
      });
      expect(result.type).toBe("iframe-plugin");
      expect(result.props).toEqual({
        componentId: undefined,
      });
    });
  });

  describe("type: Displayer", () => {
    it("type: Displayer delegates to displayer desugar", () => {
      const result = desugarComponent({
        type: "Displayer",
        subtype: "COLUMN",
        lookup: { uuid: "data" },
      });
      // desugarDisplayer with type: Displayer should map to table (default)
      // but we're passing it the raw object, so it depends on implementation
      expect(result.type).toBe("table");
    });

    it("type: displayer (lowercase)", () => {
      const result = desugarComponent({
        type: "displayer",
        lookup: { uuid: "data" },
      });
      expect(result.type).toBe("table");
    });
  });

  describe("unknown components", () => {
    it("unknown type → generic wrapper", () => {
      const result = desugarComponent({
        type: "CUSTOM",
        someKey: "value",
      });
      expect(result.type).toBe("unknown");
      expect(result.props).toEqual({
        type: "CUSTOM",
        someKey: "value",
      });
    });

    it("empty object → unknown", () => {
      const result = desugarComponent({});
      expect(result.type).toBe("unknown");
      expect(result.props).toEqual({});
    });
  });

  describe("edge cases", () => {
    it("component with both title and type (type wins, title ignored)", () => {
      const result = desugarComponent({
        title: "My Title",
        type: "TABS",
        properties: { navGroupId: "nav1" },
      });
      // title shorthand check is bypassed when type exists
      expect(result.type).toBe("tabs");
    });

    it("properties with non-string values convert to strings for style", () => {
      const result = desugarComponent({
        html: "<p>text</p>",
        properties: { width: 100, height: 50, visible: true },
      });
      expect(result.style).toEqual({
        width: "100",
        height: "50",
        visible: "true",
      });
    });

    it("properties with null/undefined values are skipped", () => {
      const result = desugarComponent({
        html: "<p>text</p>",
        properties: { margin: "10px", padding: null, border: undefined },
      });
      expect(result.style).toEqual({ margin: "10px" });
    });
  });

  describe("displayer defaults merging", () => {
    it("handles null displayer with global defaults", () => {
      const defaults = { chart: { resizable: true }, lookup: { uuid: "global" } };
      const result = desugarComponent({ displayer: null }, defaults);
      expect(result.type).toBe("table"); // defaults to table
      expect(result.props?.["resizable"]).toBe(true);
    });

    it("handles empty displayer with global defaults", () => {
      const defaults = { type: "BARCHART", lookup: { uuid: "ds" } };
      const result = desugarComponent({ displayer: {} }, defaults);
      expect(result.type).toBe("bar-chart");
    });

    it("merges displayer defaults with component-level overrides", () => {
      const defaults = { chart: { resizable: true, height: 200 }, lookup: { uuid: "ds" } };
      const result = desugarComponent(
        { displayer: { type: "LINECHART", chart: { height: 400 } } },
        defaults,
      );
      expect(result.type).toBe("line-chart");
      expect(result.props?.["resizable"]).toBe(true);
      expect(result.props?.["height"]).toBe(400); // override wins
    });

    it("component without displayer ignores defaults", () => {
      const defaults = { type: "BARCHART" };
      const result = desugarComponent({ html: "<p>Hello</p>" }, defaults);
      expect(result.type).toBe("html");
    });
  });
});
