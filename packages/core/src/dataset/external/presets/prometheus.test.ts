import { describe, it, expect } from "vitest";
import { compile } from "../../../expression/jsonata-bridge.js";
import { prometheusPreset } from "./prometheus.js";

const vectorInput = {
  status: "success",
  data: {
    resultType: "vector",
    result: [
      {
        metric: {
          __name__: "up",
          instance: "localhost:9090",
          job: "prometheus",
        },
        value: [1686700000, "1"],
      },
      {
        metric: {
          __name__: "up",
          instance: "localhost:9100",
          job: "node",
        },
        value: [1686700000, "0"],
      },
    ],
  },
};

const matrixInput = {
  status: "success",
  data: {
    resultType: "matrix",
    result: [
      {
        metric: { instance: "localhost:9090" },
        values: [
          [1686700000, "1.5"],
          [1686700060, "1.7"],
        ],
      },
    ],
  },
};

const scalarInput = {
  status: "success",
  data: {
    resultType: "scalar",
    result: [1686700000, "42"],
  },
};

describe("prometheus preset", () => {
  it("has id 'prometheus'", () => {
    expect(prometheusPreset.id).toBe("prometheus");
  });

  it("transforms vector response into Shape A (columns + values)", async () => {
    const result = (await compile(prometheusPreset.expression).evaluate(vectorInput)) as {
      columns: Array<{ id: string; type: string }>;
      values: unknown[][];
    };
    expect(result.columns).toEqual([
      { id: "timestamp", type: "number" },
      { id: "value", type: "number" },
      { id: "__name__", type: "label" },
      { id: "instance", type: "label" },
      { id: "job", type: "label" },
    ]);
    expect(result.values).toHaveLength(2);
    expect(result.values[0]).toEqual([1686700000000, "1", "up", "localhost:9090", "prometheus"]);
    expect(result.values[1]).toEqual([1686700000000, "0", "up", "localhost:9100", "node"]);
  });

  it("transforms matrix response — timestamps *1000, string values", async () => {
    const result = (await compile(prometheusPreset.expression).evaluate(matrixInput)) as {
      columns: Array<{ id: string; type: string }>;
      values: unknown[][];
    };
    expect(result.columns).toEqual([
      { id: "timestamp", type: "number" },
      { id: "value", type: "number" },
      { id: "instance", type: "label" },
    ]);
    expect(result.values).toHaveLength(2);
    expect(result.values[0]).toEqual([1686700000000, "1.5", "localhost:9090"]);
    expect(result.values[1]).toEqual([1686700060000, "1.7", "localhost:9090"]);
  });

  it("transforms scalar response", async () => {
    const result = (await compile(prometheusPreset.expression).evaluate(scalarInput)) as {
      columns: Array<{ id: string; type: string }>;
      values: unknown[][];
    };
    expect(result.columns).toEqual([
      { id: "timestamp", type: "number" },
      { id: "value", type: "number" },
    ]);
    expect(result.values).toHaveLength(1);
    expect(result.values[0]).toEqual([1686700000000, "42"]);
  });
});
