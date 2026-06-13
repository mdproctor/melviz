import type { ExtractionPreset } from "../types.js";

// Flattens one level of nested objects into dot-separated keys.
// Scalar fields are kept as-is; object-valued fields become "parent.child" entries.
const flattenExpr = [
  "edges.node.(",
  "  $node := $;",
  "  $scalars := $node ~> $sift(function($v) { $type($v) != 'object' });",
  "  $nested := $node ~> $sift(function($v) { $type($v) = 'object' });",
  "  $dotted := $reduce($keys($nested), function($acc, $k) {",
  "    $merge([$acc, $each($lookup($nested, $k), function($v, $ck) {",
  "      { $k & '.' & $ck: $v }",
  "    })])",
  "  }, {});",
  "  $merge([$scalars, $dotted])",
  ")",
].join("\n");

export const graphqlRelayPreset: ExtractionPreset = {
  id: "graphql-relay",
  expression: flattenExpr,
};
