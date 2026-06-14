import { use } from "echarts/core";
import { ScatterChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { CasehubChartElement } from "../base/CasehubChartElement.js";
import type { BubbleChartProps } from "@casehub/ui/dist/model/displayer-types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";
import { cellToRaw } from "../base/cell-extract.js";

// Register required ECharts components
use([ScatterChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent]);

export class CasehubBubbleChart extends CasehubChartElement<BubbleChartProps> {
  override buildOption(
    props: BubbleChartProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    // Stage 1: Convert dataset to source
    const source = datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    const minR = props.minRadius ?? 5;
    const maxR = props.maxRadius ?? 50;

    // Find value range from column 3 (index 2)
    const values = dataset.rows.map(row => {
      const cell = row.cell(dataset.columns[2]!.id);
      return cellToRaw(cell);
    }).filter((v): v is number => typeof v === "number");

    let dataMin: number;
    let dataMax: number;
    let range: number;

    if (values.length === 0) {
      // No valid values — use constant symbol size (midpoint)
      const constantSize = (minR + maxR) / 2;
      dataMin = 0;
      dataMax = 0;
      range = 1;
    } else {
      dataMin = Math.min(...values);
      dataMax = Math.max(...values);
      range = dataMax - dataMin || 1;
    }

    const series: Record<string, unknown> = {
      type: "scatter",
      encode: { x: 0, y: 1 },
      symbolSize: (value: unknown[]) => {
        const v = value[2];
        if (typeof v !== "number") return values.length === 0 ? (minR + maxR) / 2 : minR;
        return minR + ((v - dataMin) / range) * (maxR - minR);
      },
    };

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

customElements.define("casehub-bubble-chart", CasehubBubbleChart);
