import { describe, it, expect } from "vitest";
import type { Component } from "@casehub/component/dist/model/types.js";
import { createActivationCallback } from "./activation.js";
import type { ComponentRegistry } from "./registry.js";
import type { PagePathMap } from "./page-paths.js";

const DATA_TYPES = [
  "bar-chart",
  "line-chart",
  "area-chart",
  "pie-chart",
  "scatter-chart",
  "bubble-chart",
  "timeseries",
  "table",
  "metric",
  "meter",
  "selector",
  "map",
  "iframe-plugin",
];

describe("createActivationCallback", () => {
  function setup(component: Component) {
    const registry: ComponentRegistry = new Map();
    const pagePathMap: PagePathMap = new Map([[component, "TestPage"]]);
    const callback = createActivationCallback(registry, pagePathMap);
    const el = document.createElement("div");
    el.dataset.componentId = "test-id";
    el.dataset.componentType = component.type;
    callback(el, component);
    return { registry, el };
  }

  for (const type of DATA_TYPES) {
    it(`creates casehub-${type} element for ${type}`, () => {
      const component: Component = { type, props: { lookup: { dataSetId: "ds", operations: [] } } };
      const { el } = setup(component);
      const child = el.firstElementChild;
      expect(child).toBeTruthy();
      expect(child!.localName).toBe(`casehub-${type}`);
    });
  }

  it("registers data component in ComponentRegistry", () => {
    const component: Component = {
      type: "bar-chart",
      props: { lookup: { dataSetId: "ds", operations: [] } },
    };
    const { registry } = setup(component);
    expect(registry.get("test-id")).toBeTruthy();
    expect(registry.get("test-id")!.pagePath).toBe("TestPage");
    expect(registry.get("test-id")!.originalLookup).toEqual({ dataSetId: "ds", operations: [] });
  });

  it("creates iframe-plugin element", () => {
    const component: Component = { type: "iframe-plugin", props: { componentId: "custom" } };
    const { el, registry } = setup(component);
    expect(el.firstElementChild!.localName).toBe("casehub-iframe-plugin");
    expect(registry.has("test-id")).toBe(true);
  });

  it("renders title as heading element", () => {
    const component: Component = { type: "title", props: { text: "Hello", size: "h2" } };
    const { el } = setup(component);
    const heading = el.querySelector("h2");
    expect(heading).toBeTruthy();
    expect(heading!.textContent).toBe("Hello");
  });

  it("renders html content", () => {
    const component: Component = { type: "html", props: { content: "<b>bold</b>" } };
    const { el } = setup(component);
    expect(el.querySelector("b")?.textContent).toBe("bold");
  });

  it("renders markdown as parsed HTML", () => {
    const component: Component = { type: "markdown", props: { content: "# Hello" } };
    const { el } = setup(component);
    expect(el.querySelector(".casehub-markdown h1")?.textContent).toBe("Hello");
  });

  it("does not activate layout types", () => {
    const component: Component = { type: "grid", props: { columns: 12 } };
    const { registry } = setup(component);
    expect(registry.size).toBe(0);
  });

  it("does not activate unknown types", () => {
    const component: Component = { type: "custom-widget" };
    const { registry } = setup(component);
    expect(registry.size).toBe(0);
  });

  it("does not activate page types", () => {
    const component: Component = { type: "page", props: { name: "Test" } };
    const { registry } = setup(component);
    expect(registry.size).toBe(0);
  });

  it("skips if no componentId", () => {
    const registry: ComponentRegistry = new Map();
    const component: Component = { type: "bar-chart" };
    const pagePathMap: PagePathMap = new Map([[component, ""]]);
    const callback = createActivationCallback(registry, pagePathMap);
    const el = document.createElement("div");
    // NO dataset.componentId set
    callback(el, component);
    expect(registry.size).toBe(0);
  });
});
