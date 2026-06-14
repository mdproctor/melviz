import { init, use, type ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { TitleComponent } from "echarts/components";
import { CasehubElement } from "./CasehubElement.js";
import type { VizComponentProps } from "./types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { ChartSettings } from "@casehub/ui/dist/model/displayer-types.js";
import type { FilterSettings } from "@casehub/ui/dist/model/component-props.js";

// Register the Canvas renderer and TitleComponent once at module load
use([CanvasRenderer, TitleComponent]);

export interface CasehubFilterDetail {
  readonly columnId: string;
  readonly rowIndex: number;
  readonly reset: boolean;
  readonly group: string | undefined;
}

export abstract class CasehubChartElement<
  P extends VizComponentProps & ChartSettings,
> extends CasehubElement<P> {
  private _chart: ECharts | undefined;
  private _currentTheme = "";

  // ── Abstract — subclasses implement ─────────────────────────────────

  abstract buildOption(
    props: P,
    dataset: TypedDataSet,
  ): Record<string, unknown>;

  // ── Render pipeline ─────────────────────────────────────────────────

  protected override render(
    container: HTMLDivElement,
    props: P,
    dataset: TypedDataSet,
  ): void {
    const chart = this.ensureChart(container);
    const option = this.buildOption(props, dataset);
    chart.setOption(option, true);
  }

  // ── ECharts instance management ─────────────────────────────────────

  private ensureChart(container: HTMLDivElement): ECharts {
    // Re-init if theme changed
    if (this._chart && this._currentTheme !== this.theme) {
      this._chart.dispose();
      this._chart = undefined;
    }

    if (!this._chart) {
      this._currentTheme = this.theme;
      this._chart = init(container, this.theme || "", undefined);
      this.registerClickHandler(this._chart);
    }

    return this._chart;
  }

  // ── Click handler ───────────────────────────────────────────────────

  private registerClickHandler(chart: ECharts): void {
    chart.on("click", (params: { dataIndex: number }) => {
      const filter = this.props?.filter as FilterSettings | undefined;
      if (!filter?.enabled) return;

      const ds = this.dataSet;
      const firstColumn = ds?.columns[0];
      if (!firstColumn) return;

      this.dispatchEvent(
        new CustomEvent<CasehubFilterDetail>("casehub-filter", {
          bubbles: true,
          composed: true,
          detail: {
            columnId: firstColumn.id,
            rowIndex: params.dataIndex,
            reset: false,
            group: filter.group,
          },
        }),
      );
    });
  }

  // ── Resize ──────────────────────────────────────────────────────────

  override onResize(): void {
    this._chart?.resize();
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._chart) {
      this._chart.dispose();
      this._chart = undefined;
    }
  }
}
