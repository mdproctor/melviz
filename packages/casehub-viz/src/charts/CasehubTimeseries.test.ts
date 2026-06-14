import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ECharts } from "echarts/core";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { TimeseriesProps } from "@casehub/ui/dist/model/displayer-types.js";
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
import { CasehubTimeseries } from "./CasehubTimeseries.js";

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

describe("CasehubTimeseries", () => {
  let el: CasehubTimeseries;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("casehub-timeseries") as CasehubTimeseries;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("xAxis type is time", () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100], ["2024-01-02", 150]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.xAxis).toEqual({ type: "time" });
    });

    it("yAxis type is value", () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.yAxis).toEqual({ type: "value" });
    });

    it("multiple data columns generate multiple line series", () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["sales", "NUMBER"], ["profit", "NUMBER"], ["cost", "NUMBER"]],
        [["2024-01-01", 100, 50, 70]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "line", encode: { x: 0, y: 1 } },
        { type: "line", encode: { x: 0, y: 2 } },
        { type: "line", encode: { x: 0, y: 3 } },
      ]);
    });

    it("tooltip trigger is axis", () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.tooltip).toEqual({ trigger: "axis" });
    });

    it("dataset source format matches expected structure", () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100], ["2024-01-02", 150]],
      );
      const props: TimeseriesProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      // DATE columns are converted to Date objects by toTypedDataSet
      expect(option.dataset).toEqual({
        source: [
          ["timestamp", "value"],
          [new Date("2024-01-01"), 100],
          [new Date("2024-01-02"), 150],
        ],
      });
    });
  });

  describe("applyChartSettings", () => {
    it("applies legend settings", () => {
      const ds = makeDataSet(
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = {
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
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = {
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
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = {
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
        [["timestamp", "DATE"], ["value", "NUMBER"]],
        [["2024-01-01", 100]],
      );
      const props: TimeseriesProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Time Series Report" },
          tooltip: { axisPointer: { type: "cross" } },
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Time Series Report" });
      // tooltip should be deep-merged
      expect(option.tooltip).toMatchObject({ trigger: "axis", axisPointer: { type: "cross" } });
    });
  });
});
