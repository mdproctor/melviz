import { describe, it, expect } from "vitest";
import type { Component } from "./types.js";
import {
  isBarChart,
  isTable,
  isPage,
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

  it("works for page components", () => {
    const c: Component = { type: "page", props: { name: "Dashboard" } };
    const props = getProps(c, "page");
    expect(props.name).toBe("Dashboard");
  });
});
