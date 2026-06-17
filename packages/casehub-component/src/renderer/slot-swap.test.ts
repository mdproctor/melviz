import { describe, it, expect } from "vitest";
import { slotSwapRegistry, dispatchSlotChange } from "./slot-swap.js";
import type { SwapFn } from "./slot-swap.js";

describe("slotSwapRegistry", () => {
  it("stores and retrieves swap functions keyed by element", () => {
    const el = document.createElement("div");
    const swap: SwapFn = () => {};
    slotSwapRegistry.set(el, swap);
    expect(slotSwapRegistry.get(el)).toBe(swap);
  });

  it("returns undefined for unregistered elements", () => {
    const el = document.createElement("div");
    expect(slotSwapRegistry.get(el)).toBeUndefined();
  });
});

describe("dispatchSlotChange", () => {
  it("emits CustomEvent with activeSlot and containerId", () => {
    const el = document.createElement("div");
    el.dataset.componentId = "tabs-1";
    const events: Array<{ activeSlot: string; containerId: string }> = [];
    el.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    dispatchSlotChange(el, "Sales");
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("Sales");
    expect(events[0]!.containerId).toBe("tabs-1");
  });

  it("event bubbles and is composed", () => {
    const parent = document.createElement("div");
    const child = document.createElement("div");
    child.dataset.componentId = "inner";
    parent.appendChild(child);
    let bubbled = false;
    parent.addEventListener("casehub-slot-change", () => {
      bubbled = true;
    });
    dispatchSlotChange(child, "A");
    expect(bubbled).toBe(true);
  });
});
