import { describe, it, expect, vi } from "vitest";
import type { Component } from "../model/types.js";
import { renderComponent } from "./render.js";
import { activateSlot } from "./activate-slot.js";

describe("activateSlot — slot activation", () => {
  it("activates target slot, hides others (tabs)", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "tabs",
      slots: {
        Home: [{ type: "html" }],
        Profile: [{ type: "html" }],
        Settings: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    const result = activateSlot(container, "Profile");

    expect(result).toBe(true);
    const panels = container.querySelectorAll<HTMLElement>("[data-slot]");
    expect(panels[0]!.style.display).toBe("none"); // Home
    expect(panels[1]!.style.display).toBe(""); // Profile
    expect(panels[2]!.style.display).toBe("none"); // Settings
  });

  it("returns false for non-existent slot", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "tabs",
      slots: {
        A: [{ type: "html" }],
        B: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    const result = activateSlot(container, "Z");

    expect(result).toBe(false);
  });

  it("dispatches casehub-slot-change with correct detail", () => {
    const target = document.createElement("div");
    const component: Component = {
      id: "test-component",
      type: "tabs",
      slots: {
        A: [{ type: "html" }],
        B: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    const handler = vi.fn();
    container.addEventListener("casehub-slot-change", handler);

    activateSlot(container, "B");

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]![0] as CustomEvent;
    expect(event.detail).toEqual({
      activeSlot: "B",
      containerId: "test-component",
    });
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });

  it("works with sidebar", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "sidebar",
      slots: {
        Nav: [{ type: "html" }],
        Content: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    const result = activateSlot(container, "Content");

    expect(result).toBe(true);
    const panels = container.querySelectorAll<HTMLElement>("[data-slot]");
    expect(panels[0]!.style.display).toBe("none"); // Nav
    expect(panels[1]!.style.display).toBe(""); // Content
  });

  it("accordion shows only target panel (not toggle)", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "accordion",
      slots: {
        Section1: [{ type: "html" }],
        Section2: [{ type: "html" }],
        Section3: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    const result = activateSlot(container, "Section2");

    expect(result).toBe(true);
    const panels = container.querySelectorAll<HTMLElement>("[data-slot]");
    expect(panels[0]!.style.display).toBe("none"); // Section1
    expect(panels[1]!.style.display).toBe(""); // Section2
    expect(panels[2]!.style.display).toBe("none"); // Section3
  });

  it("does not dispatch event when slot not found", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "tabs",
      slots: {
        A: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    const handler = vi.fn();
    container.addEventListener("casehub-slot-change", handler);

    const result = activateSlot(container, "NonExistent");

    expect(result).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it("updates button active state for tabs", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "tabs",
      slots: {
        A: [{ type: "html" }],
        B: [{ type: "html" }],
        C: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    activateSlot(container, "B");

    const buttons = container.querySelectorAll<HTMLElement>("[data-tab-bar] button[data-slot]");
    expect(buttons[0]!.dataset.active).toBeUndefined(); // A
    expect(buttons[1]!.dataset.active).toBe(""); // B
    expect(buttons[2]!.dataset.active).toBeUndefined(); // C
  });

  it("updates button active state for pills", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "pills",
      slots: {
        X: [{ type: "html" }],
        Y: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    activateSlot(container, "Y");

    const buttons = container.querySelectorAll<HTMLElement>("[data-tab-bar] button[data-slot]");
    expect(buttons[0]!.dataset.active).toBeUndefined(); // X
    expect(buttons[1]!.dataset.active).toBe(""); // Y
  });

  it("updates button active state for sidebar", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "sidebar",
      slots: {
        Nav: [{ type: "html" }],
        Content: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    activateSlot(container, "Content");

    const buttons = container.querySelectorAll<HTMLElement>("[data-tab-bar] button[data-slot]");
    expect(buttons[0]!.dataset.active).toBeUndefined(); // Nav
    expect(buttons[1]!.dataset.active).toBe(""); // Content
  });

  it("works with stack (no header to update)", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "stack",
      slots: {
        Layer1: [{ type: "html" }],
        Layer2: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    const result = activateSlot(container, "Layer2");

    expect(result).toBe(true);
    const panels = container.querySelectorAll<HTMLElement>("[data-slot]");
    expect(panels[0]!.style.display).toBe("none"); // Layer1
    expect(panels[1]!.style.display).toBe(""); // Layer2
    // No header to update — no error
    expect(container.querySelector("[data-tab-bar]")).toBeNull();
  });

  it("works with carousel (no header to update)", () => {
    const target = document.createElement("div");
    const component: Component = {
      type: "carousel",
      slots: {
        Slide1: [{ type: "html" }],
        Slide2: [{ type: "html" }],
        Slide3: [{ type: "html" }],
      },
    };
    renderComponent(target, component);
    const container = target.firstElementChild as HTMLElement;

    const result = activateSlot(container, "Slide2");

    expect(result).toBe(true);
    const panels = container.querySelectorAll<HTMLElement>("[data-slot]");
    expect(panels[0]!.style.display).toBe("none"); // Slide1
    expect(panels[1]!.style.display).toBe(""); // Slide2
    expect(panels[2]!.style.display).toBe("none"); // Slide3
  });
});
