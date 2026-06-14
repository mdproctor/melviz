import { use } from "echarts/core";
import { ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { CasehubChartElement } from "../base/CasehubChartElement.js";
import type { ScatterChartProps } from "@casehub/ui/dist/model/displayer-types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";
import { cellToRaw } from "../base/cell-extract.js";

// Register required ECharts components
use([ScatterChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent]);

export class CasehubScatterChart extends CasehubChartElement<ScatterChartProps> {
  override buildOption(
    props: ScatterChartProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    // Stage 1: Convert dataset to source
    const source = datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    const series: Record<string, unknown> = {
      type: "scatter",
      encode: { x: 0, y: 1 },
    };

    // If dataset has ≥3 columns, add symbolSize callback using column 3
    if (dataset.columns.length >= 3) {
      series.symbolSize = (value: unknown[]) => {
        const v = value[2];
        return typeof v === "number" ? Math.sqrt(v) * 3 : 10;
      };
    }

    let option: Record<string, unknown> = {
      dataset: { source },
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      series: [series],
      tooltip: { trigger: "item" },
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

customElements.define("casehub-scatter-chart", CasehubScatterChart);
