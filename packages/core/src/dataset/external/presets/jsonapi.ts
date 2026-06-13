import type { ExtractionPreset } from "../types.js";

export const jsonapiPreset: ExtractionPreset = {
  id: "jsonapi",
  expression: `data.$merge([{"id": id, "type": type}, attributes])`,
};
