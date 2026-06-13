import { describe, it, expect } from "vitest";
import { compile } from "../../../expression/jsonata-bridge.js";
import { kubernetesPreset } from "./kubernetes.js";

const input = {
  kind: "PodMetricsList",
  apiVersion: "metrics.k8s.io/v1beta1",
  items: [
    {
      metadata: {
        name: "nginx-7f4b6d8c9-abc",
        namespace: "default",
        creationTimestamp: "2024-06-13T10:00:00Z",
      },
      timestamp: "2024-06-13T10:05:00Z",
      window: "30s",
      containers: [
        {
          name: "nginx",
          usage: { cpu: "50m", memory: "64Mi" },
        },
      ],
    },
    {
      metadata: {
        name: "api-server-5b7d9f-xyz",
        namespace: "production",
        creationTimestamp: "2024-06-13T09:00:00Z",
      },
      timestamp: "2024-06-13T10:05:00Z",
      window: "30s",
      containers: [
        {
          name: "api",
          usage: { cpu: "200m", memory: "256Mi" },
        },
        {
          name: "sidecar",
          usage: { cpu: "10m", memory: "32Mi" },
        },
      ],
    },
  ],
};

describe("kubernetes-pods preset", () => {
  it("has id 'kubernetes-pods'", () => {
    expect(kubernetesPreset.id).toBe("kubernetes-pods");
  });

  it("produces one row per container with pod/namespace/timestamp", async () => {
    const result = await compile(kubernetesPreset.expression).evaluate(input);
    const rows = Array.isArray(result) ? result : [result];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      pod: "nginx-7f4b6d8c9-abc",
      namespace: "default",
      container: "nginx",
      cpu: "50m",
      memory: "64Mi",
      timestamp: "2024-06-13T10:05:00Z",
    });
    expect(rows[1]).toEqual({
      pod: "api-server-5b7d9f-xyz",
      namespace: "production",
      container: "api",
      cpu: "200m",
      memory: "256Mi",
      timestamp: "2024-06-13T10:05:00Z",
    });
    expect(rows[2]).toEqual({
      pod: "api-server-5b7d9f-xyz",
      namespace: "production",
      container: "sidecar",
      cpu: "10m",
      memory: "32Mi",
      timestamp: "2024-06-13T10:05:00Z",
    });
  });

  it("handles empty items", async () => {
    const empty = { kind: "PodMetricsList", items: [] };
    const result = await compile(kubernetesPreset.expression).evaluate(empty);
    expect(result === undefined || (Array.isArray(result) && result.length === 0)).toBe(true);
  });
});
