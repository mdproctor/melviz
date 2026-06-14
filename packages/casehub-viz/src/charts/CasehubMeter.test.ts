import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ECharts } from "echarts/core";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { MeterProps } from "@casehub/ui/dist/model/displayer-types.js";
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
  GaugeChart: { type: "mock-gauge-chart" },
}));

vi.mock("echarts/components", () => ({
  TooltipComponent: { type: "mock-tooltip" },
  LegendComponent: { type: "mock-legend" },
  DatasetComponent: { type: "mock-dataset" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { CasehubMeter } from "./CasehubMeter.js";

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

describe("CasehubMeter", () => {
  let el: CasehubMeter;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("casehub-meter") as CasehubMeter;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("basic gauge with default max 100", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["Temperature", 75]],
      );
      const props: MeterProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        {
          type: "gauge",
          data: [{ value: 75 }],
          max: 100,
          axisLine: { lineStyle: { color: [[1, "#5470c6"]] } },
        },
      ]);
      expect(option.tooltip).toEqual({ trigger: "item" });
    });

    it("custom end (max)", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["Speed", 150]],
      );
      const props: MeterProps = { lookup: mockLookup("test"), end: 200 };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0];

      expect(series.max).toBe(200);
      expect(series.data).toEqual([{ value: 150 }]);
    });

    it("both warning and critical → 3 color bands", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["CPU", 85]],
      );
      const props: MeterProps = {
        lookup: mockLookup("test"),
        end: 100,
        warning: 60,
        critical: 80,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0];
      const axisLine = series.axisLine as { lineStyle: { color: [number, string][] } };

      expect(axisLine.lineStyle.color).toEqual([
        [0.6, "#91cc75"],  // warning/end = 60/100
        [0.8, "#fac858"],  // critical/end = 80/100
        [1, "#ee6666"],
      ]);
    });

    it("only warning → 2 color bands", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["Disk", 45]],
      );
      const props: MeterProps = {
        lookup: mockLookup("test"),
        end: 100,
        warning: 70,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0];
      const axisLine = series.axisLine as { lineStyle: { color: [number, string][] } };

      expect(axisLine.lineStyle.color).toEqual([
        [0.7, "#91cc75"],  // warning/end = 70/100
        [1, "#ee6666"],
      ]);
    });

    it("only critical → 2 color bands", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["Memory", 55]],
      );
      const props: MeterProps = {
        lookup: mockLookup("test"),
        end: 100,
        critical: 90,
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0];
      const axisLine = series.axisLine as { lineStyle: { color: [number, string][] } };

      expect(axisLine.lineStyle.color).toEqual([
        [0.9, "#fac858"],  // critical/end = 90/100
        [1, "#ee6666"],
      ]);
    });

    it("neither warning nor critical → single color", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["Score", 42]],
      );
      const props: MeterProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0];
      const axisLine = series.axisLine as { lineStyle: { color: [number, string][] } };

      expect(axisLine.lineStyle.color).toEqual([[1, "#5470c6"]]);
    });

    it("value from first NUMBER column (skips LABEL column 0)", () => {
      const ds = makeDataSet(
        [["label", "LABEL"], ["count", "NUMBER"], ["extra", "NUMBER"]],
        [["Item A", 123, 456]],
      );
      const props: MeterProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
      const series = (option.series as Record<string, unknown>[])[0];

      // Should use first NUMBER column = column index 1 = value 123
      expect(series.data).toEqual([{ value: 123 }]);
    });
  });

  describe("extra merge", () => {
    it("deep merges extra settings onto option", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["Status", 88]],
      );
      const props: MeterProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "System Status" },
          series: [{ detail: { formatter: "{value}%" } }],
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "System Status" });
      // series should be deep-merged
      const series = (option.series as Record<string, unknown>[])[0];
      expect(series.detail).toEqual({ formatter: "{value}%" });
    });
  });

  describe("tooltip", () => {
    it("sets tooltip trigger to item", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["CPU", 50]],
      );
      const props: MeterProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.tooltip).toEqual({ trigger: "item" });
    });
  });
});
