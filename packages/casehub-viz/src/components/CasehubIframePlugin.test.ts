import { beforeEach, describe, expect, it, vi } from "vitest";
import { CasehubIframePlugin } from "./CasehubIframePlugin.js";
import type { IframePluginProps } from "@casehub/ui/dist/model/displayer-types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import { ColumnType } from "@casehub/data/dist/dataset/types.js";

describe("CasehubIframePlugin", () => {
  let element: CasehubIframePlugin;

  beforeEach(() => {
    element = document.createElement("casehub-iframe-plugin") as CasehubIframePlugin;
    document.body.appendChild(element);
  });

  afterEach(() => {
    if (element.parentNode) {
      document.body.removeChild(element);
    }
  });

  it("creates iframe with correct src", () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;

    const iframe = element.shadowRoot!.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.src).toContain("/melviz/component/echarts/index.html");
  });

  it("applies width and height from props", () => {
    const props: IframePluginProps = {
      componentId: "echarts",
      width: "800px",
      height: "600px",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;

    const iframe = element.shadowRoot!.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.style.width).toBe("800px");
    expect(iframe!.style.height).toBe("600px");
  });

  it("defaults to 100% width and height", () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;

    const iframe = element.shadowRoot!.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe!.style.width).toBe("100%");
    expect(iframe!.style.height).toBe("100%");
  });

  it("sends INIT message to iframe", () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    const postMessageSpy = vi.fn();
    element.props = props;
    element.dataSet = dataset;

    // Mock iframe contentWindow
    const iframe = element.shadowRoot!.querySelector("iframe");
    if (iframe) {
      Object.defineProperty(iframe, "contentWindow", {
        value: { postMessage: postMessageSpy },
        writable: true,
      });
    }

    // Fire load event to trigger message sending
    iframe!.dispatchEvent(new Event("load"));

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "INIT",
        properties: expect.objectContaining({
          COMPONENT_ID: "echarts",
        }),
      }),
      "*",
    );
  });

  it("sends DATASET message with wire format", () => {
    const props: IframePluginProps = {
      componentId: "echarts",
      settings: { theme: "dark" },
    };

    const dataset: TypedDataSet = {
      columns: [
        { id: "x", type: ColumnType.TEXT },
        { id: "y", type: ColumnType.NUMBER },
      ],
      rows: [
        {
          cells: [
            { type: ColumnType.TEXT, value: "A" },
            { type: ColumnType.NUMBER, value: 10 },
          ],
          cell: () => ({ type: ColumnType.TEXT, value: "A" }),
        },
      ],
    };

    const postMessageSpy = vi.fn();
    element.props = props;
    element.dataSet = dataset;

    const iframe = element.shadowRoot!.querySelector("iframe");
    if (iframe) {
      Object.defineProperty(iframe, "contentWindow", {
        value: { postMessage: postMessageSpy },
        writable: true,
      });
    }

    // Fire load event to trigger message sending
    iframe!.dispatchEvent(new Event("load"));

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "DATASET",
        properties: expect.objectContaining({
          COMPONENT_ID: "echarts",
          DATASET: expect.objectContaining({
            columns: expect.arrayContaining([
              expect.objectContaining({ id: "x" }),
              expect.objectContaining({ id: "y" }),
            ]),
            data: [["A", "10"]],
          }),
          theme: "dark",
        }),
      }),
      "*",
    );
  });

  it("handles FILTER messages from iframe", () => {
    const props: IframePluginProps = {
      componentId: "echarts",
      filter: { group: "test-group" },
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "col1", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;

    const filterHandler = vi.fn();
    element.addEventListener("casehub-filter", filterHandler);

    // Simulate message from iframe
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "FILTER",
          properties: {
            COMPONENT_ID: "echarts",
            FILTER: {
              column: 0,
              row: 5,
              reset: false,
            },
          },
        },
      }),
    );

    expect(filterHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          columnId: "col1",
          rowIndex: 5,
          reset: false,
          group: "test-group",
        },
      }),
    );
  });

  it("ignores FILTER messages for other components", () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "col1", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;

    const filterHandler = vi.fn();
    element.addEventListener("casehub-filter", filterHandler);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "FILTER",
          properties: {
            COMPONENT_ID: "other-component",
            FILTER: { column: 0, row: 5 },
          },
        },
      }),
    );

    expect(filterHandler).not.toHaveBeenCalled();
  });

  it("cleans up message listener on disconnect", () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "col1", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props;
    element.dataSet = dataset;

    const filterHandler = vi.fn();
    element.addEventListener("casehub-filter", filterHandler);

    element.remove();

    // Message after disconnect should not trigger handler
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          type: "FILTER",
          properties: {
            COMPONENT_ID: "echarts",
            FILTER: { column: 0, row: 5 },
          },
        },
      }),
    );

    expect(filterHandler).not.toHaveBeenCalled();
  });

  it("recreates iframe when componentId changes", () => {
    const props1: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    element.props = props1;
    element.dataSet = dataset;

    const iframe1 = element.shadowRoot!.querySelector("iframe");
    expect(iframe1).toBeTruthy();
    expect(iframe1!.src).toContain("/melviz/component/echarts/index.html");

    // Change componentId
    const props2: IframePluginProps = {
      componentId: "llm-prompter",
    };

    element.props = props2;
    element.dataSet = dataset;

    const iframe2 = element.shadowRoot!.querySelector("iframe");
    expect(iframe2).toBeTruthy();
    expect(iframe2!.src).toContain("/melviz/component/llm-prompter/index.html");
    expect(iframe2).not.toBe(iframe1); // Different iframe instance
  });

  it("waits for iframe load before sending messages", async () => {
    const props: IframePluginProps = {
      componentId: "echarts",
    };

    const dataset: TypedDataSet = {
      columns: [{ id: "x", type: ColumnType.TEXT }],
      rows: [],
    };

    const postMessageSpy = vi.fn();

    element.props = props;
    element.dataSet = dataset;

    const iframe = element.shadowRoot!.querySelector("iframe");
    expect(iframe).toBeTruthy();

    // Mock contentWindow but don't fire load yet
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage: postMessageSpy },
      writable: true,
    });

    // Messages should not be sent yet
    expect(postMessageSpy).not.toHaveBeenCalled();

    // Fire load event
    iframe!.dispatchEvent(new Event("load"));

    // Now messages should be sent
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(postMessageSpy).toHaveBeenCalled();
  });
});
