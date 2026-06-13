import type { ExtractionPreset } from "../types.js";

const expr = [
  "items.(",
  "  $pod := metadata.name;",
  "  $ns := metadata.namespace;",
  "  $ts := timestamp;",
  "  containers.{",
  '    "pod": $pod,',
  '    "namespace": $ns,',
  '    "container": name,',
  '    "cpu": usage.cpu,',
  '    "memory": usage.memory,',
  '    "timestamp": $ts',
  "  }",
  ")",
].join("\n");

export const kubernetesPreset: ExtractionPreset = {
  id: "kubernetes-pods",
  expression: expr,
};
