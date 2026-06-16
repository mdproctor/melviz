import { describe, it, expect } from "vitest";
import { desugarDisplayer } from "./displayer-desugar.js";

describe("desugarDisplayer", () => {
  it("maps BARCHART to bar-chart with typed props", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      general: { title: "Revenue" },
      lookup: { uuid: "sales" },
    });
    expect(result.type).toBe("bar-chart");
    expect(result.props?.["title"]).toBe("Revenue");
  });

  it("extracts rowCount from lookup into props", () => {
    const result = desugarDisplayer({
      type: "TABLE",
      lookup: { uuid: "sales", rowCount: 10 },
    });
    expect(result.props?.["rowCount"]).toBe(10);
  });

  it("extracts chart settings", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      chart: { margin: { left: 80 }, resizable: true },
      lookup: { uuid: "sales" },
    });
    expect((result.props as any).margin).toEqual({ left: 80 });
    expect(result.props?.["resizable"]).toBe(true);
  });

  it("maps html.html to html.template for metrics", () => {
    const result = desugarDisplayer({
      type: "METRIC",
      html: { html: "<div>${value}</div>", javascript: "console.log(1)" },
      lookup: { uuid: "sales" },
    });
    expect((result.props as any).html.template).toBe("<div>${value}</div>");
    expect((result.props as any).html.javascript).toBe("console.log(1)");
  });

  it("maps extraConfiguration to extra", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      extraConfiguration: '{"color": ["#ff0000"]}',
      lookup: { uuid: "sales" },
    });
    expect((result.props as any).extra).toEqual({ color: ["#ff0000"] });
  });

  it("defaults to table type when no type specified", () => {
    const result = desugarDisplayer({
      lookup: { uuid: "sales" },
      table: { pageSize: 10 },
    });
    expect(result.type).toBe("table");
  });

  it("maps component key to iframe-plugin", () => {
    const result = desugarDisplayer({
      component: "echarts",
      echarts: { title: { text: "Chart" } },
      lookup: { uuid: "data" },
    });
    expect(result.type).toBe("iframe-plugin");
    expect(result.props?.["componentId"]).toBe("echarts");
    expect((result.props as any).settings).toBeDefined();
  });

  it("maps subtype", () => {
    const result = desugarDisplayer({
      type: "SELECTOR",
      subtype: "SELECTOR_LABELS",
      lookup: { uuid: "sales" },
    });
    expect(result.props?.["subtype"]).toBe("labels");
  });

  it("maps meter settings", () => {
    const result = desugarDisplayer({
      type: "METERCHART",
      meter: { end: "4120", critical: "3000", warning: "2000" },
      lookup: { uuid: "data" },
    });
    expect(result.type).toBe("meter");
    expect(result.props?.["end"]).toBe(4120);
  });

  it("extracts filter settings", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      filter: { enabled: true, notification: true, listening: false },
      lookup: { uuid: "sales" },
    });
    expect((result.props as any).filter.notification).toBe(true);
  });

  it("handles external width/height", () => {
    const result = desugarDisplayer({
      component: "echarts",
      external: { width: "100%", height: "400px" },
      lookup: { uuid: "data" },
    });
    expect(result.props?.["width"]).toBe("100%");
    expect(result.props?.["height"]).toBe("400px");
  });

  it("maps all DisplayerType values correctly", () => {
    const typeTests = [
      { input: "BARCHART", expected: "bar-chart" },
      { input: "LINECHART", expected: "line-chart" },
      { input: "AREACHART", expected: "area-chart" },
      { input: "PIECHART", expected: "pie-chart" },
      { input: "SCATTERCHART", expected: "scatter-chart" },
      { input: "BUBBLECHART", expected: "bubble-chart" },
      { input: "TIMESERIES", expected: "timeseries" },
      { input: "TABLE", expected: "table" },
      { input: "METRIC", expected: "metric" },
      { input: "METERCHART", expected: "meter" },
      { input: "SELECTOR", expected: "selector" },
      { input: "MAP", expected: "map" },
    ];

    for (const { input, expected } of typeTests) {
      const result = desugarDisplayer({ type: input, lookup: { uuid: "data" } });
      expect(result.type).toBe(expected);
    }
  });

  it("maps all subtype values correctly", () => {
    const subtypeTests = [
      { input: "SELECTOR_DROPDOWN", expected: "dropdown" },
      { input: "SELECTOR_SLIDER", expected: "slider" },
      { input: "SELECTOR_LABELS", expected: "labels" },
      { input: "BAR", expected: "bar" },
      { input: "BAR_STACKED", expected: "bar-stacked" },
      { input: "COLUMN", expected: "column" },
      { input: "COLUMN_STACKED", expected: "column-stacked" },
      { input: "LINE", expected: "line" },
      { input: "SMOOTH", expected: "smooth" },
      { input: "AREA", expected: "area" },
      { input: "AREA_STACKED", expected: "area-stacked" },
      { input: "PIE", expected: "pie" },
      { input: "PIE_3D", expected: "pie" }, // 3D dropped
      { input: "DONUT", expected: "donut" },
      { input: "MAP_REGIONS", expected: "regions" },
      { input: "MAP_MARKERS", expected: "markers" },
      { input: "METRIC_CARD", expected: "card" },
      { input: "METRIC_CARD2", expected: "card2" },
      { input: "METRIC_PLAIN_TEXT", expected: "plain-text" },
      { input: "METRIC_QUOTA", expected: "quota" },
    ];

    for (const { input, expected } of subtypeTests) {
      const result = desugarDisplayer({
        type: "SELECTOR",
        subtype: input,
        lookup: { uuid: "data" },
      });
      expect(result.props?.["subtype"]).toBe(expected);
    }
  });

  it("extracts all general settings", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      general: { title: "My Chart", visible: false },
      lookup: { uuid: "data" },
    });
    expect(result.props?.["title"]).toBe("My Chart");
    expect(result.props?.["visible"]).toBe(false);
  });

  it("extracts all chart settings", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      chart: {
        resizable: true,
        zoom: true,
        legend: { show: true },
        margin: { left: 80, right: 20 },
        height: 400,
        width: 600,
      },
      lookup: { uuid: "data" },
    });
    expect(result.props?.["resizable"]).toBe(true);
    expect(result.props?.["zoom"]).toBe(true);
    expect((result.props as any).legend).toEqual({ show: true });
    expect((result.props as any).margin).toEqual({ left: 80, right: 20 });
    expect(result.props?.["height"]).toBe(400);
    expect(result.props?.["width"]).toBe(600);
  });

  it("extracts table pageSize", () => {
    const result = desugarDisplayer({
      type: "TABLE",
      table: { pageSize: 25 },
      lookup: { uuid: "data" },
    });
    expect(result.props?.["pageSize"]).toBe(25);
  });

  it("extracts columns", () => {
    const result = desugarDisplayer({
      type: "TABLE",
      columns: [
        { id: "name", name: "Name" },
        { id: "age", name: "Age" },
      ],
      lookup: { uuid: "data" },
    });
    expect(result.props?.["columns"]).toEqual([
      { id: "name", name: "Name" },
      { id: "age", name: "Age" },
    ]);
  });

  it("handles dataSetLookup as alternative to lookup", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      dataSetLookup: { uuid: "sales", rowCount: 100 },
    });
    expect((result.props as any).lookup).toEqual({ uuid: "sales", rowCount: 100 });
    expect(result.props?.["rowCount"]).toBe(100);
  });

  it("returns undefined props when no settings extracted", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
    });
    expect(result.type).toBe("bar-chart");
    expect(result.props).toBeUndefined();
  });

  it("handles invalid extraConfiguration gracefully", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      extraConfiguration: "not valid json {",
      lookup: { uuid: "data" },
    });
    expect((result.props as any).extra).toBe("not valid json {");
  });

  it("collects component settings for external components", () => {
    const result = desugarDisplayer({
      component: "echarts",
      echarts: { option: { title: { text: "My Chart" } } },
      "echarts.theme": "dark",
      lookup: { uuid: "data" },
    });
    expect(result.type).toBe("iframe-plugin");
    expect(result.props?.["componentId"]).toBe("echarts");
    expect((result.props as any).settings).toEqual({
      echarts: { option: { title: { text: "My Chart" } } },
      "echarts.theme": "dark",
    });
  });

  it("converts meter string values to numbers", () => {
    const result = desugarDisplayer({
      type: "METERCHART",
      meter: { end: "100", warning: "60", critical: "80" },
      lookup: { uuid: "data" },
    });
    expect(result.props?.["end"]).toBe(100);
    expect(result.props?.["warning"]).toBe(60);
    expect(result.props?.["critical"]).toBe(80);
  });

  it("passes through meter numeric values unchanged", () => {
    const result = desugarDisplayer({
      type: "METERCHART",
      meter: { end: 100, warning: 60, critical: 80 },
      lookup: { uuid: "data" },
    });
    expect(result.props?.["end"]).toBe(100);
    expect(result.props?.["warning"]).toBe(60);
    expect(result.props?.["critical"]).toBe(80);
  });

  it("preserves non-mapped subtype as lowercase", () => {
    const result = desugarDisplayer({
      type: "SELECTOR",
      subtype: "CUSTOM_TYPE",
      lookup: { uuid: "data" },
    });
    expect(result.props?.["subtype"]).toBe("custom_type");
  });

  it("extracts top-level axis.x settings", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      axis: { x: { labels_angle: 30, title: "Month" } },
      lookup: { uuid: "data" },
    });
    expect((result.props as any).xAxis).toEqual({
      labelAngle: 30,
      title: "Month",
    });
  });

  it("extracts top-level axis.y settings", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      axis: { y: { title: "Revenue", labels_show: false } },
      lookup: { uuid: "data" },
    });
    expect((result.props as any).yAxis).toEqual({
      title: "Revenue",
      showLabels: false,
    });
  });

  it("extracts axis from chart.axis (nested)", () => {
    const result = desugarDisplayer({
      type: "LINECHART",
      chart: { resizable: true, axis: { x: { labels_angle: 10 } } },
      lookup: { uuid: "data" },
    });
    expect(result.props?.["resizable"]).toBe(true);
    expect((result.props as any).xAxis).toEqual({ labelAngle: 10 });
  });

  it("prefers top-level axis over chart.axis", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      axis: { x: { labels_angle: 30 } },
      chart: { axis: { x: { labels_angle: 10 } } },
      lookup: { uuid: "data" },
    });
    expect((result.props as any).xAxis).toEqual({ labelAngle: 30 });
  });

  it("extracts both x and y axis simultaneously", () => {
    const result = desugarDisplayer({
      type: "BARCHART",
      axis: {
        x: { labels_angle: 30, title: "X" },
        y: { title: "Y", labels_show: false },
      },
      lookup: { uuid: "data" },
    });
    expect((result.props as any).xAxis).toEqual({ labelAngle: 30, title: "X" });
    expect((result.props as any).yAxis).toEqual({ title: "Y", showLabels: false });
  });
});
