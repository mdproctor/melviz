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

    // Stage 3: Apply ChartSettings (skip xAxis/yAxis — pie has no axes)
    option = applyChartSettings(option, props, { cartesianAxes: false });

    // Stage 4: Deep merge extra
    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}

customElements.define("casehub-pie-chart", CasehubPieChart);
