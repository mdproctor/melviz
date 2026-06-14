import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { VizComponentProps } from "./types.js";

export interface CasehubDataRequestDetail {
  readonly element: CasehubElement<VizComponentProps>;
  readonly lookup: DataSetLookup;
}

export abstract class CasehubElement<
  P extends VizComponentProps,
> extends HTMLElement {
  private _props: P | undefined;
  private _dataset: TypedDataSet | undefined;
  private _totalRows = -1;
  private _theme = "";
  private _error = "";
  private _dataRequested = false;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _resizeObserver: ResizeObserver | undefined;

  protected readonly container: HTMLDivElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    this.container = document.createElement("div");
    shadow.appendChild(this.container);
  }

  // ── Properties ──────────────────────────────────────────────────────

  get props(): P | undefined {
    return this._props;
  }

  set props(value: P) {
    const oldLookup = this._props?.lookup;
    const oldInterval = this._props?.refresh?.interval;
    this._props = value;

    if (value.lookup !== oldLookup) {
      this._dataRequested = false;
      this._dataset = undefined;
    }

    this.requestDataIfNeeded();
    if (value.refresh?.interval !== oldInterval) {
      this.startRefreshTimer();
    }
    this.update();
  }

  get dataSet(): TypedDataSet | undefined {
    return this._dataset;
  }

  set dataSet(value: TypedDataSet) {
    this._error = "";
    this._dataset = value;
    this.update();
  }

  get totalRows(): number {
    return this._totalRows;
  }

  set totalRows(value: number) {
    this._totalRows = value;
    this.update();
  }

  get theme(): string {
    return this._theme;
  }

  set theme(value: string) {
    this._theme = value;
    this.update();
  }

  get error(): string {
    return this._error;
  }

  set error(value: string) {
    this._dataset = undefined;
    this._error = value;
    this.update();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  connectedCallback(): void {
    this.requestDataIfNeeded();
    this.startRefreshTimer();
    this.startResizeObserver();
    this.update();
  }

  disconnectedCallback(): void {
    this._dataRequested = false;
    this.stopRefreshTimer();
    this.stopResizeObserver();
  }

  // ── Data request ────────────────────────────────────────────────────

  private requestDataIfNeeded(): void {
    if (!this.isConnected) return;
    if (this._dataRequested) return;

    const lookup = this._props?.lookup;
    if (!lookup) return;

    this._dataRequested = true;
    this.dispatchEvent(
      new CustomEvent<CasehubDataRequestDetail>("casehub-data-request", {
        bubbles: true,
        composed: true,
        detail: { element: this, lookup },
      }),
    );
  }

  // ── Refresh timer ───────────────────────────────────────────────────

  private startRefreshTimer(): void {
    this.stopRefreshTimer();

    const interval = this._props?.refresh?.interval;
    if (!interval || !this.isConnected) return;

    this._refreshTimer = setInterval(() => {
      this._dataRequested = false;
      this.requestDataIfNeeded();
    }, interval);
  }

  private stopRefreshTimer(): void {
    if (this._refreshTimer !== undefined) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  // ── Resize observer ─────────────────────────────────────────────────

  private startResizeObserver(): void {
    this.stopResizeObserver();

    if (typeof ResizeObserver === "undefined") return;

    this._resizeObserver = new ResizeObserver(() => {
      this.onResize();
    });
    this._resizeObserver.observe(this.container);
  }

  private stopResizeObserver(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
  }

  // ── Update / render pipeline ────────────────────────────────────────

  private update(): void {
    if (!this.isConnected) return;

    if (this._error) {
      this.renderError(this.container, this._error);
      return;
    }

    if (!this._props) {
      this.renderLoading(this.container);
      return;
    }

    if (!this._dataset) {
      this.renderLoading(this.container);
      return;
    }

    this.render(this.container, this._props, this._dataset);
  }

  // ── Default renderers ───────────────────────────────────────────────

  protected renderLoading(container: HTMLDivElement): void {
    container.textContent = "Loading…";
  }

  protected renderError(container: HTMLDivElement, message: string): void {
    container.textContent = message;
  }

  // ── Resize hook ─────────────────────────────────────────────────────

  protected onResize(): void {
    // Default no-op — subclasses override
  }

  // ── Abstract ────────────────────────────────────────────────────────

  protected abstract render(
    container: HTMLDivElement,
    props: P,
    dataset: TypedDataSet,
  ): void;
}
