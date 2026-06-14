import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ECharts } from "echarts/core";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { BarChartProps } from "@casehub/ui/dist/model/displayer-types.js";
import { toTypedDataSet } from "@casehub/data/dist/dataset/conversion.js";

// ── Mock ECharts ──────────────────────────────────────────────────────

const mockChart = {
  setOption: vi.fn(),
  dispose: vi.fn(),
  resize: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock("echarts/core", () => ({
  init: vi.fn(() => mockChart),
  use: vi.fn(),
}));

vi.mock("echarts/renderers", () => ({
  CanvasRenderer: { type: "mock-canvas-renderer" },
}));

vi.mock("echarts/charts", () => ({
  BarChart: { type: "mock-bar-chart" },
}));

vi.mock("echarts/components", () => ({
  GridComponent: { type: "mock-grid" },
  TooltipComponent: { type: "mock-tooltip" },
  LegendComponent: { type: "mock-legend" },
  DataZoomComponent: { type: "mock-datazoom" },
  DatasetComponent: { type: "mock-dataset" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { CasehubBarChart } from "./CasehubBarChart.js";

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function makeDataSet(columns: [string, string][], rows: (string | number | null)[][]): TypedDataSet {
  const ds: DataSet = {
    columns: columns.map(([id, type]) => ({
      id: id as ColumnId,
      name: id,
      type: type as ColumnType,
    })),
    data: rows,
  };
  return toTypedDataSet(ds);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("CasehubBarChart", () => {
  let el: CasehubBarChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("casehub-bar-chart") as CasehubBarChart;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("default subtype (column) builds vertical bar chart", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100], ["Feb", 150]],
      );
      const props: BarChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataset).toEqual({
        source: [
          ["month", "sales"],
          ["Jan", 100],
          ["Feb", 150],
        ],
      });
      expect(option.xAxis).toEqual({ type: "category" });
      expect(option.yAxis).toEqual({ type: "value" });
      expect(option.series).toEqual([
        { type: "bar", encode: { x: 0, y: 1 } },
      ]);
      expect(option.tooltip).toEqual({ trigger: "axis" });
    });

    it("subtype=column builds vertical bar chart", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: BarChartProps = { lookup: mockLookup("test"), subtype: "column" };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "category" });
      expect(option.yAxis).toEqual({ type: "value" });
      expect(option.series).toEqual([
        { type: "bar", encode: { x: 0, y: 1 } },
      ]);
    });

    it("subtype=bar builds horizontal bar chart", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: BarChartProps = { lookup: mockLookup("test"), subtype: "bar" };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "value" });
      expect(option.yAxis).toEqual({ type: "category" });
      expect(option.series).toEqual([
        { type: "bar", encode: { y: 0, x: 1 } },
      ]);
    });

    it("subtype=column-stacked builds vertical stacked bar chart", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"], ["returns", "NUMBER"]],
        [["Jan", 100, 20]],
      );
      const props: BarChartProps = { lookup: mockLookup("test"), subtype: "column-stacked" };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "category" });
      expect(option.yAxis).toEqual({ type: "value" });
      expect(option.series).toEqual([
        { type: "bar", encode: { x: 0, y: 1 }, stack: "total" },
        { type: "bar", encode: { x: 0, y: 2 }, stack: "total" },
      ]);
    });

    it("subtype=bar-stacked builds horizontal stacked bar chart", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["a", "NUMBER"], ["b", "NUMBER"]],
        [["X", 10, 5]],
      );
      const props: BarChartProps = { lookup: mockLookup("test"), subtype: "bar-stacked" };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "value" });
      expect(option.yAxis).toEqual({ type: "category" });
      expect(option.series).toEqual([
        { type: "bar", encode: { y: 0, x: 1 }, stack: "total" },
        { type: "bar", encode: { y: 0, x: 2 }, stack: "total" },
      ]);
    });

    it("multiple data columns generate multiple series", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"], ["profit", "NUMBER"], ["cost", "NUMBER"]],
        [["Jan", 100, 50, 70]],
      );
      const props: BarChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "bar", encode: { x: 0, y: 1 } },
        { type: "bar", encode: { x: 0, y: 2 } },
        { type: "bar", encode: { x: 0, y: 3 } },
      ]);
    });

    it("null values in dataset pass through to source", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100], ["Feb", null], ["Mar", 150]],
      );
      const props: BarChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataset).toEqual({
        source: [
          ["month", "sales"],
          ["Jan", 100],
          ["Feb", null],
          ["Mar", 150],
        ],
      });
    });
  });

  describe("applyChartSettings", () => {
    it("applies legend settings", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: BarChartProps = {
        lookup: mockLookup("test"),
        legend: { show: true, position: "top" },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.legend).toMatchObject({ show: true, top: 0 });
    });

    it("applies margin settings via grid", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: BarChartProps = {
        lookup: mockLookup("test"),
        margin: { top: 20, right: 30, bottom: 40, left: 50 },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.grid).toMatchObject({ top: 20, right: 30, bottom: 40, left: 50 });
    });

    it("applies zoom settings", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: BarChartProps = {
        lookup: mockLookup("test"),
        zoom: true,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataZoom).toEqual([{ type: "inside" }, { type: "slider" }]);
    });
  });

  describe("extra merge", () => {
    it("deep merges extra settings onto option", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: BarChartProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Sales Report" },
          tooltip: { axisPointer: { type: "shadow" } },
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Sales Report" });
      // tooltip should be deep-merged
      expect(option.tooltip).toMatchObject({ trigger: "axis", axisPointer: { type: "shadow" } });
    });
  });
});
