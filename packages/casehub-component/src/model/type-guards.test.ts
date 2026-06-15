import { describe, it, expect } from "vitest";
import type { Component } from "./types.js";
import {
  isGrid,
  isColumns,
  isRows,
  isStack,
  isTabs,
  isPills,
  isSidebar,
  isTree,
  isMenu,
  isAccordion,
  isCarousel,
  isAppGrid,
  isPanel,
  isHtml,
  isMarkdown,
  isTitle,
  isLazyPage,
  getProps,
} from "./type-guards.js";

describe("type guards - layout components", () => {
  it("isGrid narrows grid components", () => {
    const c: Component = { type: "grid", props: { columns: 12 }, items: [] };
    expect(isGrid(c)).toBe(true);
    if (isGrid(c)) {
      expect(c.props.columns).toBe(12);
    }
  });

  it("isGrid rejects wrong type", () => {
    const c: Component = { type: "panel", props: {} };
    expect(isGrid(c)).toBe(false);
  });

  it("isColumns narrows correctly", () => {
    const c: Component = {
      type: "columns",
      props: { distribution: [1, 2, 1] },
    };
    expect(isColumns(c)).toBe(true);
    if (isColumns(c)) {
      expect(c.props.distribution).toEqual([1, 2, 1]);
    }
  });

  it("isColumns rejects wrong type", () => {
    const c: Component = { type: "grid", props: {} };
    expect(isColumns(c)).toBe(false);
  });

  it("isRows narrows correctly", () => {
    const c: Component = { type: "rows", props: {} };
    expect(isRows(c)).toBe(true);
  });

  it("isRows rejects wrong type", () => {
    const c: Component = { type: "stack", props: {} };
    expect(isRows(c)).toBe(false);
  });

  it("isStack narrows correctly", () => {
    const c: Component = { type: "stack", props: {} };
    expect(isStack(c)).toBe(true);
  });

  it("isStack rejects wrong type", () => {
    const c: Component = { type: "rows", props: {} };
    expect(isStack(c)).toBe(false);
  });

  it("isTabs narrows correctly", () => {
    const c: Component = { type: "tabs", props: {} };
    expect(isTabs(c)).toBe(true);
  });

  it("isTabs rejects wrong type", () => {
    const c: Component = { type: "pills", props: {} };
    expect(isTabs(c)).toBe(false);
  });

  it("isPills narrows correctly", () => {
    const c: Component = { type: "pills", props: {} };
    expect(isPills(c)).toBe(true);
  });

  it("isPills rejects wrong type", () => {
    const c: Component = { type: "tabs", props: {} };
    expect(isPills(c)).toBe(false);
  });

  it("isSidebar narrows correctly", () => {
    const c: Component = { type: "sidebar", props: {} };
    expect(isSidebar(c)).toBe(true);
  });

  it("isSidebar rejects wrong type", () => {
    const c: Component = { type: "menu", props: {} };
    expect(isSidebar(c)).toBe(false);
  });

  it("isTree narrows correctly", () => {
    const c: Component = { type: "tree", props: {} };
    expect(isTree(c)).toBe(true);
  });

  it("isTree rejects wrong type", () => {
    const c: Component = { type: "menu", props: {} };
    expect(isTree(c)).toBe(false);
  });

  it("isMenu narrows correctly", () => {
    const c: Component = { type: "menu", props: {} };
    expect(isMenu(c)).toBe(true);
  });

  it("isMenu rejects wrong type", () => {
    const c: Component = { type: "tree", props: {} };
    expect(isMenu(c)).toBe(false);
  });

  it("isAccordion narrows correctly", () => {
    const c: Component = { type: "accordion", props: {} };
    expect(isAccordion(c)).toBe(true);
  });

  it("isAccordion rejects wrong type", () => {
    const c: Component = { type: "carousel", props: {} };
    expect(isAccordion(c)).toBe(false);
  });

  it("isCarousel narrows correctly", () => {
    const c: Component = { type: "carousel", props: {} };
    expect(isCarousel(c)).toBe(true);
  });

  it("isCarousel rejects wrong type", () => {
    const c: Component = { type: "accordion", props: {} };
    expect(isCarousel(c)).toBe(false);
  });

  it("isAppGrid narrows correctly", () => {
    const c: Component = { type: "app-grid", props: {} };
    expect(isAppGrid(c)).toBe(true);
  });

  it("isAppGrid rejects wrong type", () => {
    const c: Component = { type: "grid", props: {} };
    expect(isAppGrid(c)).toBe(false);
  });
});

describe("type guards - wrapper components", () => {
  it("isPanel narrows correctly", () => {
    const c: Component = {
      type: "panel",
      props: { title: "Section" },
    };
    expect(isPanel(c)).toBe(true);
    if (isPanel(c)) {
      expect(c.props.title).toBe("Section");
    }
  });

  it("isPanel rejects wrong type", () => {
    const c: Component = { type: "grid", props: {} };
    expect(isPanel(c)).toBe(false);
  });
});

describe("type guards - content components", () => {
  it("isHtml narrows content components", () => {
    const c: Component = { type: "html", props: { content: "<p>hi</p>" } };
    expect(isHtml(c)).toBe(true);
    if (isHtml(c)) {
      expect(c.props.content).toBe("<p>hi</p>");
    }
  });

  it("isHtml rejects wrong type", () => {
    const c: Component = { type: "markdown", props: {} };
    expect(isHtml(c)).toBe(false);
  });

  it("isMarkdown narrows correctly", () => {
    const c: Component = {
      type: "markdown",
      props: { content: "# Heading" },
    };
    expect(isMarkdown(c)).toBe(true);
    if (isMarkdown(c)) {
      expect(c.props.content).toBe("# Heading");
    }
  });

  it("isMarkdown rejects wrong type", () => {
    const c: Component = { type: "html", props: {} };
    expect(isMarkdown(c)).toBe(false);
  });

  it("isTitle narrows correctly", () => {
    const c: Component = {
      type: "title",
      props: { text: "Dashboard", size: "large" },
    };
    expect(isTitle(c)).toBe(true);
    if (isTitle(c)) {
      expect(c.props.text).toBe("Dashboard");
      expect(c.props.size).toBe("large");
    }
  });

  it("isTitle rejects wrong type", () => {
    const c: Component = { type: "html", props: {} };
    expect(isTitle(c)).toBe(false);
  });
});

describe("type guards - page components", () => {
  it("isLazyPage narrows correctly", () => {
    const c: Component = {
      type: "lazy-page",
      props: { name: "Reports", href: "/reports.yaml" },
    };
    expect(isLazyPage(c)).toBe(true);
    if (isLazyPage(c)) {
      expect(c.props.name).toBe("Reports");
      expect(c.props.href).toBe("/reports.yaml");
    }
  });

  it("isLazyPage rejects wrong type", () => {
    const c: Component = { type: "panel", props: {} };
    expect(isLazyPage(c)).toBe(false);
  });
});

describe("getProps", () => {
  it("works for grid components", () => {
    const c: Component = { type: "grid", props: { columns: 12 } };
    const props = getProps(c, "grid");
    expect(props.columns).toBe(12);
  });

  it("works for panel components", () => {
    const c: Component = { type: "panel", props: { title: "Section" } };
    const props = getProps(c, "panel");
    expect(props.title).toBe("Section");
  });

  it("throws for mismatched type", () => {
    const c: Component = { type: "panel", props: {} };
    expect(() => getProps(c, "grid")).toThrow("Expected grid, got panel");
  });
});
