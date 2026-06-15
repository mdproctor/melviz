import { describe, it, expect } from "vitest";
import { wireInteractivity } from "./interactive.js";

function makeSlotContainers(slotNames: string[]): {
  container: HTMLDivElement;
  panels: Map<string, HTMLDivElement>;
} {
  const container = document.createElement("div");
  const panels = new Map<string, HTMLDivElement>();
  for (const name of slotNames) {
    const panel = document.createElement("div");
    panel.dataset.slot = name;
    container.appendChild(panel);
    panels.set(name, panel);
  }
  return { container, panels };
}

describe("wireInteractivity — tabs", () => {
  it("creates tab bar with buttons for each slot", () => {
    const { container, panels } = makeSlotContainers(["Sales", "Costs"]);
    wireInteractivity(container, "tabs", ["Sales", "Costs"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar).toBeTruthy();
    const buttons = bar.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.textContent).toBe("Sales");
    expect(buttons[1]!.textContent).toBe("Costs");
  });

  it("first tab visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B", "C"]);
    wireInteractivity(container, "tabs", ["A", "B", "C"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
    expect(panels.get("C")!.style.display).toBe("none");
  });

  it("clicking a tab shows target, hides others", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "tabs", ["A", "B"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    const buttons = bar.querySelectorAll("button");
    buttons[1]!.click();
    expect(panels.get("A")!.style.display).toBe("none");
    expect(panels.get("B")!.style.display).not.toBe("none");
  });
});

describe("wireInteractivity — pills", () => {
  it("has casehub-pills CSS class on bar", () => {
    const { container, panels } = makeSlotContainers(["X", "Y"]);
    wireInteractivity(container, "pills", ["X", "Y"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar.classList.contains("casehub-pills")).toBe(true);
  });
});

describe("wireInteractivity — accordion", () => {
  it("creates disclosure headers for each slot", () => {
    const { container, panels } = makeSlotContainers(["Section A", "Section B"]);
    wireInteractivity(container, "accordion", ["Section A", "Section B"], panels);
    const headers = container.querySelectorAll("[data-accordion-header]");
    expect(headers).toHaveLength(2);
    expect(headers[0]!.textContent).toBe("Section A");
    expect(headers[1]!.textContent).toBe("Section B");
  });

  it("all sections expanded by default", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "accordion", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).not.toBe("none");
  });

  it("clicking header toggles section", () => {
    const { container, panels } = makeSlotContainers(["A"]);
    wireInteractivity(container, "accordion", ["A"], panels);
    const header = container.querySelector("[data-accordion-header]") as HTMLElement;
    header.click();
    expect(panels.get("A")!.style.display).toBe("none");
    header.click();
    expect(panels.get("A")!.style.display).not.toBe("none");
  });
});

describe("wireInteractivity — carousel", () => {
  it("first child visible, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["S1", "S2", "S3"]);
    wireInteractivity(container, "carousel", ["S1", "S2", "S3"], panels);
    expect(panels.get("S1")!.style.display).not.toBe("none");
    expect(panels.get("S2")!.style.display).toBe("none");
    expect(panels.get("S3")!.style.display).toBe("none");
  });

  it("next button cycles forward", () => {
    const { container, panels } = makeSlotContainers(["S1", "S2"]);
    wireInteractivity(container, "carousel", ["S1", "S2"], panels);
    const next = container.querySelector("[data-carousel-next]") as HTMLElement;
    next.click();
    expect(panels.get("S1")!.style.display).toBe("none");
    expect(panels.get("S2")!.style.display).not.toBe("none");
  });

  it("prev button cycles backward (wraps)", () => {
    const { container, panels } = makeSlotContainers(["S1", "S2"]);
    wireInteractivity(container, "carousel", ["S1", "S2"], panels);
    const prev = container.querySelector("[data-carousel-prev]") as HTMLElement;
    prev.click();
    expect(panels.get("S1")!.style.display).toBe("none");
    expect(panels.get("S2")!.style.display).not.toBe("none");
  });
});

describe("wireInteractivity — stack", () => {
  it("first child visible, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "stack", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });

  it("no controls created for stack", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "stack", ["A", "B"], panels);
    expect(container.querySelector("[data-tab-bar]")).toBeNull();
    expect(container.querySelector("[data-carousel-prev]")).toBeNull();
  });
});

describe("wireInteractivity — casehub-slot-change events", () => {
  it("tabs emit casehub-slot-change on click", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    container.dataset.componentId = "nav-1";
    wireInteractivity(container, "tabs", ["A", "B"], panels);
    const events: Array<{ activeSlot: string; containerId: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    const bar = container.querySelector("[data-tab-bar]")!;
    (bar.querySelectorAll("button")[1] as HTMLElement).click();
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("B");
    expect(events[0]!.containerId).toBe("nav-1");
  });

  it("accordion emits casehub-slot-change on expand", () => {
    const { container, panels } = makeSlotContainers(["X", "Y"]);
    container.dataset.componentId = "acc-1";
    wireInteractivity(container, "accordion", ["X", "Y"], panels);
    const events: Array<{ activeSlot: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    const headers = container.querySelectorAll("[data-accordion-header]");
    // First click collapses Y (no event), second click expands Y (fires event)
    (headers[1] as HTMLElement).click();
    (headers[1] as HTMLElement).click();
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("Y");
  });

  it("carousel emits casehub-slot-change on next", () => {
    const { container, panels } = makeSlotContainers(["P1", "P2"]);
    container.dataset.componentId = "car-1";
    wireInteractivity(container, "carousel", ["P1", "P2"], panels);
    const events: Array<{ activeSlot: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    const nextBtn = container.querySelector("[data-carousel-next]") as HTMLElement;
    nextBtn.click();
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("P2");
  });
});

describe("wireInteractivity — sidebar", () => {
  it("creates sidebar nav with buttons for each slot", () => {
    const { container, panels } = makeSlotContainers(["Overview", "Sales"]);
    wireInteractivity(container, "sidebar", ["Overview", "Sales"], panels);
    const bar = container.querySelector("[data-tab-bar]") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.classList.contains("casehub-sidebar")).toBe(true);
    const buttons = bar.querySelectorAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.textContent).toBe("Overview");
  });

  it("first slot visible by default, rest hidden", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "sidebar", ["A", "B"], panels);
    expect(panels.get("A")!.style.display).not.toBe("none");
    expect(panels.get("B")!.style.display).toBe("none");
  });

  it("clicking sidebar item shows target, hides others", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    wireInteractivity(container, "sidebar", ["A", "B"], panels);
    const buttons = container.querySelector("[data-tab-bar]")!.querySelectorAll("button");
    (buttons[1] as HTMLElement).click();
    expect(panels.get("A")!.style.display).toBe("none");
    expect(panels.get("B")!.style.display).not.toBe("none");
  });

  it("emits casehub-slot-change on click", () => {
    const { container, panels } = makeSlotContainers(["A", "B"]);
    container.dataset.componentId = "side-1";
    wireInteractivity(container, "sidebar", ["A", "B"], panels);
    const events: Array<{ activeSlot: string; containerId: string }> = [];
    container.addEventListener("casehub-slot-change", ((e: CustomEvent) => {
      events.push(e.detail);
    }) as EventListener);
    const buttons = container.querySelector("[data-tab-bar]")!.querySelectorAll("button");
    (buttons[1] as HTMLElement).click();
    expect(events).toHaveLength(1);
    expect(events[0]!.activeSlot).toBe("B");
    expect(events[0]!.containerId).toBe("side-1");
  });
});
