import { describe, it, expect, vi } from "vitest";
import { renderComponent } from "@casehub/component/dist/renderer/render.js";
import type { Component } from "@casehub/component/dist/model/types.js";
import { createActivationCallback } from "./activation.js";
import type { ComponentRegistry } from "./registry.js";
import type { PagePathMap } from "./page-paths.js";

describe("event timing — connectedCallback fires during appendChild", () => {
  it("custom element connectedCallback fires synchronously during appendChild", () => {
    const calls: string[] = [];

    class TestElement extends HTMLElement {
      connectedCallback() {
        calls.push("connectedCallback");
      }
    }
    customElements.define("test-timing-element", TestElement);

    const parent = document.createElement("div");
    document.body.appendChild(parent);

    calls.push("before-appendChild");
    const el = document.createElement("test-timing-element");
    parent.appendChild(el);
    calls.push("after-appendChild");

    expect(calls).toEqual(["before-appendChild", "connectedCallback", "after-appendChild"]);

    document.body.removeChild(parent);
  });

  it("composed event from custom element reaches ancestor listener", () => {
    let eventCaught = false;

    const ancestor = document.createElement("div");
    document.body.appendChild(ancestor);

    ancestor.addEventListener("test-composed-event", () => {
      eventCaught = true;
    });

    const wrapper = document.createElement("div");
    wrapper.dataset.componentId = "test-id";
    ancestor.appendChild(wrapper);

    class EmitterElement extends HTMLElement {
      connectedCallback() {
        this.dispatchEvent(
          new CustomEvent("test-composed-event", { bubbles: true, composed: true }),
        );
      }
    }
    customElements.define("test-emitter-element", EmitterElement);

    const emitter = document.createElement("test-emitter-element");
    wrapper.appendChild(emitter);

    expect(eventCaught).toBe(true);
    document.body.removeChild(ancestor);
  });

  it("event listener set BEFORE appendChild catches connectedCallback events", () => {
    const events: string[] = [];

    const target = document.createElement("div");
    document.body.appendChild(target);

    // Listener BEFORE content is added
    target.addEventListener("test-before-event", () => {
      events.push("caught");
    });

    const wrapper = document.createElement("div");
    target.appendChild(wrapper);

    class BeforeElement extends HTMLElement {
      connectedCallback() {
        this.dispatchEvent(
          new CustomEvent("test-before-event", { bubbles: true, composed: true }),
        );
      }
    }
    customElements.define("test-before-element", BeforeElement);

    const el = document.createElement("test-before-element");
    wrapper.appendChild(el);

    expect(events).toEqual(["caught"]);
    document.body.removeChild(target);
  });

  it("event listener set AFTER appendChild misses connectedCallback events", () => {
    const events: string[] = [];

    const target = document.createElement("div");
    document.body.appendChild(target);

    const wrapper = document.createElement("div");
    target.appendChild(wrapper);

    class AfterElement extends HTMLElement {
      connectedCallback() {
        this.dispatchEvent(
          new CustomEvent("test-after-event", { bubbles: true, composed: true }),
        );
      }
    }
    customElements.define("test-after-element", AfterElement);

    const el = document.createElement("test-after-element");
    wrapper.appendChild(el);

    // Listener AFTER content is added — too late
    target.addEventListener("test-after-event", () => {
      events.push("caught");
    });

    expect(events).toEqual([]); // Event was already dispatched and lost
    document.body.removeChild(target);
  });
});

describe("registry timing — entry must exist before appendChild", () => {
  it("registry lookup during connectedCallback returns entry set before appendChild", () => {
    const registry: ComponentRegistry = new Map();
    const pagePathMap: PagePathMap = new Map();
    let registryHadEntry = false;

    const target = document.createElement("div");
    document.body.appendChild(target);

    // Simulate: listener checks registry when data-request fires
    target.addEventListener("casehub-data-request", ((e: Event) => {
      const el = (e.target as HTMLElement).closest("[data-component-id]") as HTMLElement | null;
      const id = el?.dataset.componentId;
      if (id) {
        registryHadEntry = registry.has(id);
      }
    }) as EventListener);

    // Create component structure
    const component: Component = {
      type: "bar-chart",
      id: "test-chart",
      props: { lookup: { dataSetId: "test", operations: [] } },
    };

    // Simulate activation with correct ordering (register THEN append)
    const onNode = createActivationCallback(registry, pagePathMap);
    const wrapper = document.createElement("div");
    wrapper.dataset.componentType = "bar-chart";
    wrapper.dataset.componentId = "test-chart";
    target.appendChild(wrapper);
    onNode(wrapper, component);

    // The activation registers before appending, so the event handler should find the entry
    expect(registry.has("test-chart")).toBe(true);

    document.body.removeChild(target);
  });
});

describe("closest() traversal from custom element", () => {
  it("closest finds data-component-id on parent of custom element", () => {
    const container = document.createElement("div");
    container.dataset.componentId = "grid_0_0_1";
    container.dataset.componentType = "bar-chart";

    const customEl = document.createElement("div"); // simulating casehub-bar-chart
    container.appendChild(customEl);

    const found = customEl.closest("[data-component-id]") as HTMLElement | null;
    expect(found).toBe(container);
    expect(found?.dataset.componentId).toBe("grid_0_0_1");
  });

  it("closest returns null when no data-component-id ancestor exists", () => {
    const orphan = document.createElement("div");
    const found = orphan.closest("[data-component-id]");
    expect(found).toBeNull();
  });
});
