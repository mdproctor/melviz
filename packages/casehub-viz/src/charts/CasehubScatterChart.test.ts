import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { ScatterChartProps } from "@casehub/ui/dist/model/displayer-types.js";
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
  ScatterChart: { type: "mock-scatter-chart" },
}));

vi.mock("echarts/components", () => ({
  GridComponent: { type: "mock-grid" },
  TooltipComponent: { type: "mock-tooltip" },
  LegendComponent: { type: "mock-legend" },
  DatasetComponent: { type: "mock-dataset" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { CasehubScatterChart } from "./CasehubScatterChart.js";

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

describe("CasehubScatterChart", () => {
  let el: CasehubScatterChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("casehub-scatter-chart") as CasehubScatterChart;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("basic scatter with 2 columns", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"]],
        [[10, 20], [30, 40], [50, 60]],
      );
      const props: ScatterChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataset).toEqual({
        source: [
          ["x", "y"],
          [10, 20],
          [30, 40],
          [50, 60],
        ],
      });
      expect(option.xAxis).toEqual({ type: "value" });
      expect(option.yAxis).toEqual({ type: "value" });
      expect(option.series).toEqual([
        { type: "scatter", encode: { x: 0, y: 1 } },
      ]);
      expect(option.tooltip).toEqual({ trigger: "item" });
    });

    it("scatter with symbolSize callback when 3 columns", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "NUMBER"]],
        [[10, 20, 5], [30, 40, 15]],
      );
      const props: ScatterChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0]!;

      expect(series.type).toBe("scatter");
      expect(series.encode).toEqual({ x: 0, y: 1 });
      expect(typeof series.symbolSize).toBe("function");

      // Test symbolSize callback
      const symbolSizeFn = series.symbolSize as (value: unknown[]) => number;
      expect(symbolSizeFn([10, 20, 5])).toBeCloseTo(Math.sqrt(5) * 3);
      expect(symbolSizeFn([30, 40, 15])).toBeCloseTo(Math.sqrt(15) * 3);
    });

    it("symbolSize returns default when value is not a number", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "LABEL"]],
        [[10, 20, null]],
      );
      const props: ScatterChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0]!;
      const symbolSizeFn = series.symbolSize as (value: unknown[]) => number;

      expect(symbolSizeFn([10, 20, null])).toBe(10);
    });

    it("applies chart settings", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"]],
        [[10, 20]],
      );
      const props: ScatterChartProps = {
        lookup: mockLookup("test"),
        legend: { show: true, position: "right" },
        xAxis: { title: "X Axis" },
        yAxis: { title: "Y Axis" },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.legend).toMatchObject({ show: true, right: 0, orient: "vertical" });
      expect(option.xAxis).toMatchObject({ type: "value", name: "X Axis" });
      expect(option.yAxis).toMatchObject({ type: "value", name: "Y Axis" });
    });

    it("deep merges extra settings", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"]],
        [[10, 20]],
      );
      const props: ScatterChartProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Scatter Plot" },
          tooltip: { formatter: "custom" },
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Scatter Plot" });
      expect(option.tooltip).toMatchObject({ trigger: "item", formatter: "custom" });
    });
  });
});
