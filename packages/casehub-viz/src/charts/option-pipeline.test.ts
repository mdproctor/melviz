import { describe, it, expect } from "vitest";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import type { TypedDataSet, Column, ColumnSettings } from "@casehub/data/dist/dataset/types.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";
import { createTypedRow } from "@casehub/data/dist/dataset/conversion.js";
import type { ChartSettings } from "@casehub/ui/dist/model/displayer-types.js";

function mockColumn(id: string, name: string, type: ColumnType): Column {
  return { id: id as any, name, type };
}

function mockColumnSettings(id: string, name?: string): ColumnSettings {
  return { id: id as any, name };
}

describe("datasetToSource", () => {
  it("converts basic 2-column, 2-row dataset to array-of-arrays", () => {
    const columns = [
      mockColumn("category", "Category", ColumnType.LABEL),
      mockColumn("value", "Value", ColumnType.NUMBER),
    ];
    const rows = [
      createTypedRow(
        [
          { type: ColumnType.LABEL, value: "A" },
          { type: ColumnType.NUMBER, value: 10 },
        ],
        columns,
      ),
      createTypedRow(
        [
          { type: ColumnType.LABEL, value: "B" },
          { type: ColumnType.NUMBER, value: 20 },
        ],
        columns,
      ),
    ];
    const dataset: TypedDataSet = { columns, rows };

    const result = datasetToSource(dataset);

    expect(result).toEqual([
      ["Category", "Value"],
      ["A", 10],
      ["B", 20],
    ]);
  });

  it("resolves display names from propsColumns", () => {
    const columns = [
      mockColumn("category", "Category", ColumnType.LABEL),
      mockColumn("value", "Value", ColumnType.NUMBER),
    ];
    const rows = [
      createTypedRow(
        [
          { type: ColumnType.LABEL, value: "A" },
          { type: ColumnType.NUMBER, value: 10 },
        ],
        columns,
      ),
    ];
    const dataset: TypedDataSet = { columns, rows };
    const propsColumns = [mockColumnSettings("value", "Custom Value")];

    const result = datasetToSource(dataset, propsColumns);

    expect(result[0]).toEqual(["Category", "Custom Value"]);
  });

  it("converts null cell to null in output", () => {
    const columns = [
      mockColumn("category", "Category", ColumnType.LABEL),
      mockColumn("value", "Value", ColumnType.NUMBER),
    ];
    const rows = [
      createTypedRow(
        [
          { type: ColumnType.LABEL, value: "A" },
          { type: "NULL" },
        ],
        columns,
      ),
    ];
    const dataset: TypedDataSet = { columns, rows };

    const result = datasetToSource(dataset);

    expect(result[1]).toEqual(["A", null]);
  });

  it("preserves number values as numbers", () => {
    const columns = [mockColumn("value", "Value", ColumnType.NUMBER)];
    const rows = [
      createTypedRow([{ type: ColumnType.NUMBER, value: 42.5 }], columns),
    ];
    const dataset: TypedDataSet = { columns, rows };

    const result = datasetToSource(dataset);

    expect(result[1]![0]).toBe(42.5);
    expect(typeof result[1]![0]).toBe("number");
  });

  it("preserves Date values as Date objects", () => {
    const date = new Date("2024-01-15");
    const columns = [mockColumn("date", "Date", ColumnType.DATE)];
    const rows = [createTypedRow([{ type: ColumnType.DATE, value: date }], columns)];
    const dataset: TypedDataSet = { columns, rows };

    const result = datasetToSource(dataset);

    expect(result[1]![0]).toBe(date);
    expect(result[1]![0]).toBeInstanceOf(Date);
  });
});

describe("applyChartSettings", () => {
  it("applies title", () => {
    const option = {};
    const props = { title: "Sales Chart" };

    const result = applyChartSettings(option, props);

    expect(result.title).toEqual({ text: "Sales Chart" });
  });

  it("applies legend show", () => {
    const option = {};
    const props = { legend: { show: false } };

    const result = applyChartSettings(option, props);

    expect(result.legend).toEqual({ show: false });
  });

  it("applies legend position top", () => {
    const option = {};
    const props = { legend: { position: "top" as const } };

    const result = applyChartSettings(option, props);

    expect(result.legend).toEqual({ top: 0 });
  });

  it("applies legend position bottom", () => {
    const option = {};
    const props = { legend: { position: "bottom" as const } };

    const result = applyChartSettings(option, props);

    expect(result.legend).toEqual({ bottom: 0 });
  });

  it("applies legend position left with vertical orient", () => {
    const option = {};
    const props = { legend: { position: "left" as const } };

    const result = applyChartSettings(option, props);

    expect(result.legend).toEqual({ left: 0, orient: "vertical" });
  });

  it("applies legend position right with vertical orient", () => {
    const option = {};
    const props = { legend: { position: "right" as const } };

    const result = applyChartSettings(option, props);

    expect(result.legend).toEqual({ right: 0, orient: "vertical" });
  });

  it("applies xAxis title", () => {
    const option = {};
    const props = { xAxis: { title: "Month" } };

    const result = applyChartSettings(option, props);

    expect(result.xAxis).toEqual({ name: "Month" });
  });

  it("applies xAxis showLabels", () => {
    const option = {};
    const props = { xAxis: { showLabels: false } };

    const result = applyChartSettings(option, props);

    expect(result.xAxis).toEqual({ axisLabel: { show: false } });
  });

  it("applies yAxis title", () => {
    const option = {};
    const props = { yAxis: { title: "Revenue" } };

    const result = applyChartSettings(option, props);

    expect(result.yAxis).toEqual({ name: "Revenue" });
  });

  it("applies yAxis showLabels", () => {
    const option = {};
    const props = { yAxis: { showLabels: false } };

    const result = applyChartSettings(option, props);

    expect(result.yAxis).toEqual({ axisLabel: { show: false } });
  });

  it("applies margin top", () => {
    const option = {};
    const props = { margin: { top: 20 } };

    const result = applyChartSettings(option, props);

    expect(result.grid).toEqual({ top: 20 });
  });

  it("applies margin right", () => {
    const option = {};
    const props = { margin: { right: 30 } };

    const result = applyChartSettings(option, props);

    expect(result.grid).toEqual({ right: 30 });
  });

  it("applies margin bottom", () => {
    const option = {};
    const props = { margin: { bottom: 40 } };

    const result = applyChartSettings(option, props);

    expect(result.grid).toEqual({ bottom: 40 });
  });

  it("applies margin left", () => {
    const option = {};
    const props = { margin: { left: 50 } };

    const result = applyChartSettings(option, props);

    expect(result.grid).toEqual({ left: 50 });
  });

  it("applies all margins", () => {
    const option = {};
    const props = { margin: { top: 10, right: 20, bottom: 30, left: 40 } };

    const result = applyChartSettings(option, props);

    expect(result.grid).toEqual({ top: 10, right: 20, bottom: 30, left: 40 });
  });

  it("applies zoom enabled", () => {
    const option = {};
    const props = { zoom: true };

    const result = applyChartSettings(option, props);

    expect(result.dataZoom).toEqual([{ type: "inside" }, { type: "slider" }]);
  });

  it("does not modify option when no settings provided", () => {
    const option = {};
    const props = {};

    const result = applyChartSettings(option, props);

    expect(result).toEqual({});
  });

  it("applies multiple settings combined", () => {
    const option = {};
    const props = {
      title: "Combined Chart",
      legend: { show: true, position: "top" as const },
      xAxis: { title: "X", showLabels: true },
      yAxis: { title: "Y" },
      margin: { top: 10, left: 20 },
      zoom: true,
    };

    const result = applyChartSettings(option, props);

    expect(result).toEqual({
      title: { text: "Combined Chart" },
      legend: { show: true, top: 0 },
      xAxis: { name: "X", axisLabel: { show: true } },
      yAxis: { name: "Y" },
      grid: { top: 10, left: 20 },
      dataZoom: [{ type: "inside" }, { type: "slider" }],
    });
  });

  it("preserves existing option properties while merging", () => {
    const option = {
      xAxis: { type: "category" },
      yAxis: { type: "value" },
      grid: { containLabel: true },
    };
    const props = {
      xAxis: { title: "Category" },
      margin: { top: 20 },
    };

    const result = applyChartSettings(option, props);

    expect(result.xAxis).toEqual({ type: "category", name: "Category" });
    expect(result.grid).toEqual({ containLabel: true, top: 20 });
  });

  it("skips xAxis and yAxis when cartesianAxes is false", () => {
    const option = {};
    const props = {
      title: "Pie Chart",
      xAxis: { title: "Should be ignored" },
      yAxis: { title: "Should be ignored" },
      legend: { show: true },
    };

    const result = applyChartSettings(option, props, { cartesianAxes: false });

    expect(result.xAxis).toBeUndefined();
    expect(result.yAxis).toBeUndefined();
    expect(result.title).toEqual({ text: "Pie Chart" });
    expect(result.legend).toEqual({ show: true });
  });

  it("applies margin and zoom even when cartesianAxes is false", () => {
    const option = {};
    const props = {
      margin: { top: 10, left: 20 },
      zoom: true,
    };

    const result = applyChartSettings(option, props, { cartesianAxes: false });

    expect(result.grid).toEqual({ top: 10, left: 20 });
    expect(result.dataZoom).toEqual([{ type: "inside" }, { type: "slider" }]);
  });

  it("applies xAxis and yAxis when cartesianAxes is explicitly true", () => {
    const option = {};
    const props = {
      xAxis: { title: "X" },
      yAxis: { title: "Y" },
    };

    const result = applyChartSettings(option, props, { cartesianAxes: true });

    expect(result.xAxis).toEqual({ name: "X" });
    expect(result.yAxis).toEqual({ name: "Y" });
  });

  it("applies xAxis and yAxis when cartesianAxes is omitted (default true)", () => {
    const option = {};
    const props = {
      xAxis: { title: "X" },
      yAxis: { title: "Y" },
    };

    const result = applyChartSettings(option, props);

    expect(result.xAxis).toEqual({ name: "X" });
    expect(result.yAxis).toEqual({ name: "Y" });
  });
});
