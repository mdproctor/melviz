import { describe, it, expect } from "vitest";
import { createPresetRegistry } from "./registry.js";
import type { ExtractionPreset } from "../types.js";

describe("PresetRegistry", () => {
  it("loads all 6 built-in presets", () => {
    const registry = createPresetRegistry();
    expect(registry.has("prometheus")).toBe(true);
    expect(registry.has("elasticsearch")).toBe(true);
    expect(registry.has("graphql-relay")).toBe(true);
    expect(registry.has("jsonapi")).toBe(true);
    expect(registry.has("odata")).toBe(true);
    expect(registry.has("kubernetes-pods")).toBe(true);
  });

  it("returns preset by id", () => {
    const registry = createPresetRegistry();
    const preset = registry.get("prometheus");
    expect(preset).toBeDefined();
    expect(preset!.id).toBe("prometheus");
    expect(preset!.expression).toBeTruthy();
  });

  it("returns undefined for unknown id", () => {
    const registry = createPresetRegistry();
    expect(registry.get("unknown")).toBeUndefined();
    expect(registry.has("unknown")).toBe(false);
  });

  it("accepts custom presets", () => {
    const custom: ExtractionPreset = { id: "my-custom", expression: "$.data" };
    const registry = createPresetRegistry([custom]);
    expect(registry.has("my-custom")).toBe(true);
    expect(registry.get("my-custom")).toEqual(custom);
  });

  it("custom presets override built-ins with same id", () => {
    const override: ExtractionPreset = {
      id: "prometheus",
      expression: "$.custom.override",
    };
    const registry = createPresetRegistry([override]);
    expect(registry.get("prometheus")!.expression).toBe("$.custom.override");
  });

  it("is read-only — no register method exposed", () => {
    const registry = createPresetRegistry();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((registry as any).register).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((registry as any).set).toBeUndefined();
  });

  it("preserves all built-ins when custom presets are provided", () => {
    const custom: ExtractionPreset = { id: "extra", expression: "$" };
    const registry = createPresetRegistry([custom]);
    expect(registry.has("prometheus")).toBe(true);
    expect(registry.has("elasticsearch")).toBe(true);
    expect(registry.has("extra")).toBe(true);
  });
});
