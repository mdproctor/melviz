/**
 * Recursively walks a data structure and replaces `${name}` patterns with values
 * from a properties map.
 *
 * IMPORTANT: Skips metric template fields (`html.html` and `html.javascript`)
 * which use `${value}`, `${title}`, `${this}` as render-time variables.
 *
 * @param data - The data structure to process
 * @param properties - Map of property names to their values
 * @returns A new data structure with substitutions applied
 */
export function substituteProperties(
  data: unknown,
  properties: Readonly<Record<string, string>>,
): unknown {
  return walk(data, properties, []);
}

function walk(
  node: unknown,
  properties: Readonly<Record<string, string>>,
  path: readonly string[],
): unknown {
  if (typeof node === "string") {
    if (isMetricTemplatePath(path)) return node;
    return node.replace(/\$\{(\w+)\}/g, (match, key) =>
      key in properties ? properties[key]! : match,
    );
  }
  if (Array.isArray(node)) {
    return node.map((item, i) => walk(item, properties, [...path, String(i)]));
  }
  if (node !== null && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = walk(value, properties, [...path, key]);
    }
    return result;
  }
  return node;
}

function isMetricTemplatePath(path: readonly string[]): boolean {
  const len = path.length;
  if (len < 2) return false;
  const parent = path[len - 2];
  const field = path[len - 1];
  return parent === "html" && (field === "html" || field === "javascript");
}
