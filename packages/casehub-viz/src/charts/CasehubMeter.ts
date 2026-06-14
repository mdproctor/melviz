import { use } from "echarts/core";
import { GaugeChart } from "echarts/charts";
import {
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
} from "echarts/components";
import { CasehubChartElement } from "../base/CasehubChartElement.js";
import type { MeterProps } from "@casehub/ui/dist/model/displayer-types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import { cellToRaw } from "../base/cell-extract.js";
import { applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";

// Register required ECharts components
use([GaugeChart, TooltipComponent, LegendComponent, DatasetComponent]);

function buildColorBands(props: MeterProps): [number, string][] {
  const end = props.end ?? 100;
  const hasWarning = props.warning !== undefined;
  const hasCritical = props.critical !== undefined;

  if (hasWarning && hasCritical) {
    return [
      [props.warning! / end, "#91cc75"],
      [props.critical! / end, "#fac858"],
      [1, "#ee6666"],
    ];
  }

  if (hasWarning) {
    return [
      [props.warning! / end, "#91cc75"],
      [1, "#ee6666"],
    ];
  }

  if (hasCritical) {
    return [
      [props.critical! / end, "#fac858"],
      [1, "#ee6666"],
    ];
  }

  return [[1, "#5470c6"]];
}

export class CasehubMeter extends CasehubChartElement<MeterProps> {
  override buildOption(
    props: MeterProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    // Extract value from first row, first NUMBER column
    let value = 0;
    if (dataset.rows.length > 0) {
      const firstRow = dataset.rows[0];
      if (firstRow) {
        // Find first NUMBER column (skip column 0 if it's LABEL/TEXT)
        for (let i = 0; i < dataset.columns.length; i++) {
          const col = dataset.columns[i];
          if (col && col.type === "NUMBER") {
            const rawValue = cellToRaw(firstRow.cell(col.id));
            if (typeof rawValue === "number") {
              value = rawValue;
            }
            break;
          }
        }
      }
    }

    // Build base option
    let option: Record<string, unknown> = {
      series: [
        {
          type: "gauge",
          data: [{ value }],
          max: props.end ?? 100,
          axisLine: {
            lineStyle: {
              color: buildColorBands(props),
            },
          },
        },
      ],
      tooltip: { trigger: "item" },
    };

    // Apply ChartSettings (skip xAxis/yAxis — gauge has no axes)
    option = applyChartSettings(option, props, { cartesianAxes: false });

    // Deep merge extra
    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}

customElements.define("casehub-meter", CasehubMeter);
