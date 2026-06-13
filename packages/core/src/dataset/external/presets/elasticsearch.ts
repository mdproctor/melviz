import type { ExtractionPreset } from "../types.js";

export const elasticsearchPreset: ExtractionPreset = {
  id: "elasticsearch",
  expression: `hits.hits.$merge([{"_index": _index, "_id": _id, "_score": _score}, _source])`,
};
