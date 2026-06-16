import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  VisualMapComponent: { type: "mock-visualmap" },
  TitleComponent: { type: "mock-title" },
}));

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

function getOption(el: CasehubMeter, ds: TypedDataSet): Record<string, unknown> {
  document.body.appendChild(el);
  el.dataSet = ds;
  return mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;
}

function getSeries(option: Record<string, unknown>): Record<string, unknown> {
  return (option.series as Record<string, unknown>[])[0]!;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("CasehubMeter", () => {
  let el: CasehubMeter;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("casehub-meter") as CasehubMeter;
  });

  afterEach(() => {
    if (el.isConnected) el.remove();
  });

  describe("arc-based gauge (no needle)", () => {
    it("renders semicircle with progress arcs, legend off by default", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["CPU", 75]],
      );
      el.props = { lookup: mockLookup("test") };
      const option = getOption(el, ds);
      const series = getSeries(option);

      expect(series.type).toBe("gauge");
      expect(series.startAngle).toBe(180);
      expect(series.endAngle).toBe(0);
      expect(series.pointer).toEqual({ show: false });
      expect(series.progress).toEqual({ show: true, overlap: false });
      expect(series.title).toEqual({ show: false });
      expect((series.detail as Record<string, unknown>).show).toBe(false);
      expect(series.radius).toBe("150%");
    });

    it("renders one data entry per row", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["A", 1], ["B", 2], ["C", 3]],
      );
      el.props = { lookup: mockLookup("test") };
      const option = getOption(el, ds);
      const series = getSeries(option);
      const data = series.data as { value: number; name: string }[];

      expect(data).toHaveLength(3);
      expect(data[0]!.value).toBe(1);
      expect(data[0]!.name).toBe("A");
      expect(data[1]!.value).toBe(2);
      expect(data[1]!.name).toBe("B");
      expect(data[2]!.value).toBe(3);
      expect(data[2]!.name).toBe("C");
    });

    it("uses last column for values when multiple columns", () => {
      const ds = makeDataSet(
        [["label", "LABEL"], ["count", "NUMBER"], ["extra", "NUMBER"]],
        [["Item A", 123, 456]],
      );
      el.props = { lookup: mockLookup("test") };
      const option = getOption(el, ds);
      const series = getSeries(option);
      const data = series.data as { value: number }[];

      expect(data[0]!.value).toBe(456);
    });

    it("generates Series N names for single-column datasets", () => {
      const ds = makeDataSet(
        [["value", "NUMBER"]],
        [[10], [20]],
      );
      el.props = { lookup: mockLookup("test") };
      const option = getOption(el, ds);
      const series = getSeries(option);
      const data = series.data as { name: string }[];

      expect(data[0]!.name).toBe("Series 0");
      expect(data[1]!.name).toBe("Series 1");
    });
  });

  describe("visualMap color pieces", () => {
    it("uses green/orange/red with warning and critical", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["CPU", 85]],
      );
      el.props = {
        lookup: mockLookup("test"),
        end: 100,
        warning: 60,
        critical: 80,
      };
      const option = getOption(el, ds);
      const vm = option.visualMap as Record<string, unknown>;

      expect(vm.type).toBe("piecewise");
      expect(vm.show).toBe(false);
      expect(vm.pieces).toEqual([
        { min: 0, max: 60, color: "green" },
        { min: 60, max: 80, color: "orange" },
        { min: 80, max: 100, color: "red" },
      ]);
    });

    it("defaults warning and critical to max when not set", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["Score", 42]],
      );
      el.props = { lookup: mockLookup("test"), end: 100 };
      const option = getOption(el, ds);
      const vm = option.visualMap as Record<string, unknown>;

      expect(vm.pieces).toEqual([
        { min: 0, max: 100, color: "green" },
        { min: 100, max: 100, color: "orange" },
        { min: 100, max: 100, color: "red" },
      ]);
    });
  });

  describe("max and min", () => {
    it("defaults max to 100", () => {
      const ds = makeDataSet(
        [["value", "NUMBER"]],
        [[50]],
      );
      el.props = { lookup: mockLookup("test") };
      const option = getOption(el, ds);
      const series = getSeries(option);

      expect(series.min).toBe(0);
      expect(series.max).toBe(100);
    });

    it("uses custom end as max", () => {
      const ds = makeDataSet(
        [["value", "NUMBER"]],
        [[150]],
      );
      el.props = { lookup: mockLookup("test"), end: 200 };
      const option = getOption(el, ds);
      const series = getSeries(option);

      expect(series.max).toBe(200);
    });
  });

  describe("legend positioning", () => {
    it("each data point has title and detail with offset positions", () => {
      const ds = makeDataSet(
        [["name", "LABEL"], ["value", "NUMBER"]],
        [["A", 1], ["B", 2]],
      );
      el.props = { lookup: mockLookup("test") };
      const option = getOption(el, ds);
      const series = getSeries(option);
      const data = series.data as { title: { offsetCenter: string[] }; detail: { offsetCenter: string[] } }[];

      expect(data[0]!.title.offsetCenter).toEqual(["-100%", "30%"]);
      expect(data[0]!.detail.offsetCenter).toEqual(["-100%", "45%"]);
      expect(data[1]!.title.offsetCenter).toEqual(["-30%", "30%"]);
      expect(data[1]!.detail.offsetCenter).toEqual(["-30%", "45%"]);
    });
  });

  describe("extra merge", () => {
    it("deep merges extra settings onto option", () => {
      const ds = makeDataSet(
        [["metric", "LABEL"], ["value", "NUMBER"]],
        [["Status", 88]],
      );
      el.props = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "System Status" },
          series: [{ detail: { formatter: "{value}%" } }],
        },
      };
      const option = getOption(el, ds);

      expect(option.title).toEqual({ text: "System Status" });
      const series = getSeries(option);
      expect(series.detail).toMatchObject({ formatter: "{value}%" });
    });
  });
});
