import type { FilterOp } from "./filter.js";
import type { GroupOp } from "./group.js";
import type { SortOp } from "./sort.js";
import { DataSetError } from "./errors.js";

export type DataSetOp = FilterOp | GroupOp | SortOp;

export function validateOpOrder(ops: readonly DataSetOp[]): void {
  let pattern = "";
  for (const op of ops) {
    switch (op.type) {
      case "filter": pattern += "F"; break;
      case "group": pattern += "G"; break;
      case "sort": pattern += "S"; break;
    }
  }
  if (!/^F*G*S?$/.test(pattern)) {
    throw new DataSetError(
      "INVALID_OPERATION",
      `Invalid operation sequence "${pattern}". Valid pattern: (0..N) FILTER > (0..N) GROUP > (0..1) SORT`,
    );
  }
}
