import { describe, it, expect } from "vitest";
import { resolveExternalDataSet } from "./resolver.js";
import type { ResolverContext } from "./resolver.js";
import { createDataSetManager } from "../manager.js";
import { createPresetRegistry } from "./presets/registry.js";
import { createDataProviderFactory } from "./provider-factory.js";
import { toTypedDataSet } from "../conversion.js";
import type { ColumnId, DataSetId, Column } from "../types.js";
import { ColumnType } from "../types.js";
import { DataSetError } from "../errors.js";
import type {
  ExternalDataSetDef,
  DataProvider,
  DataRequest,
  FetchResult,
} from "./types.js";
import { HttpMethod } from "./types.js";

function makeCtx(overrides?: Partial<ResolverContext>): ResolverContext {
  return {
    manager: createDataSetManager(),
    providerFactory: createDataProviderFactory(),
    providerConfig: {},
    presetRegistry: createPresetRegistry(),
    ...overrides,
  };
}

function mockProviderFactory(data: unknown, contentType?: string) {
  const provider: DataProvider = {
    async fetch(_req: DataRequest): Promise<FetchResult> {
      return contentType !== undefined ? { data, contentType } : { data };
    },
  };
  return {
    create: () => provider,
  };
}

function col(id: string, name: string, type: ColumnType): Column {
  return { id: id as ColumnId, name, type };
}

const COLS = [
  col("name", "Name", ColumnType.LABEL),
  col("value", "Value", ColumnType.NUMBER),
];

describe("resolveExternalDataSet", () => {
  // ---- Content-based resolution ----

  it("resolves content-based definition and registers in manager", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: "ds-inline" as DataSetId,
      content: JSON.stringify([
        { name: "Alice", value: 100 },
        { name: "Bob", value: 200 },
      ]),
    };

    const result = await resolveExternalDataSet(def, ctx);

    expect(result.source).toBe("content");
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text("name" as ColumnId)).toBe("Alice");
    expect(result.dataset.rows[1]!.number("value" as ColumnId)).toBe(200);
    // Should be registered in manager
    expect(ctx.manager.has("ds-inline" as DataSetId)).toBe(true);
  });

  it("resolves content-based with expression filter", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: "ds-expr" as DataSetId,
      content: JSON.stringify([
        { name: "Alice", value: 100 },
        { name: "Bob", value: 200 },
        { name: "Charlie", value: 300 },
      ]),
      expression: "$[value > 150]",
    };

    const result = await resolveExternalDataSet(def, ctx);

    expect(result.source).toBe("content");
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text("name" as ColumnId)).toBe("Bob");
    expect(result.dataset.rows[1]!.text("name" as ColumnId)).toBe("Charlie");
  });

  // ---- URL-based resolution ----

  it("resolves url-based definition with mock provider", async () => {
    const jsonData = [
      { city: "London", pop: 9000000 },
      { city: "Paris", pop: 2100000 },
    ];
    const ctx = makeCtx({
      providerFactory: mockProviderFactory(JSON.stringify(jsonData)),
    });
    const def: ExternalDataSetDef = {
      uuid: "ds-url" as DataSetId,
      url: "https://api.example.com/cities",
    };

    const result = await resolveExternalDataSet(def, ctx);

    expect(result.source).toBe("url");
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text("city" as ColumnId)).toBe("London");
    expect(ctx.manager.has("ds-url" as DataSetId)).toBe(true);
  });

  // ---- Join-based resolution ----

  it("resolves join-based definition", async () => {
    const ctx = makeCtx();
    const dsA = toTypedDataSet({ columns: COLS, data: [["Alice", "100"]] });
    const dsB = toTypedDataSet({ columns: COLS, data: [["Bob", "200"]] });
    ctx.manager.register("ds-a" as DataSetId, dsA);
    ctx.manager.register("ds-b" as DataSetId, dsB);

    const def: ExternalDataSetDef = {
      uuid: "ds-joined" as DataSetId,
      join: ["ds-a" as DataSetId, "ds-b" as DataSetId],
    };

    const result = await resolveExternalDataSet(def, ctx);

    expect(result.source).toBe("join");
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text("name" as ColumnId)).toBe("Alice");
    expect(result.dataset.rows[1]!.text("name" as ColumnId)).toBe("Bob");
    // Joined dataset registered under its own uuid
    expect(ctx.manager.has("ds-joined" as DataSetId)).toBe(true);
  });

  // ---- Accumulate ----

  it("accumulates rows across multiple resolutions", async () => {
    const ctx = makeCtx();

    const def1: ExternalDataSetDef = {
      uuid: "ds-acc" as DataSetId,
      content: JSON.stringify([{ name: "Alice", value: 100 }]),
      accumulate: true,
    };

    await resolveExternalDataSet(def1, ctx);

    const def2: ExternalDataSetDef = {
      uuid: "ds-acc" as DataSetId,
      content: JSON.stringify([{ name: "Bob", value: 200 }]),
      accumulate: true,
    };

    const result = await resolveExternalDataSet(def2, ctx);

    // The returned dataset is the freshly extracted one (single row)
    expect(result.dataset.rows).toHaveLength(1);
    // But the manager should have accumulated both rows
    const stored = ctx.manager.get("ds-acc" as DataSetId);
    expect(stored).toBeDefined();
    expect(stored!.rows).toHaveLength(2);
  });

  // ---- Validation: missing uuid ----

  it("throws INVALID_DEFINITION when uuid is missing", async () => {
    const ctx = makeCtx();
    const def = {
      content: JSON.stringify([{ a: 1 }]),
    } as unknown as ExternalDataSetDef;

    await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow(DataSetError);
    try {
      await resolveExternalDataSet(def, ctx);
    } catch (e) {
      expect((e as DataSetError).code).toBe("INVALID_DEFINITION");
    }
  });

  // ---- Validation: no source ----

  it("throws INVALID_DEFINITION when no source is provided", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: "ds-empty" as DataSetId,
    };

    await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow(DataSetError);
    try {
      await resolveExternalDataSet(def, ctx);
    } catch (e) {
      expect((e as DataSetError).code).toBe("INVALID_DEFINITION");
    }
  });

  // ---- Fetch failure ----

  it("wraps fetch errors as FETCH_FAILED", async () => {
    const failingProvider: DataProvider = {
      async fetch(_req: DataRequest): Promise<FetchResult> {
        throw new Error("Network timeout");
      },
    };
    const ctx = makeCtx({
      providerFactory: { create: () => failingProvider },
    });
    const def: ExternalDataSetDef = {
      uuid: "ds-fail" as DataSetId,
      url: "https://api.example.com/broken",
    };

    await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow(DataSetError);
    try {
      await resolveExternalDataSet(def, ctx);
    } catch (e) {
      expect((e as DataSetError).code).toBe("FETCH_FAILED");
    }
  });

  // ---- Source field correctness ----

  it("returns source='url' for url-based definitions", async () => {
    const ctx = makeCtx({
      providerFactory: mockProviderFactory(
        JSON.stringify([{ x: 1 }]),
      ),
    });
    const def: ExternalDataSetDef = {
      uuid: "ds-src-url" as DataSetId,
      url: "https://api.example.com/data",
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.source).toBe("url");
  });

  it("returns source='content' for content-based definitions", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: "ds-src-content" as DataSetId,
      content: JSON.stringify([{ x: 1 }]),
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.source).toBe("content");
  });

  it("returns source='join' for join-based definitions", async () => {
    const ctx = makeCtx();
    ctx.manager.register(
      "j1" as DataSetId,
      toTypedDataSet({ columns: COLS, data: [["A", "1"]] }),
    );
    ctx.manager.register(
      "j2" as DataSetId,
      toTypedDataSet({ columns: COLS, data: [["B", "2"]] }),
    );
    const def: ExternalDataSetDef = {
      uuid: "ds-src-join" as DataSetId,
      join: ["j1" as DataSetId, "j2" as DataSetId],
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.source).toBe("join");
  });

  // ---- Inferred columns ----

  it("sets inferredColumns=true when no explicit columns are declared", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: "ds-infer" as DataSetId,
      content: JSON.stringify([{ name: "Alice", value: 100 }]),
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.inferredColumns).toBe(true);
  });

  it("sets inferredColumns=false when explicit columns are declared", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: "ds-explicit" as DataSetId,
      content: JSON.stringify([{ name: "Alice", value: 100 }]),
      columns: [
        { id: "name" as ColumnId, type: ColumnType.LABEL },
        { id: "value" as ColumnId, type: ColumnType.NUMBER },
      ],
    };
    const result = await resolveExternalDataSet(def, ctx);
    expect(result.inferredColumns).toBe(false);
  });

  // ---- Validation: multiple sources ----

  it("throws INVALID_DEFINITION when multiple sources are provided", async () => {
    const ctx = makeCtx();
    const def: ExternalDataSetDef = {
      uuid: "ds-multi" as DataSetId,
      url: "https://api.example.com/data",
      content: JSON.stringify([{ a: 1 }]),
    };

    await expect(resolveExternalDataSet(def, ctx)).rejects.toThrow(DataSetError);
    try {
      await resolveExternalDataSet(def, ctx);
    } catch (e) {
      expect((e as DataSetError).code).toBe("INVALID_DEFINITION");
    }
  });

  // ---- DataRequest building ----

  it("builds DataRequest with defaults and custom headers", async () => {
    let capturedRequest: DataRequest | undefined;
    const captureProvider: DataProvider = {
      async fetch(req: DataRequest): Promise<FetchResult> {
        capturedRequest = req;
        return { data: JSON.stringify([{ a: 1 }]) };
      },
    };
    const ctx = makeCtx({
      providerFactory: { create: () => captureProvider },
    });
    const def: ExternalDataSetDef = {
      uuid: "ds-req" as DataSetId,
      url: "https://api.example.com/data",
      method: HttpMethod.POST,
      headers: { Authorization: "Bearer token" },
      query: { page: "1" },
      body: '{"filter": true}',
    };

    await resolveExternalDataSet(def, ctx);

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.url).toBe("https://api.example.com/data");
    expect(capturedRequest!.method).toBe(HttpMethod.POST);
    expect(capturedRequest!.headers).toEqual({ Authorization: "Bearer token" });
    expect(capturedRequest!.query).toEqual({ page: "1" });
    expect(capturedRequest!.body).toBe('{"filter": true}');
  });

  it("defaults method to GET and headers/query to empty objects", async () => {
    let capturedRequest: DataRequest | undefined;
    const captureProvider: DataProvider = {
      async fetch(req: DataRequest): Promise<FetchResult> {
        capturedRequest = req;
        return { data: JSON.stringify([{ a: 1 }]) };
      },
    };
    const ctx = makeCtx({
      providerFactory: { create: () => captureProvider },
    });
    const def: ExternalDataSetDef = {
      uuid: "ds-defaults" as DataSetId,
      url: "https://api.example.com/data",
    };

    await resolveExternalDataSet(def, ctx);

    expect(capturedRequest).toBeDefined();
    expect(capturedRequest!.method).toBe(HttpMethod.GET);
    expect(capturedRequest!.headers).toEqual({});
    expect(capturedRequest!.query).toEqual({});
    expect(capturedRequest!.form).toBeUndefined();
    expect(capturedRequest!.body).toBeUndefined();
  });
});
