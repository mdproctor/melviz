import type { ExtractionPreset } from "../types.js";

export const odataPreset: ExtractionPreset = {
  id: "odata",
  expression: `value.$sift(function($v, $k) { $not($contains($k, "@odata.")) })`,
};
