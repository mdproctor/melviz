import { describe, it, expect } from "vitest";
import type { Component } from "./types.js";
import {
  isBarChart,
  isTable,
  isHtml,
  isPage,
  isGrid,
  isPanel,
  isMarkdown,
  isTitle,
  isLazyPage,
  isLineChart,
  isAreaChart,
  isPieChart,
  isScatterChart,
  isBubbleChart,
  isTimeseries,
  isMetric,
  isMeter,
  isSelector,
  isMap,
  isIframePlugin,
  isTabs,
  isPills,
  isSidebar,
  isTree,
  isMenu,
  isAccordion,
  isCarousel,
  isAppGrid,
  isColumns,
  isRows,
  isStack,
  getProps,
} from "./type-guards.js";

describe("type guards - chart components", () => {
  it("isBarChart narrows correctly", () => {
    const c: Component = {
      type: "bar-chart",
      props: {
        title: "Revenue",
        lookup: { dataSetId: "sales" },
      },
    };
    expect(isBarChart(c)).toBe(true);
    if (isBarChart(c)) {
      expect(c.props.title).toBe("Revenue");
      expect(c.props.lookup.dataSetId).toBe("sales");
    }
  });

  it("isBarChart rejects wrong type", () => {
    const c: Component = { type: "table", props: {} };
    expect(isBarChart(c)).toBe(false);
  });

  it("isLineChart narrows correctly", () => {
    const c: Component = {
      type: "line-chart",
      props: { lookup: { dataSetId: "metrics" } },
    };
    expect(isLineChart(c)).toBe(true);
    if (isLineChart(c)) {
      expect(c.props.lookup.dataSetId).toBe("metrics");
    }
  });

  it("isAreaChart narrows correctly", () => {
    const c: Component = {
      type: "area-chart",
      props: { lookup: { dataSetId: "trends" } },
    };
    expect(isAreaChart(c)).toBe(true);
  });

  it("isPieChart narrows correctly", () => {
    const c: Component = {
      type: "pie-chart",
      props: { lookup: { dataSetId: "distribution" } },
    };
    expect(isPieChart(c)).toBe(true);
  });

  it("isScatterChart narrows correctly", () => {
    const c: Component = {
      type: "scatter-chart",
      props: { lookup: { dataSetId: "correlation" } },
    };
    expect(isScatterChart(c)).toBe(true);
  });

  it("isBubbleChart narrows correctly", () => {
    const c: Component = {
      type: "bubble-chart",
      props: { lookup: { dataSetId: "bubbles" }, minRadius: 5, maxRadius: 20 },
    };
    expect(isBubbleChart(c)).toBe(true);
    if (isBubbleChart(c)) {
      expect(c.props.minRadius).toBe(5);
      expect(c.props.maxRadius).toBe(20);
    }
  });

  it("isTimeseries narrows correctly", () => {
    const c: Component = {
      type: "timeseries",
      props: { lookup: { dataSetId: "timeseries" } },
    };
    expect(isTimeseries(c)).toBe(true);
  });
});

describe("type guards - data components", () => {
  it("isTable narrows correctly", () => {
    const c: Component = {
      type: "table",
      props: { lookup: { dataSetId: "users" }, pageSize: 10 },
    };
    expect(isTable(c)).toBe(true);
    if (isTable(c)) {
      expect(c.props.pageSize).toBe(10);
    }
  });

  it("isMetric narrows correctly", () => {
    const c: Component = {
      type: "metric",
      props: { lookup: { dataSetId: "kpi" }, subtype: "card" },
    };
    expect(isMetric(c)).toBe(true);
    if (isMetric(c)) {
      expect(c.props.subtype).toBe("card");
    }
  });

  it("isMeter narrows correctly", () => {
    const c: Component = {
      type: "meter",
      props: { lookup: { dataSetId: "gauge" }, end: 100, warning: 70, critical: 90 },
    };
    expect(isMeter(c)).toBe(true);
    if (isMeter(c)) {
      expect(c.props.end).toBe(100);
    }
  });

  it("isSelector narrows correctly", () => {
    const c: Component = {
      type: "selector",
      props: { lookup: { dataSetId: "options" }, subtype: "dropdown" },
    };
    expect(isSelector(c)).toBe(true);
    if (isSelector(c)) {
      expect(c.props.subtype).toBe("dropdown");
    }
  });

  it("isMap narrows correctly", () => {
    const c: Component = {
      type: "map",
      props: { lookup: { dataSetId: "locations" }, subtype: "markers" },
    };
    expect(isMap(c)).toBe(true);
    if (isMap(c)) {
      expect(c.props.subtype).toBe("markers");
    }
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
});

describe("type guards - layout components", () => {
  it("isGrid narrows grid components", () => {
    const c: Component = { type: "grid", props: { columns: 12 }, items: [] };
    expect(isGrid(c)).toBe(true);
    if (isGrid(c)) {
      expect(c.props.columns).toBe(12);
    }
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

  it("isRows narrows correctly", () => {
    const c: Component = { type: "rows", props: {} };
    expect(isRows(c)).toBe(true);
  });

  it("isStack narrows correctly", () => {
    const c: Component = { type: "stack", props: {} };
    expect(isStack(c)).toBe(true);
  });

  it("isTabs narrows correctly", () => {
    const c: Component = { type: "tabs", props: {} };
    expect(isTabs(c)).toBe(true);
  });

  it("isPills narrows correctly", () => {
    const c: Component = { type: "pills", props: {} };
    expect(isPills(c)).toBe(true);
  });

  it("isSidebar narrows correctly", () => {
    const c: Component = { type: "sidebar", props: {} };
    expect(isSidebar(c)).toBe(true);
  });

  it("isTree narrows correctly", () => {
    const c: Component = { type: "tree", props: {} };
    expect(isTree(c)).toBe(true);
  });

  it("isMenu narrows correctly", () => {
    const c: Component = { type: "menu", props: {} };
    expect(isMenu(c)).toBe(true);
  });

  it("isAccordion narrows correctly", () => {
    const c: Component = { type: "accordion", props: {} };
    expect(isAccordion(c)).toBe(true);
  });

  it("isCarousel narrows correctly", () => {
    const c: Component = { type: "carousel", props: {} };
    expect(isCarousel(c)).toBe(true);
  });

  it("isAppGrid narrows correctly", () => {
    const c: Component = { type: "app-grid", props: {} };
    expect(isAppGrid(c)).toBe(true);
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
});

describe("type guards - page components", () => {
  it("isPage narrows correctly", () => {
    const c: Component = {
      type: "page",
      props: { name: "Dashboard" },
    };
    expect(isPage(c)).toBe(true);
    if (isPage(c)) {
      expect(c.props.name).toBe("Dashboard");
    }
  });

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
});

describe("type guards - plugin components", () => {
  it("isIframePlugin narrows correctly", () => {
    const c: Component = {
      type: "iframe-plugin",
      props: { componentId: "custom-viz" },
    };
    expect(isIframePlugin(c)).toBe(true);
    if (isIframePlugin(c)) {
      expect(c.props.componentId).toBe("custom-viz");
    }
  });
});

describe("getProps", () => {
  it("returns typed props for matching component", () => {
    const c: Component = {
      type: "bar-chart",
      props: { title: "Revenue", lookup: { dataSetId: "sales" } },
    };
    const props = getProps(c, "bar-chart");
    expect(props.title).toBe("Revenue");
    expect(props.lookup.dataSetId).toBe("sales");
  });

  it("throws for mismatched type", () => {
    const c: Component = { type: "table", props: {} };
    expect(() => getProps(c, "bar-chart")).toThrow(
      "Expected bar-chart, got table",
    );
  });

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

  it("works for page components", () => {
    const c: Component = { type: "page", props: { name: "Dashboard" } };
    const props = getProps(c, "page");
    expect(props.name).toBe("Dashboard");
  });
});
