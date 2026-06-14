import type { TypedDataSet, ColumnSettings } from "@casehub/data/dist/dataset/types.js";
import type { ChartSettings } from "@casehub/ui/dist/model/displayer-types.js";
import { cellToRaw, resolveColumnName } from "../base/cell-extract.js";

/**
 * Stage 1: Convert TypedDataSet to ECharts dataset.source format.
 *
 * Returns an array-of-arrays where:
 * - First row contains display names (resolved via resolveColumnName)
 * - Subsequent rows contain raw values (via cellToRaw)
 */
export function datasetToSource(
  dataset: TypedDataSet,
  propsColumns?: readonly ColumnSettings[],
): (string | number | Date | null)[][] {
  return [
    dataset.columns.map((c) => resolveColumnName(c, propsColumns)),
    ...dataset.rows.map((row) =>
      dataset.columns.map((c) => cellToRaw(row.cell(c.id))),
    ),
  ];
}

/**
 * Options for applyChartSettings behavior.
 */
export interface ChartSettingsOptions {
  /**
   * Whether to apply xAxis/yAxis settings (for Cartesian charts).
   * Default: true
   */
  readonly cartesianAxes?: boolean;
}

/**
 * Stage 3: Apply typed ChartSettings fields to ECharts option.
 *
 * Mutates and returns the option object. Only sets fields that are defined.
 *
 * @param settingsOptions - Optional configuration to control which settings are applied
 */
export function applyChartSettings(
  option: Record<string, unknown>,
  props: { title?: string } & ChartSettings,
  settingsOptions?: ChartSettingsOptions,
): Record<string, unknown> {
  const withAxes = settingsOptions?.cartesianAxes ?? true;
  // Title
  if (props.title !== undefined) {
    option.title = { text: props.title };
  }

  // Legend
  if (props.legend !== undefined) {
    const legend: Record<string, unknown> = { ...((option.legend as Record<string, unknown>) || {}) };

    if (props.legend.show !== undefined) {
      legend.show = props.legend.show;
    }

    if (props.legend.position !== undefined) {
      switch (props.legend.position) {
        case "top":
          legend.top = 0;
          break;
        case "bottom":
          legend.bottom = 0;
          break;
        case "left":
          legend.left = 0;
          legend.orient = "vertical";
          break;
        case "right":
          legend.right = 0;
          legend.orient = "vertical";
          break;
      }
    }

    option.legend = legend;
  }

  // X-Axis (only for Cartesian charts)
  if (withAxes && props.xAxis !== undefined) {
    const xAxis: Record<string, unknown> = { ...((option.xAxis as Record<string, unknown>) || {}) };

    if (props.xAxis.title !== undefined) {
      xAxis.name = props.xAxis.title;
    }

    if (props.xAxis.showLabels !== undefined) {
      xAxis.axisLabel = { show: props.xAxis.showLabels };
    }

    option.xAxis = xAxis;
  }

  // Y-Axis (only for Cartesian charts)
  if (withAxes && props.yAxis !== undefined) {
    const yAxis: Record<string, unknown> = { ...((option.yAxis as Record<string, unknown>) || {}) };

    if (props.yAxis.title !== undefined) {
      yAxis.name = props.yAxis.title;
    }

    if (props.yAxis.showLabels !== undefined) {
      yAxis.axisLabel = { show: props.yAxis.showLabels };
    }

    option.yAxis = yAxis;
  }

  // Margins (via grid)
  if (props.margin !== undefined) {
    const grid: Record<string, unknown> = { ...((option.grid as Record<string, unknown>) || {}) };

    if (props.margin.top !== undefined) {
      grid.top = props.margin.top;
    }

    if (props.margin.right !== undefined) {
      grid.right = props.margin.right;
    }

    if (props.margin.bottom !== undefined) {
      grid.bottom = props.margin.bottom;
    }

    if (props.margin.left !== undefined) {
      grid.left = props.margin.left;
    }

    option.grid = grid;
  }

  // Zoom
  if (props.zoom === true) {
    option.dataZoom = [{ type: "inside" }, { type: "slider" }];
  }

  return option;
}
