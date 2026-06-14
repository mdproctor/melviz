import { describe, it, expect } from "vitest";
import {
  barChart,
  lineChart,
  areaChart,
  pieChart,
  scatterChart,
  bubbleChart,
  timeseries,
  table,
  metric,
  meter,
  selector,
  mapChart,
  iframePlugin,
} from "./builders.js";
import { lookup, groupBy, col, sum } from "./lookup-helpers.js";
import { isBarChart, isTable, isMetric } from "../model/type-guards.js";

describe("data component builders", () => {
  const salesLookup = lookup("sales", groupBy("product", col("product"), sum("revenue")));

  it("barChart()", () => {
    const c = barChart({ lookup: salesLookup, subtype: "bar-stacked", title: "Revenue" });
    expect(isBarChart(c)).toBe(true);
    expect(c.props!["subtype"]).toBe("bar-stacked");
    expect(c.props!["title"]).toBe("Revenue");
  });

  it("lineChart()", () => {
    const c = lineChart({ lookup: salesLookup, subtype: "smooth" });
    expect(c.type).toBe("line-chart");
    expect(c.props!["subtype"]).toBe("smooth");
  });

  it("areaChart()", () => {
    const c = areaChart({ lookup: salesLookup, subtype: "area-stacked" });
    expect(c.type).toBe("area-chart");
  });

  it("pieChart()", () => {
    const c = pieChart({ lookup: salesLookup, subtype: "donut" });
    expect(c.type).toBe("pie-chart");
    expect(c.props!["subtype"]).toBe("donut");
  });

  it("scatterChart()", () => {
    const c = scatterChart({ lookup: salesLookup });
    expect(c.type).toBe("scatter-chart");
  });

  it("bubbleChart() with radius", () => {
    const c = bubbleChart({ lookup: salesLookup, minRadius: 5, maxRadius: 50 });
    expect(c.type).toBe("bubble-chart");
    expect(c.props!["minRadius"]).toBe(5);
    expect(c.props!["maxRadius"]).toBe(50);
  });

  it("timeseries()", () => {
    const c = timeseries({ lookup: salesLookup });
    expect(c.type).toBe("timeseries");
  });

  it("table()", () => {
    const c = table({ lookup: salesLookup, pageSize: 10, sortable: true });
    expect(isTable(c)).toBe(true);
    expect(c.props!["pageSize"]).toBe(10);
    expect(c.props!["sortable"]).toBe(true);
  });

  it("metric() with subtype", () => {
    const c = metric({ lookup: salesLookup, subtype: "card" });
    expect(isMetric(c)).toBe(true);
    expect(c.props!["subtype"]).toBe("card");
  });

  it("meter()", () => {
    const c = meter({ lookup: salesLookup, end: 100, warning: 70, critical: 90 });
    expect(c.type).toBe("meter");
    expect(c.props!["end"]).toBe(100);
  });

  it("selector()", () => {
    const c = selector({ lookup: salesLookup, subtype: "labels" });
    expect(c.type).toBe("selector");
    expect(c.props!["subtype"]).toBe("labels");
  });

  it("mapChart()", () => {
    const c = mapChart({ lookup: salesLookup, subtype: "markers", colorScheme: "blues" });
    expect(c.type).toBe("map");
    expect(c.props!["colorScheme"]).toBe("blues");
  });

  it("iframePlugin() without lookup", () => {
    const c = iframePlugin({ componentId: "uniforms" });
    expect(c.type).toBe("iframe-plugin");
    expect(c.props!["componentId"]).toBe("uniforms");
    expect(c.props!["lookup"]).toBeUndefined();
  });

  it("iframePlugin() with lookup and refresh", () => {
    const c = iframePlugin({
      componentId: "echarts",
      lookup: salesLookup,
      refresh: { interval: 30 },
    });
    expect(c.props!["lookup"]).toBeDefined();
    expect((c.props as any).refresh.interval).toBe(30);
  });

  it("all builders return frozen components", () => {
    const c = barChart({ lookup: salesLookup });
    expect(Object.isFrozen(c)).toBe(true);
  });
});
