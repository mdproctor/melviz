import type { FilterOp } from "./filter.js";
import type { GroupOp } from "./group.js";
import type { SortOp } from "./sort.js";
import { DataSetError } from "./errors.js";
import type { TypedDataSet } from "./types.js";
import { applyFilter } from "./filter-eval.js";
import { applyGroup, applyGroupSequence } from "./group-eval.js";
import { applySort } from "./sort-eval.js";

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

export function applyOps(
  ds: TypedDataSet,
  ops: readonly DataSetOp[],
): TypedDataSet {
  validateOpOrder(ops);

  let current = ds;
  let i = 0;

  while (i < ops.length) {
    const op = ops[i]!;

    if (op.type === "filter") {
      current = applyFilter(current, op);
      i++;
    } else if (op.type === "group") {
      // Collect consecutive GroupOps for deferred materialisation
      const groupOps: GroupOp[] = [];
      while (i < ops.length && ops[i]!.type === "group") {
        groupOps.push(ops[i]! as GroupOp);
        i++;
      }
      current = groupOps.length === 1
        ? applyGroup(current, groupOps[0]!)
        : applyGroupSequence(current, groupOps);
    } else if (op.type === "sort") {
      current = applySort(current, op);
      i++;
    }
  }

  return current;
}
