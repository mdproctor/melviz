import { use } from "echarts/core";
import { PieChart } from "echarts/charts";
import {
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { CasehubChartElement } from "../base/CasehubChartElement.js";
import type { PieChartProps } from "@casehub/ui/dist/model/displayer-types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";

// Register required ECharts components
use([PieChart, TooltipComponent, LegendComponent, DatasetComponent]);

export class CasehubPieChart extends CasehubChartElement<PieChartProps> {
  override buildOption(
    props: PieChartProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    // Stage 1: Convert dataset to source
    const source = datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    const subtype = props.subtype || "pie";
    const series: Record<string, unknown> = {
      type: "pie",
      encode: { itemName: 0, value: 1 },
    };

    if (subtype === "donut") {
      series.radius = ["40%", "70%"];
    }

    let option: Record<string, unknown> = {
      dataset: { source },
      series: [series],
      tooltip: { trigger: "item" },
    };

    // Stage 3: Apply ChartSettings (but skip xAxis/yAxis — pie has no axes)
    // Create a modified applyChartSettings that doesn't set axes
    option = applyChartSettingsNonCartesian(option, props);

    // Stage 4: Deep merge extra
    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}

/**
 * Apply chart settings but skip xAxis/yAxis (for pie charts).
 */
function applyChartSettingsNonCartesian(
  option: Record<string, unknown>,
  props: { title?: string } & PieChartProps,
): Record<string, unknown> {
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

  // Skip xAxis/yAxis for pie charts

  return option;
}

customElements.define("casehub-pie-chart", CasehubPieChart);
