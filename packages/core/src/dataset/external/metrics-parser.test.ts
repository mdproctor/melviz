import { describe, it, expect } from "vitest";
import { parseMetrics } from "./metrics-parser.js";

describe("parseMetrics", () => {
  it("parses simple metric line", () => {
    const result = parseMetrics('up{instance="localhost:9090"} 1');
    expect(result).toEqual([["up", 'instance="localhost:9090"', "1"]]);
  });

  it("parses metric without labels", () => {
    const result = parseMetrics("process_cpu_seconds_total 42.5");
    expect(result).toEqual([["process_cpu_seconds_total", "", "42.5"]]);
  });

  it("skips comment lines", () => {
    const result = parseMetrics(
      '# HELP up Whether the target is up\n# TYPE up gauge\nup{instance="a"} 1',
    );
    expect(result).toHaveLength(1);
    expect(result[0]![0]).toBe("up");
  });

  it("replaces NaN values with -1", () => {
    const result = parseMetrics("some_metric{} NaN");
    expect(result[0]![2]).toBe("-1");
  });

  it("handles multiple metrics", () => {
    const result = parseMetrics(
      'node_cpu{cpu="0"} 100\nnode_cpu{cpu="1"} 200',
    );
    expect(result).toHaveLength(2);
    expect(result[0]![2]).toBe("100");
    expect(result[1]![2]).toBe("200");
  });

  it("skips empty lines", () => {
    const result = parseMetrics("up 1\n\ndown 0\n");
    expect(result).toHaveLength(2);
  });

  it("handles metric with multiple labels", () => {
    const result = parseMetrics('http_requests{method="GET",code="200"} 42');
    expect(result[0]![1]).toBe('method="GET",code="200"');
  });
});
