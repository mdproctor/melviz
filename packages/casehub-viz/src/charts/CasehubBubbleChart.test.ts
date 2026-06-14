import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { BubbleChartProps } from "@casehub/ui/dist/model/displayer-types.js";
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
import { CasehubBubbleChart } from "./CasehubBubbleChart.js";

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

describe("CasehubBubbleChart", () => {
  let el: CasehubBubbleChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("casehub-bubble-chart") as CasehubBubbleChart;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("bubble with default minRadius/maxRadius (5/50)", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "NUMBER"]],
        [[10, 20, 10], [30, 40, 20], [50, 60, 30]],
      );
      const props: BubbleChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataset).toEqual({
        source: [
          ["x", "y", "size"],
          [10, 20, 10],
          [30, 40, 20],
          [50, 60, 30],
        ],
      });
      expect(option.xAxis).toEqual({ type: "value" });
      expect(option.yAxis).toEqual({ type: "value" });

      const series = (option.series as Record<string, unknown>[])[0]!;
      expect(series.type).toBe("scatter");
      expect(series.encode).toEqual({ x: 0, y: 1 });
      expect(typeof series.symbolSize).toBe("function");
    });

    it("uses linear interpolation for symbolSize", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "NUMBER"]],
        [[10, 20, 10], [30, 40, 20], [50, 60, 30]],
      );
      const props: BubbleChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0]!;
      const symbolSizeFn = series.symbolSize as (value: unknown[]) => number;

      // Data range: 10 to 30, radius range: 5 to 50
      // value 10 → 5 (min)
      // value 20 → 27.5 (mid)
      // value 30 → 50 (max)
      expect(symbolSizeFn([10, 20, 10])).toBeCloseTo(5);
      expect(symbolSizeFn([30, 40, 20])).toBeCloseTo(27.5);
      expect(symbolSizeFn([50, 60, 30])).toBeCloseTo(50);
    });

    it("respects custom minRadius/maxRadius", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "NUMBER"]],
        [[10, 20, 100], [30, 40, 200]],
      );
      const props: BubbleChartProps = {
        lookup: mockLookup("test"),
        minRadius: 10,
        maxRadius: 100,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0]!;
      const symbolSizeFn = series.symbolSize as (value: unknown[]) => number;

      // Data range: 100 to 200, radius range: 10 to 100
      // value 100 → 10 (min)
      // value 200 → 100 (max)
      expect(symbolSizeFn([10, 20, 100])).toBeCloseTo(10);
      expect(symbolSizeFn([30, 40, 200])).toBeCloseTo(100);
    });

    it("returns minRadius when value is not a number", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "LABEL"]],
        [[10, 20, null], [30, 40, 50]],
      );
      const props: BubbleChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0]!;
      const symbolSizeFn = series.symbolSize as (value: unknown[]) => number;

      expect(symbolSizeFn([10, 20, null])).toBe(5); // default minRadius
    });

    it("applies chart settings", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "NUMBER"]],
        [[10, 20, 10]],
      );
      const props: BubbleChartProps = {
        lookup: mockLookup("test"),
        legend: { show: false },
        margin: { top: 10, right: 20, bottom: 30, left: 40 },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.legend).toMatchObject({ show: false });
      expect(option.grid).toMatchObject({ top: 10, right: 20, bottom: 30, left: 40 });
    });

    it("deep merges extra settings", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "NUMBER"]],
        [[10, 20, 10]],
      );
      const props: BubbleChartProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Bubble Chart" },
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Bubble Chart" });
    });

    it("handles empty values array (all nulls) without crashing", () => {
      const ds = makeDataSet(
        [["x", "NUMBER"], ["y", "NUMBER"], ["size", "LABEL"]],
        [[10, 20, null], [30, 40, null], [50, 60, null]],
      );
      const props: BubbleChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0]!;
      const symbolSizeFn = series.symbolSize as (value: unknown[]) => number;

      // Should use constant size (midpoint of 5 and 50 = 27.5)
      expect(symbolSizeFn([10, 20, null])).toBe(27.5);
      expect(symbolSizeFn([30, 40, null])).toBe(27.5);
      expect(symbolSizeFn([50, 60, null])).toBe(27.5);
    });
  });
});
