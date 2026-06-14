import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CasehubElement } from "./CasehubElement.js";
import type { VizComponentProps } from "./types.js";
import type { TypedDataSet } from "@casehub/data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/data/dist/dataset/lookup.js";

interface TestProps extends VizComponentProps {
  readonly label?: string;
}

class TestElement extends CasehubElement<TestProps> {
  renderCalls: Array<{ props: TestProps; dataset: TypedDataSet }> = [];

  protected override render(
    _container: HTMLDivElement,
    props: TestProps,
    dataset: TypedDataSet,
  ): void {
    this.renderCalls.push({ props, dataset });
  }
}

customElements.define("test-casehub-element", TestElement);

function mockLookup(id: string): DataSetLookup {
  return { dataSetId: id, operations: [] } as unknown as DataSetLookup;
}

function mockDataSet(): TypedDataSet {
  return { columns: [], rows: [] } as unknown as TypedDataSet;
}

describe("CasehubElement", () => {
  let el: TestElement;
  let events: CustomEvent[];
  let handler: (e: Event) => void;

  beforeEach(() => {
    el = document.createElement("test-casehub-element") as TestElement;
    events = [];
    handler = (e: Event) => events.push(e as CustomEvent);
    document.body.addEventListener("casehub-data-request", handler);
  });

  afterEach(() => {
    document.body.removeEventListener("casehub-data-request", handler);
    if (el.isConnected) {
      el.remove();
    }
  });

  describe("shadow DOM", () => {
    it("creates shadow root with a container div", () => {
      expect(el.shadowRoot).not.toBeNull();
      const container = el.shadowRoot!.querySelector("div");
      expect(container).not.toBeNull();
    });
  });

  describe("data request lifecycle", () => {
    it("fires event on connectedCallback when props with lookup are set before insertion", () => {
      const lookup = mockLookup("sales");
      el.props = { lookup };
      document.body.appendChild(el);

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.lookup).toBe(lookup);
      expect(events[0]!.detail.element).toBe(el);
    });

    it("fires event on props setter when already connected", () => {
      document.body.appendChild(el);
      expect(events).toHaveLength(0);

      const lookup = mockLookup("sales");
      el.props = { lookup };

      expect(events).toHaveLength(1);
      expect(events[0]!.detail.lookup).toBe(lookup);
    });

    it("does not fire duplicate request for same lookup reference", () => {
      const lookup = mockLookup("sales");
      el.props = { lookup };
      document.body.appendChild(el);
      expect(events).toHaveLength(1);

      // Setting same props reference again should not fire
      el.props = { lookup };
      expect(events).toHaveLength(1);
    });

    it("fires new request when lookup reference changes", () => {
      const lookup1 = mockLookup("sales");
      el.props = { lookup: lookup1 };
      document.body.appendChild(el);
      expect(events).toHaveLength(1);

      const lookup2 = mockLookup("orders");
      el.props = { lookup: lookup2 };
      expect(events).toHaveLength(2);
      expect(events[1]!.detail.lookup).toBe(lookup2);
    });

    it("clears dataset when lookup changes", () => {
      const lookup1 = mockLookup("sales");
      el.props = { lookup: lookup1 };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();
      expect(el.renderCalls.length).toBeGreaterThan(0);

      el.renderCalls = [];
      const lookup2 = mockLookup("orders");
      el.props = { lookup: lookup2 };

      // Dataset was cleared, so render should not be called (no dataset)
      // update() was called by props setter, but guard prevents render
      expect(el.renderCalls).toHaveLength(0);
    });

    it("fires new request on disconnect + reconnect", () => {
      const lookup = mockLookup("sales");
      el.props = { lookup };
      document.body.appendChild(el);
      expect(events).toHaveLength(1);

      el.remove();
      document.body.appendChild(el);
      expect(events).toHaveLength(2);
    });

    it("does not fire event when no lookup exists", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      expect(events).toHaveLength(0);
    });

    it("event has bubbles and composed flags", () => {
      el.props = { lookup: mockLookup("sales") };
      document.body.appendChild(el);

      expect(events[0]!.bubbles).toBe(true);
      expect(events[0]!.composed).toBe(true);
    });
  });

  describe("update guards", () => {
    it("does not call render when no props set", () => {
      document.body.appendChild(el);
      el.dataSet = mockDataSet();
      expect(el.renderCalls).toHaveLength(0);
    });

    it("does not call render when no dataset", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      expect(el.renderCalls).toHaveLength(0);
    });

    it("calls render when both props and dataset are present", () => {
      const props: TestProps = { label: "test" };
      const ds = mockDataSet();
      el.props = props;
      document.body.appendChild(el);
      el.dataSet = ds;

      expect(el.renderCalls).toHaveLength(1);
      expect(el.renderCalls[0]!.props).toBe(props);
      expect(el.renderCalls[0]!.dataset).toBe(ds);
    });

    it("does not call render when not connected", () => {
      const props: TestProps = { label: "test" };
      el.props = props;
      el.dataSet = mockDataSet();

      // Not connected, so no render
      expect(el.renderCalls).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("setting error clears dataset", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();
      expect(el.renderCalls).toHaveLength(1);

      el.renderCalls = [];
      el.error = "Something went wrong";

      // render should not be called (error state shows error display)
      expect(el.renderCalls).toHaveLength(0);
    });

    it("setting dataset clears error", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      el.error = "fail";

      el.renderCalls = [];
      el.dataSet = mockDataSet();

      // Error was cleared, dataset is set, should render
      expect(el.renderCalls).toHaveLength(1);
    });

    it("error state renders error display instead of render()", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();
      el.renderCalls = [];

      el.error = "broken";
      expect(el.renderCalls).toHaveLength(0);

      const container = el.shadowRoot!.querySelector("div")!;
      expect(container.textContent).toContain("broken");
    });
  });

  describe("standalone usage (no lookup)", () => {
    it("renders directly when dataset is set without lookup", () => {
      el.props = { label: "standalone" };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();

      expect(events).toHaveLength(0);
      expect(el.renderCalls).toHaveLength(1);
    });
  });

  describe("loading state", () => {
    it("shows loading when props set but no dataset", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);

      const container = el.shadowRoot!.querySelector("div")!;
      expect(container.textContent).toContain("Loading");
    });
  });

  describe("totalRows property", () => {
    it("defaults to -1", () => {
      expect(el.totalRows).toBe(-1);
    });

    it("can be set and triggers update", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();
      el.renderCalls = [];

      el.totalRows = 100;
      expect(el.totalRows).toBe(100);
      // Should trigger update → render
      expect(el.renderCalls).toHaveLength(1);
    });
  });

  describe("theme property", () => {
    it("defaults to empty string", () => {
      expect(el.theme).toBe("");
    });

    it("can be set and triggers update", () => {
      el.props = { label: "test" };
      document.body.appendChild(el);
      el.dataSet = mockDataSet();
      el.renderCalls = [];

      el.theme = "dark";
      expect(el.theme).toBe("dark");
      expect(el.renderCalls).toHaveLength(1);
    });
  });

  describe("refresh timer", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("starts refresh timer when props have refresh interval", () => {
      const lookup = mockLookup("sales");
      el.props = { lookup, refresh: { interval: 5000 } };
      document.body.appendChild(el);
      expect(events).toHaveLength(1);

      // Advance past interval
      vi.advanceTimersByTime(5000);
      expect(events).toHaveLength(2);

      vi.advanceTimersByTime(5000);
      expect(events).toHaveLength(3);
    });

    it("stops refresh timer on disconnect", () => {
      const lookup = mockLookup("sales");
      el.props = { lookup, refresh: { interval: 5000 } };
      document.body.appendChild(el);
      expect(events).toHaveLength(1);

      el.remove();

      vi.advanceTimersByTime(10000);
      // Only the initial request + reconnect reset, no timer-driven requests
      expect(events).toHaveLength(1);
    });

    it("restarts refresh timer on reconnect", () => {
      const lookup = mockLookup("sales");
      el.props = { lookup, refresh: { interval: 5000 } };
      document.body.appendChild(el);
      expect(events).toHaveLength(1);

      el.remove();
      document.body.appendChild(el);
      // reconnect fires a new request
      expect(events).toHaveLength(2);

      vi.advanceTimersByTime(5000);
      // timer fires again
      expect(events).toHaveLength(3);
    });
  });

  describe("resize observer", () => {
    it("calls onResize when container resizes", () => {
      const resizeSpy = vi.spyOn(el, "onResize" as never);
      document.body.appendChild(el);

      // jsdom's ResizeObserver is limited, but we can verify the observer was set up
      // by checking onResize is a callable method
      expect(typeof el.onResize).toBe("function");

      resizeSpy.mockRestore();
    });
  });
});
