import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ECharts } from "echarts/core";
import type { TypedDataSet, Column, ColumnId, ColumnType } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type {
  DataComponentCommon,
  ChartSettings,
} from "@casehub/ui/dist/model/displayer-types.js";

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

// Import after mock is set up
const { init: echartsInit, use: echartsUse } = await import("echarts/core");

import { CasehubChartElement } from "./CasehubChartElement.js";

// Capture use() call count immediately after module load, before any test's
// beforeEach can call clearAllMocks.
const useCallCountAtLoad = (echartsUse as ReturnType<typeof vi.fn>).mock.calls.length;

// ── Test types ────────────────────────────────────────────────────────

interface TestChartProps extends DataComponentCommon, ChartSettings {
  readonly color?: string;
}

// ── Concrete test subclass ────────────────────────────────────────────

class TestChart extends CasehubChartElement<TestChartProps> {
  buildOptionCalls: Array<{ props: TestChartProps; dataset: TypedDataSet }> = [];

  override buildOption(
    props: TestChartProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    this.buildOptionCalls.push({ props, dataset });
    return { series: [{ type: "bar", data: [1, 2, 3] }] };
  }
}

customElements.define("test-chart-element", TestChart);

// ── Helpers ───────────────────────────────────────────────────────────

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function mockDataSet(columnId = "col1" as ColumnId): TypedDataSet {
  return {
    columns: [
      { id: columnId, name: "Column 1", type: "LABEL" as ColumnType },
    ] as readonly Column[],
    rows: [],
  } as unknown as TypedDataSet;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("CasehubChartElement", () => {
  let el: TestChart;

  beforeEach(() => {
    vi.clearAllMocks();
    el = document.createElement("test-chart-element") as TestChart;
  });

  afterEach(() => {
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("ECharts init lifecycle", () => {
    it("first render calls echarts.init() then chart.setOption()", () => {
      const props: TestChartProps = { lookup: mockLookup("sales") };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = mockDataSet();

      expect(echartsInit).toHaveBeenCalledTimes(1);
      expect(echartsInit).toHaveBeenCalledWith(
        el.shadowRoot!.querySelector("div"),
        "",
        undefined,
      );
      expect(mockChart.setOption).toHaveBeenCalledTimes(1);
      expect(mockChart.setOption).toHaveBeenCalledWith(
        { series: [{ type: "bar", data: [1, 2, 3] }] },
        true,
      );
    });

    it("second render reuses existing chart (no re-init)", () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();

      expect(echartsInit).toHaveBeenCalledTimes(1);

      // Trigger second render by updating dataset
      el.dataSet = mockDataSet();

      expect(echartsInit).toHaveBeenCalledTimes(1); // still 1
      expect(mockChart.setOption).toHaveBeenCalledTimes(2);
    });
  });

  describe("theme changes", () => {
    it("theme change disposes and re-inits chart with new theme", () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();

      expect(echartsInit).toHaveBeenCalledTimes(1);

      el.theme = "dark";

      expect(mockChart.dispose).toHaveBeenCalledTimes(1);
      expect(echartsInit).toHaveBeenCalledTimes(2);
      expect(echartsInit).toHaveBeenLastCalledWith(
        el.shadowRoot!.querySelector("div"),
        "dark",
        undefined,
      );
      // setOption called again with new chart
      expect(mockChart.setOption).toHaveBeenCalledTimes(2);
    });
  });

  describe("disconnectedCallback", () => {
    it("disposes chart on disconnect", () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();

      expect(echartsInit).toHaveBeenCalledTimes(1);

      el.remove();

      expect(mockChart.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe("onResize", () => {
    it("calls chart.resize()", () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();

      el.onResize();

      expect(mockChart.resize).toHaveBeenCalledTimes(1);
    });

    it("does not throw when no chart exists", () => {
      // No chart created yet — onResize should be safe
      expect(() => el.onResize()).not.toThrow();
    });
  });

  describe("click-to-filter", () => {
    it("click with filter enabled emits casehub-filter event", () => {
      const columnId = "region" as ColumnId;
      const props: TestChartProps = {
        lookup: mockLookup("sales"),
        filter: { enabled: true, group: "g1" },
      };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = mockDataSet(columnId);

      // Capture the 'click' handler registered via chart.on
      expect(mockChart.on).toHaveBeenCalledWith("click", expect.any(Function));
      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number }) => void;

      // Listen for the filter event
      const filterEvents: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        filterEvents.push(e as CustomEvent),
      );

      // Simulate ECharts click
      clickHandler({ dataIndex: 2 });

      expect(filterEvents).toHaveLength(1);
      expect(filterEvents[0]!.detail).toEqual({
        columnId,
        rowIndex: 2,
        reset: false,
        group: "g1",
      });
      expect(filterEvents[0]!.bubbles).toBe(true);
      expect(filterEvents[0]!.composed).toBe(true);
    });

    it("click with filter disabled emits no event", () => {
      const props: TestChartProps = {
        lookup: mockLookup("sales"),
        filter: { enabled: false },
      };
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = mockDataSet();

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number }) => void;

      const filterEvents: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        filterEvents.push(e as CustomEvent),
      );

      clickHandler({ dataIndex: 0 });

      expect(filterEvents).toHaveLength(0);
    });

    it("click with no filter setting emits no event", () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number }) => void;

      const filterEvents: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        filterEvents.push(e as CustomEvent),
      );

      clickHandler({ dataIndex: 0 });

      expect(filterEvents).toHaveLength(0);
    });

    it("click handler uses current dataSet, not stale closure", () => {
      const col1 = "alpha" as ColumnId;
      const col2 = "beta" as ColumnId;
      const props: TestChartProps = {
        lookup: mockLookup("sales"),
        filter: { enabled: true },
      };
      el.props = props;
      document.body.appendChild(el);

      // First dataset
      el.dataSet = mockDataSet(col1);

      const clickHandler = mockChart.on.mock.calls.find(
        (c: unknown[]) => c[0] === "click",
      )![1] as (params: { dataIndex: number }) => void;

      // Replace dataset
      el.dataSet = mockDataSet(col2);

      const filterEvents: CustomEvent[] = [];
      el.addEventListener("casehub-filter", (e) =>
        filterEvents.push(e as CustomEvent),
      );

      clickHandler({ dataIndex: 0 });

      // Should use col2, not col1
      expect(filterEvents[0]!.detail.columnId).toBe(col2);
    });
  });

  describe("ECharts use()", () => {
    it("use() was called at module load to register renderers", () => {
      // use() is called at module evaluation time (top-level side effect).
      // beforeEach clears mocks, so we captured the call count at import time.
      expect(useCallCountAtLoad).toBeGreaterThanOrEqual(1);
    });
  });

  describe("buildOption", () => {
    it("passes props and dataset to buildOption", () => {
      const props: TestChartProps = {
        lookup: mockLookup("sales"),
        color: "red",
      };
      const ds = mockDataSet();
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      expect(el.buildOptionCalls).toHaveLength(1);
      expect(el.buildOptionCalls[0]!.props).toBe(props);
      expect(el.buildOptionCalls[0]!.dataset).toBe(ds);
    });
  });
});
