/**
 * Parses Prometheus text exposition format into structured arrays.
 *
 * Each metric line `metric_name{label="value"} 42.0` becomes
 * `["metric_name", 'label="value"', "42.0"]`.
 *
 * Lines without labels produce an empty string for the labels element.
 * Comment lines (starting with `#`) and empty lines are skipped.
 * `NaN` values are replaced with `"-1"`.
 */
export function parseMetrics(input: string): string[][] {
  const results: string[][] = [];

  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const braceOpen = trimmed.indexOf("{");
    const braceClose = trimmed.indexOf("}");

    let name: string;
    let labels: string;
    let rest: string;

    if (braceOpen !== -1 && braceClose !== -1) {
      name = trimmed.slice(0, braceOpen);
      labels = trimmed.slice(braceOpen + 1, braceClose);
      rest = trimmed.slice(braceClose + 1).trim();
    } else {
      const spaceIdx = trimmed.indexOf(" ");
      name = trimmed.slice(0, spaceIdx);
      labels = "";
      rest = trimmed.slice(spaceIdx + 1).trim();
    }

    const value = rest === "NaN" ? "-1" : rest;
    results.push([name, labels, value]);
  }

  return results;
}
