import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { IframePluginProps } from "@casehub/ui/dist/model/displayer-types.js";
import { toWireDataSet } from "@casehub/data/dist/dataset/conversion.js";
import { CasehubElement } from "../base/CasehubElement.js";

const IFRAME_CSS = `
:host {
  display: block;
}
iframe {
  border: none;
  width: 100%;
  height: 100%;
}
`;

export class CasehubIframePlugin extends CasehubElement<IframePluginProps> {
  private _iframe: HTMLIFrameElement | undefined;
  private _messageHandler: ((e: MessageEvent) => void) | undefined;

  protected override render(
    container: HTMLDivElement,
    props: IframePluginProps,
    dataset: TypedDataSet,
  ): void {
    if (!this._iframe) {
      this.createIframe(container, props);
    }

    this.sendMessages(props, dataset);
  }

  private createIframe(container: HTMLDivElement, props: IframePluginProps): void {
    container.textContent = "";

    // Style
    const style = document.createElement("style");
    style.textContent = IFRAME_CSS;
    container.appendChild(style);

    // Iframe
    this._iframe = document.createElement("iframe");
    this._iframe.src = `/melviz/component/${props.componentId}/index.html`;
    this._iframe.style.width = props.width ?? "100%";
    this._iframe.style.height = props.height ?? "100%";
    container.appendChild(this._iframe);

    // Message listener
    this._messageHandler = (e: MessageEvent) => {
      this.handleMessage(e);
    };
    window.addEventListener("message", this._messageHandler);
  }

  private sendMessages(props: IframePluginProps, dataset: TypedDataSet): void {
    if (!this._iframe?.contentWindow) return;

    // INIT message
    this._iframe.contentWindow.postMessage(
      {
        type: "INIT",
        properties: {
          COMPONENT_ID: props.componentId,
          MODE: this.theme || "light",
        },
      },
      "*",
    );

    // DATASET message
    const wireDataSet = toWireDataSet(dataset);
    const properties: Record<string, unknown> = {
      COMPONENT_ID: props.componentId,
      DATASET: wireDataSet,
      ...Object.fromEntries(Object.entries(props.settings ?? {})),
    };

    this._iframe.contentWindow.postMessage(
      {
        type: "DATASET",
        properties,
      },
      "*",
    );
  }

  private handleMessage(e: MessageEvent): void {
    const msg = e.data;
    if (!msg || msg.type !== "FILTER") return;

    const msgProps = msg.properties;
    const props = this.props;
    const dataset = this.dataSet;

    if (!props || !dataset) return;
    if (!msgProps || msgProps.COMPONENT_ID !== props.componentId) return;

    const filter = msgProps.FILTER;
    if (!filter) return;

    const columnId = dataset.columns[filter.column]?.id;
    if (!columnId) return;

    this.dispatchEvent(
      new CustomEvent("casehub-filter", {
        bubbles: true,
        composed: true,
        detail: {
          columnId,
          rowIndex: filter.row,
          reset: filter.reset ?? false,
          group: props.filter?.group,
        },
      }),
    );
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this._messageHandler) {
      window.removeEventListener("message", this._messageHandler);
      this._messageHandler = undefined;
    }
  }
}

customElements.define("casehub-iframe-plugin", CasehubIframePlugin);
