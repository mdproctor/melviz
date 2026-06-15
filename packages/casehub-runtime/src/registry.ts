import type { Component } from "@casehub/component/dist/model/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { CasehubElement } from "@casehub/viz/dist/base/CasehubElement.js";
import type { VizComponentProps } from "@casehub/viz/dist/base/types.js";

export interface ComponentEntry {
  readonly element: HTMLElement;
  readonly vizElement?: CasehubElement<VizComponentProps>;
  readonly component: Component;
  readonly pagePath: string;
  readonly originalLookup?: DataSetLookup;
}

export type ComponentRegistry = Map<string, ComponentEntry>;
