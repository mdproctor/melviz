import type { ExtractionPreset, PresetRegistry } from "../types.js";
import { prometheusPreset } from "./prometheus.js";
import { elasticsearchPreset } from "./elasticsearch.js";
import { graphqlRelayPreset } from "./graphql-relay.js";
import { jsonapiPreset } from "./jsonapi.js";
import { odataPreset } from "./odata.js";
import { kubernetesPreset } from "./kubernetes.js";

const BUILT_INS: readonly ExtractionPreset[] = [
  prometheusPreset,
  elasticsearchPreset,
  graphqlRelayPreset,
  jsonapiPreset,
  odataPreset,
  kubernetesPreset,
];

export function createPresetRegistry(
  custom?: readonly ExtractionPreset[],
): PresetRegistry {
  const map = new Map<string, ExtractionPreset>();
  for (const preset of BUILT_INS) map.set(preset.id, preset);
  if (custom) {
    for (const preset of custom) map.set(preset.id, preset);
  }
  return {
    get: (id: string) => map.get(id),
    has: (id: string) => map.has(id),
  };
}
