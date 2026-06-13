import type { ExtractionPreset } from "../types.js";

// Port of the Java ExternalServiceType.PROMETHEUS expression.
// Operates on the full Prometheus HTTP API response (status + data).
// Returns Shape A: { columns: [...], values: [...] }
//
// Key differences from Java version:
// - Excludes __name__ metric label (it's redundant metadata, not a data column)
// - Timestamps are multiplied by 1000 (Unix seconds -> milliseconds)
//
// JSONata note: the .[expr1, expr2, seq.*] syntax is essential —
// it creates one sub-array per mapping element, unlike (...) blocks which flatten.
const expr = [
  "$.data.(",
  '  $filterName := function($v, $k) { $k != "__name__" };',
  '  $labelKeys := resultType = "scalar" ? [] : $keys(result[0].metric) ~> $filter(function($k) { $k != "__name__" });',
  "  {",
  '    "columns": $append(',
  '      [{"id": "timestamp", "type": "number"}, {"id": "value", "type": "number"}],',
  '      $labelKeys.{"id": $, "type": "label"}',
  "    ),",
  '    "values": (',
  '      resultType = "vector"',
  "        ? result.[value[0] * 1000, value[1], (metric ~> $sift($filterName)).*]",
  '        : resultType = "matrix"',
  "          ? result.($m := metric; values.[$[0] * 1000, $[1], $m.*])",
  "          : [[ result[0] * 1000, result[1] ]]",
  "    )",
  "  }",
  ")",
].join("\n");

export const prometheusPreset: ExtractionPreset = {
  id: "prometheus",
  expression: expr,
};
