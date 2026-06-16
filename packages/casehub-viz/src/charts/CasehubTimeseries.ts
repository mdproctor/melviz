import { use } from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  DatasetComponent,
} from "echarts/components";
import { CasehubChartElement } from "../base/CasehubChartElement.js";
import type { TimeseriesProps } from "@casehub/ui/dist/model/displayer-types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import { datasetToSource, applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";

// Register required ECharts components
use([LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, DatasetComponent]);

export class CasehubTimeseries extends CasehubChartElement<TimeseriesProps> {
  override buildOption(
    props: TimeseriesProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    // Stage 1: Convert dataset to source
    const source = datasetToSource(dataset, props.columns);

    // Stage 2: Build base option
    // Determine time axis column: if column 0 is LABEL, use column 1 as time axis
    const col0Type = dataset.columns[0]?.type;
    const timeCol = col0Type === "LABEL" && dataset.columns.length > 2 ? 1 : 0;
    const series: Record<string, unknown>[] = [];
    for (let i = timeCol + 1; i < dataset.columns.length; i++) {
      series.push({
        type: "line",
        encode: { x: timeCol, y: i },
      });
    }

    let option: Record<string, unknown> = {
      dataset: { source },
      xAxis: { type: "time" },
      yAxis: { type: "value" },
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

customElements.define("casehub-timeseries", CasehubTimeseries);
