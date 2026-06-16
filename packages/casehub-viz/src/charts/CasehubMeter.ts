import { use } from "echarts/core";
import { GaugeChart } from "echarts/charts";
import {
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  VisualMapComponent,
} from "echarts/components";
import { CasehubChartElement } from "../base/CasehubChartElement.js";
import type { MeterProps } from "@casehub/ui/dist/model/displayer-types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import { cellToRaw } from "../base/cell-extract.js";
import { applyChartSettings } from "./option-pipeline.js";
import { deepMerge } from "../base/deep-merge.js";

use([
  GaugeChart,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  VisualMapComponent,
]);

const LEGEND_TITLE_DISTANCE = 15;
const LEGEND_ITEM_MIN_POS_Y = 30;
const LEGEND_ITEM_MIN_POS_X = -100;
const LEGEND_ITEM_MAX_POS = 100;
const LEGEND_ITEM_Y_GAP = 50;
const LEGEND_ITEM_X_GAP = 70;

export class CasehubMeter extends CasehubChartElement<MeterProps> {
  override buildOption(
    props: MeterProps,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    const min = 0;
    const max = props.end ?? 100;
    const warning = props.warning ?? max;
    const critical = props.critical ?? max;
    const showLegend = props.legend?.show === true;

    const nColumns = dataset.columns.length;
    if (nColumns < 1) return { series: [] };

    const valuesColIndex = nColumns - 1;
    const valuesCol = dataset.columns[valuesColIndex];
    const namesCol = nColumns > 1 ? dataset.columns[0] : undefined;

    const names: string[] = [];
    const values: number[] = [];

    for (const row of dataset.rows) {
      if (namesCol) {
        const raw = cellToRaw(row.cell(namesCol.id));
        names.push(raw != null ? String(raw) : `Series ${names.length}`);
      } else {
        names.push(`Series ${names.length}`);
      }
      const raw = cellToRaw(row.cell(valuesCol!.id));
      values.push(typeof raw === "number" ? raw : Number(raw) || 0);
    }

    let legendBasePosX = LEGEND_ITEM_MIN_POS_X;
    let legendBasePosY = LEGEND_ITEM_MIN_POS_Y;

    const seriesData = values.map((v, i) => {
      const titleXPos = legendBasePosX + "%";
      const titleYPos = legendBasePosY + "%";
      const detailYPos = legendBasePosY + LEGEND_TITLE_DISTANCE + "%";

      legendBasePosX += LEGEND_ITEM_X_GAP;
      if (legendBasePosX > LEGEND_ITEM_MAX_POS) {
        legendBasePosX = LEGEND_ITEM_MIN_POS_X;
        legendBasePosY += LEGEND_ITEM_Y_GAP;
      }

      return {
        value: v,
        name: names[i],
        title: { offsetCenter: [titleXPos, titleYPos] },
        detail: { offsetCenter: [titleXPos, detailYPos] },
      };
    });

    const radius = showLegend ? "110%" : "150%";
    const centerY = showLegend ? "65%" : "85%";

    let option: Record<string, unknown> = {
      series: [
        {
          type: "gauge",
          data: seriesData,
          min,
          max,
          startAngle: 180,
          endAngle: 0,
          radius,
          center: ["50%", centerY],
          splitNumber: 4,
          pointer: { show: false },
          progress: { show: true, overlap: false },
          axisLine: { lineStyle: { width: 40 } },
          axisTick: { show: true },
          axisLabel: { fontSize: 12, distance: 50 },
          title: { show: showLegend },
          detail: {
            show: showLegend,
            valueAnimation: true,
            width: 30,
            height: 12,
            fontSize: 11,
            color: "#fff",
            backgroundColor: "auto",
            borderRadius: 3,
          },
        },
      ],
      legend: { show: false },
      visualMap: {
        show: false,
        type: "piecewise",
        min,
        max,
        pieces: [
          { min: 0, max: warning, color: "green" },
          { min: warning, max: critical, color: "orange" },
          { min: critical, max: max, color: "red" },
        ],
      },
      tooltip: { trigger: "item" },
    };

    option = applyChartSettings(option, props, { cartesianAxes: false });

    if (props.extra) {
      option = deepMerge(option, props.extra);
    }

    return option;
  }
}

customElements.define("casehub-meter", CasehubMeter);
