import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ECharts } from "echarts/core";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { AreaChartProps } from "@casehub/ui/dist/model/displayer-types.js";
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
  LineChart: { type: "mock-line-chart" },
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
import { CasehubAreaChart } from "./CasehubAreaChart.js";

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

describe("CasehubAreaChart", () => {
  let el: CasehubAreaChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("casehub-area-chart") as CasehubAreaChart;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("default subtype (area) builds area chart", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100], ["Feb", 150]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test") };

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
        { type: "line", encode: { x: 0, y: 1 }, areaStyle: {} },
      ]);
      expect(option.tooltip).toEqual({ trigger: "axis" });
    });

    it("subtype=area builds area chart", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test"), subtype: "area" };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "line", encode: { x: 0, y: 1 }, areaStyle: {} },
      ]);
    });

    it("subtype=area-stacked builds stacked area chart", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["a", "NUMBER"], ["b", "NUMBER"]],
        [["X", 10, 5]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test"), subtype: "area-stacked" };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "line", encode: { x: 0, y: 1 }, areaStyle: {}, stack: "total" },
        { type: "line", encode: { x: 0, y: 2 }, areaStyle: {}, stack: "total" },
      ]);
    });

    it("multiple data columns generate multiple series", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"], ["profit", "NUMBER"], ["cost", "NUMBER"]],
        [["Jan", 100, 50, 70]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "line", encode: { x: 0, y: 1 }, areaStyle: {} },
        { type: "line", encode: { x: 0, y: 2 }, areaStyle: {} },
        { type: "line", encode: { x: 0, y: 3 }, areaStyle: {} },
      ]);
    });

    it("null values in dataset pass through to source", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100], ["Feb", null], ["Mar", 150]],
      );
      const props: AreaChartProps = { lookup: mockLookup("test") };

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
      const props: AreaChartProps = {
        lookup: mockLookup("test"),
        legend: { show: false },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.legend).toMatchObject({ show: false });
    });

    it("applies xAxis and yAxis settings", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: AreaChartProps = {
        lookup: mockLookup("test"),
        xAxis: { title: "Month", showLabels: true },
        yAxis: { title: "Sales", showLabels: false },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toMatchObject({ type: "category", name: "Month", axisLabel: { show: true } });
      expect(option.yAxis).toMatchObject({ type: "value", name: "Sales", axisLabel: { show: false } });
    });
  });

  describe("extra merge", () => {
    it("deep merges extra settings onto option", () => {
      const ds = makeDataSet(
        [["month", "LABEL"], ["sales", "NUMBER"]],
        [["Jan", 100]],
      );
      const props: AreaChartProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Area Chart" },
          color: ["#ff0000"],
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Area Chart" });
      expect(option.color).toEqual(["#ff0000"]);
    });
  });
});
