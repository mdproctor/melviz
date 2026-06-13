import type { TypedDataSet } from "../types.js";
import type { DataSetManager } from "../manager.js";
import type {
  ExternalDataSetDef,
  DataProvider,
  DataProviderConfig,
  PresetRegistry,
  ResolveResult,
  DataRequest,
} from "./types.js";
import { HttpMethod } from "./types.js";
import { DataSetError } from "../errors.js";
import { extractDataSet } from "./extraction.js";
import { joinDataSets } from "./join.js";

export interface ResolverContext {
  readonly manager: DataSetManager;
  readonly providerFactory: {
    create(
      def: ExternalDataSetDef,
      config: DataProviderConfig,
    ): DataProvider | undefined;
  };
  readonly providerConfig: DataProviderConfig;
  readonly presetRegistry: PresetRegistry;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(def: ExternalDataSetDef): void {
  if (!def.uuid) {
    throw new DataSetError("INVALID_DEFINITION", "uuid is required");
  }

  const sourceCount =
    (def.url !== undefined ? 1 : 0) +
    (def.content !== undefined ? 1 : 0) +
    (def.join !== undefined ? 1 : 0);

  if (sourceCount === 0) {
    throw new DataSetError(
      "INVALID_DEFINITION",
      `Dataset "${def.uuid}" must specify exactly one of: url, content, join`,
    );
  }

  if (sourceCount > 1) {
    throw new DataSetError(
      "INVALID_DEFINITION",
      `Dataset "${def.uuid}" must specify exactly one of: url, content, join (found ${sourceCount})`,
    );
  }
}

// ---------------------------------------------------------------------------
// DataRequest builder
// ---------------------------------------------------------------------------

function buildRequest(def: ExternalDataSetDef): DataRequest {
  const request: DataRequest = {
    url: def.url!,
    method: def.method ?? HttpMethod.GET,
    headers: def.headers ?? {},
    query: def.query ?? {},
    ...(def.form !== undefined ? { form: def.form } : {}),
    ...(def.body !== undefined ? { body: def.body } : {}),
  };
  return request;
}

// ---------------------------------------------------------------------------
// Source determination
// ---------------------------------------------------------------------------

function determineSource(
  def: ExternalDataSetDef,
): "url" | "content" | "join" {
  if (def.join !== undefined) return "join";
  if (def.content !== undefined) return "content";
  return "url";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function resolveExternalDataSet(
  def: ExternalDataSetDef,
  ctx: ResolverContext,
): Promise<ResolveResult> {
  validate(def);

  const source = determineSource(def);

  // ---- Join route ----
  if (source === "join") {
    const dataset = joinDataSets(def.join!, ctx.manager);
    ctx.manager.register(def.uuid, dataset);
    return { dataset, inferredColumns: false, source: "join" };
  }

  // ---- Content / URL route ----
  const provider = ctx.providerFactory.create(def, ctx.providerConfig);
  if (!provider) {
    throw new DataSetError(
      "INVALID_DEFINITION",
      `No provider available for dataset "${def.uuid}"`,
    );
  }

  const request = buildRequest(def);

  let fetchResult;
  try {
    fetchResult = await provider.fetch(request);
  } catch (e) {
    if (e instanceof DataSetError) throw e;
    throw new DataSetError(
      "FETCH_FAILED",
      `Failed to fetch dataset "${def.uuid}": ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  const { dataset, inferredColumns } = await extractDataSet(
    fetchResult,
    def,
    ctx.presetRegistry,
  );

  // ---- Register / Accumulate ----
  registerOrAccumulate(def, dataset, ctx.manager);

  return { dataset, inferredColumns, source };
}

function registerOrAccumulate(
  def: ExternalDataSetDef,
  dataset: TypedDataSet,
  manager: DataSetManager,
): void {
  if (def.accumulate) {
    manager.accumulate(def.uuid, dataset, def.cacheMaxRows);
  } else {
    manager.register(def.uuid, dataset);
  }
}
