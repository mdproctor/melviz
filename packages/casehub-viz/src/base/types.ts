import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { ColumnSettings } from "@casehub/data/dist/dataset/types.js";
import type {
  FilterSettings,
  RefreshSettings,
} from "@casehub/ui/dist/model/component-props.js";

export interface VizComponentProps {
  readonly lookup?: DataSetLookup;
  readonly filter?: FilterSettings;
  readonly refresh?: RefreshSettings;
  readonly columns?: readonly ColumnSettings[];
}
