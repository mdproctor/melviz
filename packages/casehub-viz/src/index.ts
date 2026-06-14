// @casehub/viz — Web Component visualization wrappers
// Components are registered via customElements.define() at import time.

// Base
export { CasehubElement } from "./base/CasehubElement.js";
export type { CasehubDataRequestDetail } from "./base/CasehubElement.js";
export { CasehubChartElement } from "./base/CasehubChartElement.js";
export type { CasehubFilterDetail } from "./base/CasehubChartElement.js";
export type { VizComponentProps } from "./base/types.js";
export { cellToRaw, resolveColumnName } from "./base/cell-extract.js";
export { deepMerge } from "./base/deep-merge.js";

// Charts
export { CasehubBarChart } from "./charts/CasehubBarChart.js";
export { CasehubLineChart } from "./charts/CasehubLineChart.js";
export { CasehubAreaChart } from "./charts/CasehubAreaChart.js";
export { CasehubPieChart } from "./charts/CasehubPieChart.js";
export { CasehubScatterChart } from "./charts/CasehubScatterChart.js";
export { CasehubBubbleChart } from "./charts/CasehubBubbleChart.js";
export { CasehubTimeseries } from "./charts/CasehubTimeseries.js";
export { CasehubMeter } from "./charts/CasehubMeter.js";
export { CasehubMap } from "./charts/CasehubMap.js";

// HTML components
export { CasehubTable } from "./components/CasehubTable.js";
export { CasehubMetric } from "./components/CasehubMetric.js";
export { CasehubSelector } from "./components/CasehubSelector.js";
export { CasehubIframePlugin } from "./components/CasehubIframePlugin.js";

// Shared pipeline
export { datasetToSource, applyChartSettings } from "./charts/option-pipeline.js";
