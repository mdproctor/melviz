import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSet, TypedDataSet, ColumnType, ColumnId } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { PieChartProps } from "@casehub/ui/dist/model/displayer-types.js";
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
  PieChart: { type: "mock-pie-chart" },
}));

vi.mock("echarts/components", () => ({
  TooltipComponent: { type: "mock-tooltip" },
  LegendComponent: { type: "mock-legend" },
  DatasetComponent: { type: "mock-dataset" },
  TitleComponent: { type: "mock-title" },
}));

// Import after mocks
import { CasehubPieChart } from "./CasehubPieChart.js";

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

describe("CasehubPieChart", () => {
  let el: CasehubPieChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("casehub-pie-chart") as CasehubPieChart;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("buildOption", () => {
    it("default subtype (pie) builds pie chart", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 30], ["B", 50], ["C", 20]],
      );
      const props: PieChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.dataset).toEqual({
        source: [
          ["category", "value"],
          ["A", 30],
          ["B", 50],
          ["C", 20],
        ],
      });
      expect(option.series).toEqual([
        { type: "pie", encode: { itemName: 0, value: 1 } },
      ]);
      expect(option.tooltip).toEqual({ trigger: "item" });
      expect(option.xAxis).toBeUndefined();
      expect(option.yAxis).toBeUndefined();
    });

    it("subtype=pie builds pie chart", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: PieChartProps = { lookup: mockLookup("test"), subtype: "pie" };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "pie", encode: { itemName: 0, value: 1 } },
      ]);
    });

    it("subtype=donut builds donut chart", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10], ["B", 20]],
      );
      const props: PieChartProps = { lookup: mockLookup("test"), subtype: "donut" };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.series).toEqual([
        { type: "pie", encode: { itemName: 0, value: 1 }, radius: ["40%", "70%"] },
      ]);
    });

    it("applies legend settings", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: PieChartProps = {
        lookup: mockLookup("test"),
        legend: { show: true, position: "bottom" },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.legend).toMatchObject({ show: true, bottom: 0 });
    });

    it("tooltip trigger is item not axis", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: PieChartProps = { lookup: mockLookup("test") };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.tooltip).toEqual({ trigger: "item" });
    });

    it("deep merges extra settings onto option", () => {
      const ds = makeDataSet(
        [["category", "LABEL"], ["value", "NUMBER"]],
        [["A", 10]],
      );
      const props: PieChartProps = {
        lookup: mockLookup("test"),
        extra: {
          title: { text: "Distribution" },
          tooltip: { formatter: "{b}: {c} ({d}%)" },
        },
      };

      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      const option = mockChart.setOption.mock.calls[0]![0] as Record<string, unknown>;

      expect(option.title).toEqual({ text: "Distribution" });
      expect(option.tooltip).toMatchObject({ trigger: "item", formatter: "{b}: {c} ({d}%)" });
    });
  });
});
