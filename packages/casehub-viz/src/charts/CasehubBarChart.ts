import { use } from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  DatasetComponent,
} from "echarts/components";
import { CasehubChartElement } from "../base/CasehubChartElement.js";
import type { BarChartProps } from "@casehub/ui/dist/model/displayer-types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";

// Register required ECharts components
use([BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, DatasetComponent]);

export class CasehubBarChart extends CasehubChartElement<BarChartProps> {
  override buildOption(
    props: BarChartProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    // Stage 1: Convert dataset to source
    const source = datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    const subtype = props.subtype || "column";
    const isHorizontal = subtype === "bar" || subtype === "bar-stacked";
    const isStacked = subtype === "column-stacked" || subtype === "bar-stacked";

    // Generate series for each data column (skip first column = category)
    const series: Record<string, unknown>[] = [];
    for (let i = 1; i < dataset.columns.length; i++) {
      const seriesEntry: Record<string, unknown> = {
        type: "bar",
        encode: isHorizontal ? { y: 0, x: i } : { x: 0, y: i },
      };
      if (isStacked) {
        seriesEntry.stack = "total";
      }
      series.push(seriesEntry);
    }

    let option: Record<string, unknown> = {
      dataset: { source },
      xAxis: isHorizontal ? { type: "value" } : { type: "category" },
      yAxis: isHorizontal ? { type: "category" } : { type: "value" },
      series,
      tooltip: { trigger: "axis" },
    };

    // Stage 3: Apply ChartSettings
    option = applyChartSettings(option, props);

    // Stage 4: Deep merge extra
    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}

customElements.define("casehub-bar-chart", CasehubBarChart);
