import type { DataSetId } from "./types.js";
import type { DataSetOp } from "./ops.js";
import { validateOpOrder } from "./ops.js";

export interface DataSetLookup {
  readonly dataSetId: DataSetId;
  readonly operations: readonly DataSetOp[];
}

export function createLookup(
  dataSetId: DataSetId,
  operations: readonly DataSetOp[],
): DataSetLookup {
  validateOpOrder(operations);
  return Object.freeze({ dataSetId, operations: Object.freeze([...operations]) });
}
